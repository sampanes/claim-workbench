// The portable local service. Owns persistence, recipes, and workflow
// orchestration. The native application, command-line tools, and tests all
// drive the same typed operations (ADR-0002).

import { randomBytes } from "node:crypto";
import {
  ARTIFACT_GENERATORS,
  applyAction,
  artifactFilename,
  buildManifest,
  createRun,
  detectDuplicates,
  evaluateRun,
  importCsv,
  issueApprovalToken,
  makeManifestEntry,
  newId,
  serviceLedgerFromPackets,
  validateRecipe,
  verifyArtifacts,
  WorkflowError
} from "@claim-workbench/core";
import { DiskArtifactStore, MemoryArtifactStore } from "./artifact-store.js";
import { Store } from "./store.js";

export class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export class ClaimService {
  constructor({ dbPath = ":memory:", artifactDir = null, recipes = [], approvalSecret = null, clock = Date, idFactory } = {}) {
    this.store = new Store(dbPath);
    this.artifacts = artifactDir ? new DiskArtifactStore(artifactDir) : new MemoryArtifactStore();
    // Approvals are deliberately ephemeral: a fresh secret per service
    // process means restarts invalidate outstanding approvals, never the
    // other way around.
    this.approvalSecret = approvalSecret ?? randomBytes(32).toString("hex");
    this.clock = clock;
    this.idFactory = idFactory ?? newId;
    this.recipes = new Map();
    for (const recipe of recipes) {
      const findings = validateRecipe(recipe);
      if (findings.some((finding) => finding.severity === "hard_stop")) {
        throw new ServiceError("RECIPE_INVALID",
          `Recipe ${recipe?.id ?? "(unknown)"} failed validation: ${findings.map((finding) => finding.message).join("; ")}`);
      }
      this.recipes.set(recipe.id, recipe);
    }
  }

  close() {
    this.store.close();
  }

  ping() {
    return { service: "claim-workbench", ok: true };
  }

  listRecipes() {
    return [...this.recipes.values()].map((recipe) => ({
      id: recipe.id, revision: recipe.revision, title: recipe.title, destinationId: recipe.destinationId
    }));
  }

  #recipeFor(recipeId) {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) throw new ServiceError("RECIPE_NOT_FOUND", `No recipe registered with id ${JSON.stringify(recipeId)}.`);
    return recipe;
  }

  #packet(packetId) {
    const packet = this.store.getPacket(packetId);
    if (!packet) throw new ServiceError("PACKET_NOT_FOUND", `No packet with id ${JSON.stringify(packetId)}.`);
    return packet;
  }

  #run(runId) {
    const run = this.store.getRun(runId);
    if (!run) throw new ServiceError("RUN_NOT_FOUND", `No run with id ${JSON.stringify(runId)}.`);
    return run;
  }

  // Import a source report. New packets are checked against all previously
  // stored work; duplicate findings are persisted on the incoming packets.
  importCsv({ csvText, mapping, sourceName }) {
    const { batch, packets, findings } = importCsv({
      csvText,
      mapping,
      sourceName,
      importedAt: new Date(this.clock.now()).toISOString(),
      idFactory: this.idFactory
    });
    const ledger = serviceLedgerFromPackets(this.store.listPackets());
    const reviews = detectDuplicates(ledger, packets);
    this.store.putBatch(batch);
    for (const packet of packets) this.store.putPacket(packet);
    return {
      batchId: batch.id,
      batch,
      findings,
      reviews,
      packets: packets.map((packet) => this.#summarize(packet))
    };
  }

  #summarize(packet) {
    return {
      id: packet.id,
      clientDisplayName: packet.client?.displayName ?? null,
      destinationId: packet.destination?.id ?? null,
      recipeId: packet.recipeId ?? null,
      period: packet.period ?? null,
      total: packet.total ?? null,
      workflowState: packet.workflowState,
      findingCounts: (packet.findings ?? []).reduce((counts, finding) => {
        counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
        return counts;
      }, {})
    };
  }

  listPackets() {
    return this.store.listPackets().map((packet) => this.#summarize(packet));
  }

  getPacket({ packetId }) {
    return this.#packet(packetId);
  }

  // Start a run for a packet, or resume the existing one. Workflow state
  // belongs to the packet and run, not to any open window.
  startRun({ packetId, mode }) {
    const packet = this.#packet(packetId);
    const existing = this.store.getRunForPacket(packetId);
    if (existing) return { run: existing, resumed: true };
    const recipe = this.#recipeFor(packet.recipeId);
    const run = createRun({ packet, recipe, mode, idFactory: this.idFactory, clock: this.clock });
    this.store.putRun(run);
    return { run, resumed: false };
  }

  getRun({ runId }) {
    return this.#run(runId);
  }

  getRunForPacket({ packetId }) {
    const run = this.store.getRunForPacket(packetId);
    if (!run) throw new ServiceError("RUN_NOT_FOUND", `No run exists for packet ${JSON.stringify(packetId)}.`);
    return run;
  }

  // Artifact verification findings for a packet that has a manifest.
  // Included in every evaluation so missing, stale, or tampered documents
  // block the workflow until regeneration.
  #artifactFindings(packet, recipe) {
    const manifest = packet.artifacts;
    if (!manifest || !Array.isArray(manifest.entries)) return [];
    const files = new Map();
    for (const entry of manifest.entries) {
      files.set(entry.filename, this.artifacts.read(entry.filename));
    }
    return verifyArtifacts({ packet, recipe, manifest, files });
  }

  // Generate every artifact the recipe requires, write the files, and
  // return the manifest. Content is deterministic; the manifest carries
  // the generation time and the packet fingerprint for freshness checks.
  #generateArtifacts(packet, recipe) {
    const generatedAt = new Date(this.clock.now()).toISOString();
    const entries = [];
    for (const required of recipe.requiredArtifacts ?? []) {
      const generator = ARTIFACT_GENERATORS[required.kind];
      if (!generator) {
        throw new ServiceError("ARTIFACT_GENERATOR_UNKNOWN",
          `No generator registered for artifact kind ${JSON.stringify(required.kind)}.`);
      }
      const content = generator.generate(packet);
      const filename = artifactFilename(packet, required.kind, generator.extension);
      this.artifacts.write(filename, content);
      entries.push(makeManifestEntry({
        artifactId: this.idFactory("artifact"),
        kind: required.kind,
        filename,
        mediaType: generator.mediaType,
        content,
        generatedAt
      }));
    }
    return buildManifest({ packet, entries, generatedAt });
  }

  evaluate({ runId, extraFindings = [] }) {
    const run = this.#run(runId);
    const packet = this.#packet(run.packetId);
    const recipe = this.#recipeFor(run.recipeId);
    return evaluateRun({
      packet, recipe, run,
      extraFindings: [...this.#artifactFindings(packet, recipe), ...extraFindings]
    });
  }

  act({ runId, action, payload = {}, actor = "operator", extraFindings = [] }) {
    const run = this.#run(runId);
    const packet = this.#packet(run.packetId);
    const recipe = this.#recipeFor(run.recipeId);

    let manifest = null;
    let combinedPayload = payload;
    if (action === "generate_artifacts") {
      manifest = this.#generateArtifacts(packet, recipe);
      packet.artifacts = manifest;
      combinedPayload = {
        ...payload,
        evidence: manifest.entries.map(({ kind, filename, sha256 }) => ({ kind, filename, sha256 }))
      };
    }

    const allFindings = [...this.#artifactFindings(packet, recipe), ...extraFindings];
    const { run: nextRun, events } = applyAction({
      packet, recipe, run, action, payload: combinedPayload, actor,
      extraFindings: allFindings,
      clock: this.clock, idFactory: this.idFactory
    });
    this.store.putRun(nextRun);
    if (manifest !== null || nextRun.state !== packet.workflowState) {
      packet.workflowState = nextRun.state;
      this.store.putPacket(packet);
    }
    this.store.appendAuditEvents(events);
    return {
      run: nextRun,
      events,
      evaluation: evaluateRun({
        packet, recipe, run: nextRun,
        extraFindings: [...this.#artifactFindings(packet, recipe), ...extraFindings]
      })
    };
  }

  listAuditEvents({ runId }) {
    return this.store.listAuditEvents(runId);
  }

  // The controlled boundary through which a worker session resolves packet
  // facts (docs/WORKER_PROTOCOL.md): exactly the fields destination
  // interaction needs, nothing else.
  workerFacts({ runId }) {
    const run = this.#run(runId);
    const packet = this.#packet(run.packetId);
    const manifest = packet.artifacts;
    const artifacts = [];
    if (manifest && Array.isArray(manifest.entries)) {
      for (const entry of manifest.entries) {
        const content = this.artifacts.read(entry.filename);
        if (content !== null) {
          artifacts.push({ kind: entry.kind, filename: entry.filename, content, sha256: entry.sha256 });
        }
      }
    }
    return {
      packetId: packet.id,
      memberId: packet.client?.externalIds?.sourceClientId ?? null,
      memberName: packet.client?.displayName ?? null,
      serviceRows: packet.serviceLines.map((line) => ({
        lineId: line.id,
        serviceDate: line.serviceDate,
        code: line.code,
        units: line.units ?? 1,
        amount: line.amount.amount
      })),
      expectedTotal: packet.total.amount,
      artifacts
    };
  }

  // Issue a short-lived approval for this run's irreversible step, bound to
  // the evidence digest the operator just reviewed. Only available when the
  // run reached UserReviewed with nothing blocking.
  requestApproval({ runId, evidenceDigest, destinationClass }) {
    const run = this.#run(runId);
    const recipe = this.#recipeFor(run.recipeId);
    if (typeof evidenceDigest !== "string" || !/^[0-9a-f]{64}$/.test(evidenceDigest)) {
      throw new ServiceError("INPUT_INVALID", "requestApproval needs the sha256 evidence digest the operator reviewed.");
    }
    const gatedStep = recipe.steps.find((step) => step.approvalGate === true);
    if (!gatedStep) {
      throw new ServiceError("RECIPE_INVALID", `Recipe ${recipe.id} has no approval-gated step.`);
    }
    // Recording the request also re-checks state and blocking findings.
    const { run: nextRun } = this.act({
      runId,
      action: "request_approval",
      payload: { evidence: { evidenceDigest, destinationClass } }
    });
    const token = issueApprovalToken({
      secret: this.approvalSecret,
      action: gatedStep.action,
      packetId: nextRun.packetId,
      runId: nextRun.id,
      stepId: gatedStep.id,
      evidenceDigest,
      destinationClass,
      clock: this.clock,
      idFactory: this.idFactory
    });
    return { token, stepId: gatedStep.id };
  }

  // Persist a captured receipt and advance the run. The receipt is required
  // evidence: completion is impossible without it.
  recordReceipt({ runId, receipt }) {
    const run = this.#run(runId);
    if (typeof receipt?.receiptId !== "string" || receipt.receiptId.length === 0 ||
        typeof receipt?.contentSha256 !== "string" || !/^[0-9a-f]{64}$/.test(receipt.contentSha256) ||
        typeof receipt?.capturedAt !== "string") {
      throw new WorkflowError("RECEIPT_MISSING",
        "A receipt needs receiptId, contentSha256, and capturedAt before it can be recorded.");
    }
    const result = this.act({ runId, action: "capture_receipt", payload: { evidence: receipt } });
    // Re-read the packet act() just persisted before attaching the receipt.
    const packet = this.#packet(run.packetId);
    packet.receipts = [...(packet.receipts ?? []), { ...receipt, recordedAt: new Date(this.clock.now()).toISOString() }];
    this.store.putPacket(packet);
    return result;
  }
}

export function toErrorPayload(error) {
  if (error instanceof ServiceError || error instanceof WorkflowError) {
    return { code: error.code, message: error.message };
  }
  return { code: "INTERNAL", message: error.message };
}

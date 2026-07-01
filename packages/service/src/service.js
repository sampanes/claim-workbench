// The portable local service. Owns persistence, recipes, and workflow
// orchestration. The native application, command-line tools, and tests all
// drive the same typed operations (ADR-0002).

import {
  ARTIFACT_GENERATORS,
  applyAction,
  artifactFilename,
  buildManifest,
  createRun,
  detectDuplicates,
  evaluateRun,
  importCsv,
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
  constructor({ dbPath = ":memory:", artifactDir = null, recipes = [], clock = Date, idFactory } = {}) {
    this.store = new Store(dbPath);
    this.artifacts = artifactDir ? new DiskArtifactStore(artifactDir) : new MemoryArtifactStore();
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
}

export function toErrorPayload(error) {
  if (error instanceof ServiceError || error instanceof WorkflowError) {
    return { code: error.code, message: error.message };
  }
  return { code: "INTERNAL", message: error.message };
}

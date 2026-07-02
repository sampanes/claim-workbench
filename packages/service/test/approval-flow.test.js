import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSequentialIdFactory } from "@claim-workbench/core";
import { startFakePortal } from "../../../examples/fake-portal/server.mjs";
import { HttpPageDriver } from "../../browser-worker/src/drivers/http-driver.js";
import { BrowserWorker } from "../../browser-worker/src/worker.js";
import { ClaimService } from "../src/service.js";

const exampleDir = new URL("../../../examples/synthetic-eap/", import.meta.url);
const SECRET = "service-approval-secret-0123456789";

async function fixtures() {
  return {
    csvText: await readFile(new URL("data/synthetic-eap-2026-06.csv", exampleDir), "utf8"),
    mapping: JSON.parse(await readFile(new URL("mapping.json", exampleDir), "utf8")),
    recipe: JSON.parse(await readFile(new URL("recipe.json", exampleDir), "utf8"))
  };
}

test("approval is only issued for a reviewed, unblocked run", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = new ClaimService({ recipes: [recipe], approvalSecret: SECRET, idFactory: createSequentialIdFactory() });
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const { run } = service.startRun({ packetId: packets[0].id, mode: "SubmitWithExplicitApproval" });
  assert.throws(
    () => service.requestApproval({ runId: run.id, evidenceDigest: "0".repeat(64), destinationClass: "review" }),
    (error) => error.code === "TRANSITION_INVALID"
  );
  assert.throws(
    () => service.requestApproval({ runId: run.id, evidenceDigest: "not-a-digest", destinationClass: "review" }),
    (error) => error.code === "INPUT_INVALID"
  );
  service.close();
});

test("a receipt without required evidence cannot be recorded", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = new ClaimService({ recipes: [recipe], approvalSecret: SECRET, idFactory: createSequentialIdFactory() });
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const { run } = service.startRun({ packetId: packets[0].id });
  assert.throws(
    () => service.recordReceipt({ runId: run.id, receipt: { receiptId: "SYN-RCPT-X" } }),
    (error) => error.code === "RECEIPT_MISSING"
  );
  service.close();
});

test("the first complete proof: import to receipt with explicit approval", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = new ClaimService({ recipes: [recipe], approvalSecret: SECRET });
  const portal = await startFakePortal();
  try {
    // Import and deterministic preparation.
    const { packets } = service.importCsv({ csvText, mapping, sourceName: "synthetic-eap-2026-06.csv" });
    const taylor = packets.find((packet) => packet.clientDisplayName === "Taylor Example");
    const { run } = service.startRun({ packetId: taylor.id, mode: "SubmitWithExplicitApproval" });
    service.act({ runId: run.id, action: "validate_packet" });
    service.act({ runId: run.id, action: "generate_artifacts" });
    service.act({ runId: run.id, action: "open_destination" });

    // The operator signs in and opens the member's claim; the worker gets
    // its facts only through the service boundary.
    const driver = new HttpPageDriver();
    await driver.open(`${portal.url}/portal`);
    await driver.submitForm("/portal/login", { username: "operator", password: "synthetic" });
    const facts = service.workerFacts({ runId: run.id });
    assert.equal(facts.memberId, "SYN-000123");
    assert.equal(facts.artifacts.length, 1, "the generated claim summary crosses the boundary");
    await driver.submitForm("/portal/claim/start", { memberId: facts.memberId });

    const worker = new BrowserWorker({ driver, recipe, facts, approvalSecret: service.approvalSecret });
    let commandCounter = 0;
    const command = (action, extras = {}) => ({
      protocolVersion: "1",
      commandId: `cmd_e2e_${++commandCounter}`,
      runId: run.id,
      packetId: taylor.id,
      recipeId: recipe.id,
      stepId: extras.stepId ?? "step-e2e",
      action,
      mode: "SubmitWithExplicitApproval",
      approvalToken: extras.approvalToken ?? null,
      input: extras.input
    });

    const read = await worker.handleCommand(command("readPage"));
    assert.equal(read.evidence.pageId, "claim-form");

    const matched = await worker.handleCommand(command("matchRecord"));
    assert.equal(matched.status, "succeeded");
    service.act({ runId: run.id, action: "match_record", payload: { evidence: matched.evidence } });

    const filled = await worker.handleCommand(command("fillServiceRows"));
    assert.equal(filled.status, "succeeded");
    service.act({ runId: run.id, action: "fill_service_rows", payload: { commandId: filled.commandId, evidence: filled.evidence } });

    const uploaded = await worker.handleCommand(command("uploadArtifact", { input: { kind: "claim-summary" } }));
    assert.equal(uploaded.status, "succeeded");
    service.act({ runId: run.id, action: "upload_artifact", payload: { evidence: uploaded.evidence } });

    const totals = await worker.handleCommand(command("verifyTotal"));
    assert.equal(totals.status, "succeeded");
    service.act({ runId: run.id, action: "compare_totals", payload: { evidence: totals.evidence } });

    service.act({ runId: run.id, action: "user_review" });
    assert.equal(service.getRun({ runId: run.id }).state, "UserReviewed");

    // The operator opens the review page; approval binds to what they see.
    const reviewLink = driver.currentPage().links.find((link) => link.includes("/portal/claim/review"));
    await driver.open(new URL(reviewLink, driver.currentPage().url).href);
    const { digest } = worker.submitEvidence();
    const { token, stepId } = service.requestApproval({ runId: run.id, evidenceDigest: digest, destinationClass: "review" });
    assert.equal(stepId, "submit");

    const submitted = await worker.handleCommand(command("submit", { stepId, approvalToken: token }));
    assert.equal(submitted.status, "succeeded");
    assert.match(submitted.evidence.receiptId, /^SYN-RCPT-/);
    service.act({ runId: run.id, action: "submit", payload: { approvalVerified: true, evidence: submitted.evidence } });

    const captured = await worker.handleCommand(command("captureReceipt"));
    assert.equal(captured.status, "succeeded");
    service.recordReceipt({ runId: run.id, receipt: captured.evidence });
    service.act({ runId: run.id, action: "complete" });

    const finalRun = service.getRun({ runId: run.id });
    assert.equal(finalRun.state, "Complete");
    const packet = service.getPacket({ packetId: taylor.id });
    assert.equal(packet.workflowState, "Complete");
    assert.equal(packet.receipts.length, 1);
    assert.equal(packet.receipts[0].receiptId, submitted.evidence.receiptId);

    // The audit history tells the whole story in order.
    const events = service.listAuditEvents({ runId: run.id });
    assert.ok(events.length >= 10);
    assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
    const summaries = events.map((event) => event.summary).join("\n");
    assert.match(summaries, /Validate packet completed/);
    assert.match(summaries, /Submit claim completed/);
  } finally {
    await portal.close();
    service.close();
  }
});

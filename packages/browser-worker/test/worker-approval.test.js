import test from "node:test";
import assert from "node:assert/strict";
import { issueApprovalToken } from "@claim-workbench/core";
import { command, setup } from "./helpers.mjs";

const SECRET = "worker-approval-secret-0123456789";

function fakeClock(startMs = Date.parse("2026-07-01T18:00:00Z")) {
  let now = startMs;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

async function reachReview(context) {
  const { worker, driver } = context;
  const filled = await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
  assert.equal(filled.status, "succeeded");
  const reviewLink = driver.currentPage().links.find((link) => link.includes("/portal/claim/review"));
  await driver.open(new URL(reviewLink, driver.currentPage().url).href);
}

function tokenFor(worker, clock, { ttlMs, overrides } = {}) {
  const current = worker.submitEvidence();
  assert.ok(current, "expected to be on the review page");
  return issueApprovalToken({
    secret: SECRET,
    action: "submit",
    packetId: "packet_0001",
    runId: "run_0001",
    stepId: "step-test",
    evidenceDigest: current.digest,
    destinationClass: "review",
    clock,
    ttlMs,
    ...overrides
  });
}

test("submission fails without approval and nothing is sent", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const blocked = await context.worker.handleCommand(command("submit"));
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.findings[0].code, "APPROVAL_REQUIRED");

    // The claim was not submitted: a proper approval still works afterwards.
    const token = tokenFor(context.worker, clock);
    const submitted = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(submitted.status, "succeeded");
    assert.match(submitted.evidence.receiptId, /^SYN-RCPT-/);
  } finally {
    await context.portal.close();
  }
});

test("submit verifies, submits, and lands on the receipt for capture", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const token = tokenFor(context.worker, clock);
    const submitted = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(submitted.status, "succeeded");
    assert.equal(submitted.evidence.submitted, true);
    assert.equal(submitted.evidence.observedTotal, "250.00");
    assert.deepEqual(submitted.nextActions, ["capture_receipt"]);

    const captured = await context.worker.handleCommand(command("captureReceipt"));
    assert.equal(captured.status, "succeeded");
    assert.equal(captured.evidence.receiptId, submitted.evidence.receiptId);
    assert.match(captured.evidence.contentSha256, /^[0-9a-f]{64}$/);
    assert.equal(captured.evidence.memberId, "SYN-000123");
  } finally {
    await context.portal.close();
  }
});

test("a stale approval cannot be used", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const token = tokenFor(context.worker, clock, { ttlMs: 60_000 });
    clock.advance(61_000);
    const result = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(result.status, "blocked");
    assert.equal(result.findings[0].code, "APPROVAL_EXPIRED");
  } finally {
    await context.portal.close();
  }
});

test("a used approval cannot be replayed", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const reviewUrl = context.driver.currentPage().url;
    const token = tokenFor(context.worker, clock);
    const first = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(first.status, "succeeded");

    await context.driver.open(reviewUrl);
    const replay = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(replay.status, "blocked");
    assert.equal(replay.findings[0].code, "APPROVAL_ALREADY_USED");
  } finally {
    await context.portal.close();
  }
});

test("changed evidence invalidates the approval", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const token = tokenFor(context.worker, clock);

    // The operator edits the claim after approval was granted.
    const reviewUrl = context.driver.currentPage().url;
    const claimLink = context.driver.currentPage().links.find((link) => link.includes("/portal/claim?"));
    await context.driver.open(new URL(claimLink, reviewUrl).href);
    const draft = context.driver.currentPage().forms.find((form) => form.action === "/portal/claim/add").fields.draft;
    await context.driver.submitForm("/portal/claim/add", {
      draft, serviceDate: "2026-06-20", code: "SYN-90834", units: "1", amount: "125.00"
    });
    await context.driver.open(reviewUrl);

    const result = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(result.status, "blocked");
    assert.equal(result.findings[0].code, "APPROVAL_EVIDENCE_MISMATCH");
  } finally {
    await context.portal.close();
  }
});

test("the destination's duplicate rejection surfaces as a finding", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    await reachReview(context);
    const reviewUrl = context.driver.currentPage().url;
    const first = await context.worker.handleCommand(command("submit", { approvalToken: tokenFor(context.worker, clock) }));
    assert.equal(first.status, "succeeded");

    // A fresh, valid approval on the already-submitted claim: the portal
    // itself rejects the duplicate.
    await context.driver.open(reviewUrl);
    const secondToken = tokenFor(context.worker, clock);
    const duplicate = await context.worker.handleCommand(command("submit", { approvalToken: secondToken }));
    assert.equal(duplicate.status, "failed");
    assert.equal(duplicate.findings[0].code, "DUPLICATE_SUBMISSION");
    assert.deepEqual(duplicate.nextActions, ["capture_receipt", "mark_manual"]);
  } finally {
    await context.portal.close();
  }
});

test("submit demands the review page and captureReceipt demands the receipt page", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { approvalSecret: SECRET, clock } });
  try {
    // Still on the claim form.
    const submitHere = await context.worker.handleCommand(command("submit"));
    assert.equal(submitHere.status, "blocked");
    const captureHere = await context.worker.handleCommand(command("captureReceipt"));
    assert.equal(captureHere.status, "blocked");
    assert.equal(captureHere.findings[0].code, "PAGE_UNKNOWN");
  } finally {
    await context.portal.close();
  }
});

test("a worker without an approval verifier cannot submit at all", async () => {
  const clock = fakeClock();
  const context = await setup({ worker: { clock } });
  try {
    await reachReview(context);
    const token = tokenFor(context.worker, clock);
    const result = await context.worker.handleCommand(command("submit", { approvalToken: token }));
    assert.equal(result.status, "blocked");
    assert.equal(result.findings[0].code, "APPROVAL_REQUIRED");
  } finally {
    await context.portal.close();
  }
});

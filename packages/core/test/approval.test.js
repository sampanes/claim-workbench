import test from "node:test";
import assert from "node:assert/strict";
import { evidenceDigest, issueApprovalToken, verifyApprovalToken } from "../src/approval.js";

const SECRET = "test-secret-material-0123456789";

function fakeClock(startMs) {
  let now = startMs;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

const BASE = {
  action: "submit",
  packetId: "packet_0001",
  runId: "run_0001",
  stepId: "submit",
  destinationClass: "review"
};

function issue(clock, digest, overrides = {}) {
  return issueApprovalToken({
    secret: SECRET,
    ...BASE,
    evidenceDigest: digest,
    clock,
    ...overrides
  });
}

test("a fresh token verifies exactly once", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const digest = evidenceDigest({ rows: ["a"], total: "250.00" });
  const token = issue(clock, digest);
  const used = new Set();

  const first = verifyApprovalToken({ token, secret: SECRET, expected: { ...BASE, evidenceDigest: digest }, clock, usedTokenIds: used });
  assert.equal(first.ok, true);
  const second = verifyApprovalToken({ token, secret: SECRET, expected: { ...BASE, evidenceDigest: digest }, clock, usedTokenIds: used });
  assert.equal(second.ok, false);
  assert.equal(second.code, "APPROVAL_ALREADY_USED");
});

test("a missing token is APPROVAL_REQUIRED", () => {
  const clock = fakeClock(Date.now());
  const result = verifyApprovalToken({ token: null, secret: SECRET, expected: { ...BASE, evidenceDigest: "0".repeat(64) }, clock });
  assert.equal(result.code, "APPROVAL_REQUIRED");
});

test("expiry is enforced against the verifier clock", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const digest = evidenceDigest({ total: "250.00" });
  const token = issue(clock, digest, { ttlMs: 60_000 });
  clock.advance(61_000);
  const result = verifyApprovalToken({ token, secret: SECRET, expected: { ...BASE, evidenceDigest: digest }, clock, usedTokenIds: new Set() });
  assert.equal(result.code, "APPROVAL_EXPIRED");
});

test("any tampering with bound fields breaks the signature", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const digest = evidenceDigest({ total: "250.00" });
  const token = issue(clock, digest);
  for (const key of ["action", "packetId", "runId", "stepId", "evidenceDigest", "destinationClass", "expiresAt"]) {
    const tampered = { ...token, [key]: key === "expiresAt" ? "2099-01-01T00:00:00.000Z" : "something-else" };
    const result = verifyApprovalToken({ token: tampered, secret: SECRET, expected: { ...BASE, evidenceDigest: digest }, clock, usedTokenIds: new Set() });
    assert.equal(result.code, "APPROVAL_BAD_SIGNATURE", `tampering with ${key} must break the mac`);
  }
});

test("a valid token for a different scope is rejected", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const digest = evidenceDigest({ total: "250.00" });
  const token = issue(clock, digest);
  const result = verifyApprovalToken({
    token, secret: SECRET,
    expected: { ...BASE, runId: "run_0002", evidenceDigest: digest },
    clock, usedTokenIds: new Set()
  });
  assert.equal(result.code, "APPROVAL_SCOPE_MISMATCH");
});

test("changed evidence invalidates an otherwise valid token", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const before = evidenceDigest({ rows: ["a", "b"], total: "250.00" });
  const after = evidenceDigest({ rows: ["a", "b", "c"], total: "375.00" });
  const token = issue(clock, before);
  const result = verifyApprovalToken({ token, secret: SECRET, expected: { ...BASE, evidenceDigest: after }, clock, usedTokenIds: new Set() });
  assert.equal(result.code, "APPROVAL_EVIDENCE_MISMATCH");
});

test("the wrong secret never verifies", () => {
  const clock = fakeClock(Date.parse("2026-07-01T18:00:00Z"));
  const digest = evidenceDigest({ total: "250.00" });
  const token = issue(clock, digest);
  const result = verifyApprovalToken({ token, secret: "another-secret-material-987654", expected: { ...BASE, evidenceDigest: digest }, clock, usedTokenIds: new Set() });
  assert.equal(result.code, "APPROVAL_BAD_SIGNATURE");
});

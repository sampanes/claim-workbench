// Approval tokens (Milestone 7). An irreversible command requires a
// short-lived approval bound to the command action, packet, run, step,
// evidence digest, and destination classification. Changing any of them
// invalidates the token; approval is an input to a command, never a
// mutable boolean stored in the worker (docs/WORKER_PROTOCOL.md).

import { canonicalJson } from "./canonical-json.js";
import { utcNow } from "./dates.js";
import { newId } from "./ids.js";
import { hmacSha256Hex, sha256Hex, timingSafeEqualHex } from "./sha256.js";

export const APPROVAL_TOKEN_VERSION = "1";
export const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;

export function evidenceDigest(evidence) {
  return sha256Hex(canonicalJson(evidence));
}

function tokenPayload(token) {
  return canonicalJson({
    tokenVersion: token.tokenVersion,
    tokenId: token.tokenId,
    action: token.action,
    packetId: token.packetId,
    runId: token.runId,
    stepId: token.stepId,
    evidenceDigest: token.evidenceDigest,
    destinationClass: token.destinationClass,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt
  });
}

export function issueApprovalToken({
  secret,
  action,
  packetId,
  runId,
  stepId,
  evidenceDigest: digest,
  destinationClass,
  ttlMs = DEFAULT_APPROVAL_TTL_MS,
  clock = Date,
  idFactory = newId
}) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new TypeError("Approval secrets must be at least 16 characters.");
  }
  for (const [name, value] of Object.entries({ action, packetId, runId, stepId, evidenceDigest: digest, destinationClass })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`Approval tokens require ${name}.`);
    }
  }
  const issuedAtMs = clock.now();
  const token = {
    tokenVersion: APPROVAL_TOKEN_VERSION,
    tokenId: idFactory("approval"),
    action,
    packetId,
    runId,
    stepId,
    evidenceDigest: digest,
    destinationClass,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + ttlMs).toISOString()
  };
  token.mac = hmacSha256Hex(secret, tokenPayload(token));
  return token;
}

// Verify a token against what is true right now. `usedTokenIds` is the
// caller's single-use ledger; verification succeeds at most once per token.
export function verifyApprovalToken({ token, secret, expected, clock = Date, usedTokenIds }) {
  const failure = (code, message) => ({ ok: false, code, message });

  if (token === null || token === undefined) {
    return failure("APPROVAL_REQUIRED", "No approval token was supplied for an irreversible action.");
  }
  if (typeof token !== "object" || token.tokenVersion !== APPROVAL_TOKEN_VERSION || typeof token.mac !== "string") {
    return failure("APPROVAL_BAD_SIGNATURE", "The approval token is malformed or from an unsupported version.");
  }
  if (!timingSafeEqualHex(hmacSha256Hex(secret, tokenPayload(token)), token.mac)) {
    return failure("APPROVAL_BAD_SIGNATURE", "The approval token failed signature verification.");
  }
  if (usedTokenIds?.has(token.tokenId)) {
    return failure("APPROVAL_ALREADY_USED", "This approval token was already used once.");
  }
  const nowMs = clock.now();
  if (!(Date.parse(token.expiresAt) > nowMs)) {
    return failure("APPROVAL_EXPIRED", `The approval expired at ${token.expiresAt}.`);
  }
  for (const key of ["action", "packetId", "runId", "stepId", "destinationClass"]) {
    if (token[key] !== expected[key]) {
      return failure("APPROVAL_SCOPE_MISMATCH",
        `The approval binds ${key} ${JSON.stringify(token[key])}, but the command carries ${JSON.stringify(expected[key])}.`);
    }
  }
  if (token.evidenceDigest !== expected.evidenceDigest) {
    return failure("APPROVAL_EVIDENCE_MISMATCH",
      "The evidence changed after this approval was granted; review the page and request a fresh approval.");
  }
  usedTokenIds?.add(token.tokenId);
  return { ok: true, tokenId: token.tokenId };
}

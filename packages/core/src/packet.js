// The normalized billing packet is the central domain object. This module
// owns its schema version, derived values, and fingerprints. Validation
// lives in validate-packet.js.

import { canonicalJson } from "./canonical-json.js";
import { amountToCents, makeMoney } from "./money.js";
import { sha256Hex } from "./sha256.js";

export const PACKET_SCHEMA_VERSION = "1";

export const WORKFLOW_STATES = Object.freeze([
  "Imported",
  "PacketValidated",
  "ArtifactsGenerated",
  "DestinationOpened",
  "RecordMatched",
  "FieldsFilled",
  "UserReviewed",
  "Submitted",
  "ReceiptCaptured",
  "Complete",
  "ManualHandlingRequired",
  "HardStopped"
]);

export function isWorkflowState(value) {
  return WORKFLOW_STATES.includes(value);
}

export function packetTotal(packet) {
  const currency = packet.serviceLines[0]?.amount?.currency ?? "USD";
  const cents = packet.serviceLines.reduce(
    (sum, line) => sum + amountToCents(line.amount.amount),
    0
  );
  return makeMoney(cents, currency);
}

// Fingerprint of the billing facts an operator would compare by hand. Used
// for duplicate detection provenance, artifact freshness, and approval
// evidence. Presentation-only fields do not participate.
export function packetFingerprint(packet) {
  return sha256Hex(canonicalJson({
    schemaVersion: packet.schemaVersion,
    clientId: packet.client?.id ?? null,
    externalIds: packet.client?.externalIds ?? {},
    destinationId: packet.destination?.id ?? null,
    recipeId: packet.recipeId ?? null,
    period: packet.period ?? null,
    serviceLines: packet.serviceLines.map((line) => ({
      serviceDate: line.serviceDate,
      code: line.code,
      units: line.units ?? 1,
      amount: line.amount
    }))
  }));
}

// Fingerprint of one normalized service line, independent of row order and
// import batch. clientKey should be the most stable client identifier the
// source provides.
export function serviceLineFingerprint(clientKey, line) {
  return sha256Hex(canonicalJson({
    clientKey,
    serviceDate: line.serviceDate,
    code: line.code,
    units: line.units ?? 1,
    amount: line.amount
  }));
}

// Audit events pair a human-readable summary with technical details under
// one identifier, so an operator-facing entry can be investigated without
// exposing implementation detail in the normal interface.

export const AUDIT_EVENT_SCHEMA_VERSION = "1";

export function makeAuditEvent({ id, runId, packetId, action, actor, at, summary, details }) {
  if (!id || !runId || !action || !at || !summary) {
    throw new TypeError("Audit events require id, runId, action, at, and summary");
  }
  return {
    eventVersion: AUDIT_EVENT_SCHEMA_VERSION,
    id,
    runId,
    packetId: packetId ?? null,
    action,
    actor: actor ?? "operator",
    at,
    summary,
    details: details ?? {}
  };
}

export function formatAuditEvent(event) {
  return `${event.at} ${event.actor}: ${event.summary}`;
}

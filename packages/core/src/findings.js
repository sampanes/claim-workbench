// Findings are the deterministic vocabulary of the workbench. Every finding
// code has one severity and one help topic so behavior, interface, and
// assistance cannot drift apart (ADR-0007).

export const SEVERITIES = Object.freeze({
  NOTICE: "notice",
  WARNING: "warning",
  HARD_STOP: "hard_stop"
});

const REGISTRY = new Map();

function defineFinding(code, severity, helpTopicId, defaultMessage) {
  REGISTRY.set(code, Object.freeze({ code, severity, helpTopicId, defaultMessage }));
}

// Packet structure and identity
defineFinding("PACKET_MALFORMED", SEVERITIES.HARD_STOP, "finding.packet_malformed",
  "The packet is not a readable billing packet document.");
defineFinding("PACKET_SCHEMA_UNSUPPORTED", SEVERITIES.HARD_STOP, "finding.packet_schema_unsupported",
  "The packet uses a schema version this application does not support.");
defineFinding("MISSING_REQUIRED_FIELD", SEVERITIES.HARD_STOP, "finding.missing_required_field",
  "A workflow-required field is missing.");
defineFinding("MISSING_PROVENANCE", SEVERITIES.WARNING, "finding.missing_provenance",
  "The packet does not record where its source data came from.");
defineFinding("INVALID_WORKFLOW_STATE", SEVERITIES.HARD_STOP, "finding.invalid_workflow_state",
  "The packet records a workflow state this application does not recognize.");

// Service lines
defineFinding("EMPTY_SERVICE_LINES", SEVERITIES.HARD_STOP, "finding.empty_service_lines",
  "The packet contains no service lines.");
defineFinding("DUPLICATE_SERVICE_LINE_ID", SEVERITIES.HARD_STOP, "finding.duplicate_service_line_id",
  "Two service lines share the same identifier.");
defineFinding("INVALID_SERVICE_DATE", SEVERITIES.HARD_STOP, "finding.invalid_service_date",
  "A service date is not a valid ISO 8601 calendar date.");
defineFinding("SERVICE_DATE_OUT_OF_PERIOD", SEVERITIES.WARNING, "finding.service_date_out_of_period",
  "A service date falls outside the packet billing period.");
defineFinding("INVALID_UNITS", SEVERITIES.HARD_STOP, "finding.invalid_units",
  "Service units must be a positive whole number.");
defineFinding("MISSING_SOURCE_ID", SEVERITIES.NOTICE, "finding.missing_source_id",
  "One or more service lines have no stable source identifier.");

// Money
defineFinding("MALFORMED_MONEY", SEVERITIES.HARD_STOP, "finding.malformed_money",
  "A money value is not a valid decimal amount.");
defineFinding("INVALID_CURRENCY", SEVERITIES.HARD_STOP, "finding.malformed_money",
  "A currency code is not a valid ISO 4217 code.");
defineFinding("CURRENCY_MISMATCH", SEVERITIES.HARD_STOP, "finding.currency_mismatch",
  "The packet mixes more than one currency.");
defineFinding("PACKET_TOTAL_INCONSISTENT", SEVERITIES.HARD_STOP, "finding.packet_total_inconsistent",
  "The declared packet total does not equal the sum of its service lines.");

export function findingDefinition(code) {
  const definition = REGISTRY.get(code);
  if (!definition) throw new Error(`Unknown finding code: ${code}`);
  return definition;
}

export function isKnownFindingCode(code) {
  return REGISTRY.has(code);
}

export function listFindingCodes() {
  return [...REGISTRY.keys()];
}

export function makeFinding(code, { message, path, data } = {}) {
  const definition = findingDefinition(code);
  const finding = {
    code,
    severity: definition.severity,
    message: message ?? definition.defaultMessage,
    helpTopicId: definition.helpTopicId
  };
  if (path !== undefined) finding.path = path;
  if (data !== undefined) finding.data = data;
  return finding;
}

export function hasHardStop(findings) {
  return findings.some((finding) => finding.severity === SEVERITIES.HARD_STOP);
}

export function countBySeverity(findings) {
  const counts = { notice: 0, warning: 0, hard_stop: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

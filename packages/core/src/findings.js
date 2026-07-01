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

// Import (Milestone 2)
defineFinding("IMPORT_MAPPING_INVALID", SEVERITIES.HARD_STOP, "finding.import_mapping_invalid",
  "The import column mapping is incomplete or unsupported.");
defineFinding("IMPORT_PARSE_ERROR", SEVERITIES.HARD_STOP, "finding.import_parse_error",
  "The source report could not be parsed.");
defineFinding("IMPORT_MISSING_COLUMN", SEVERITIES.HARD_STOP, "finding.import_missing_column",
  "The source report is missing a mapped column.");
defineFinding("IMPORT_EMPTY", SEVERITIES.HARD_STOP, "finding.import_empty",
  "The source report contains no data rows.");
defineFinding("IMPORT_ROW_INVALID", SEVERITIES.HARD_STOP, "finding.import_row_invalid",
  "A source row could not be normalized into a service line.");

// Destination pages and worker evidence (Milestones 5-7)
defineFinding("PAGE_UNKNOWN", SEVERITIES.HARD_STOP, "finding.page_unknown",
  "The current destination page is not recognized, so mutating actions are disabled.");
defineFinding("RECORD_MISMATCH", SEVERITIES.HARD_STOP, "finding.record_mismatch",
  "The destination shows a different identity than this packet bills for.");
defineFinding("TARGET_NOT_FOUND", SEVERITIES.WARNING, "finding.target_not_found",
  "An expected control is missing from a recognized page.");
defineFinding("TOTAL_MISMATCH", SEVERITIES.HARD_STOP, "finding.total_mismatch",
  "The packet total and destination total are different.");
defineFinding("WORKER_PAUSED", SEVERITIES.NOTICE, "finding.worker_paused",
  "The worker is paused; the command was not executed.");
defineFinding("WORKER_STOPPED", SEVERITIES.HARD_STOP, "finding.worker_stopped",
  "The emergency stop is active; no further commands will run in this worker.");
defineFinding("DUPLICATE_SUBMISSION", SEVERITIES.HARD_STOP, "finding.duplicate_submission",
  "The destination reports this claim was already submitted.");
defineFinding("RECEIPT_MISSING", SEVERITIES.HARD_STOP, "finding.receipt_missing",
  "A required submission receipt could not be captured.");

// Approval (Milestone 7)
defineFinding("APPROVAL_REQUIRED", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "This irreversible action requires a valid approval.");
defineFinding("APPROVAL_EXPIRED", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "The approval expired before the action ran.");
defineFinding("APPROVAL_EVIDENCE_MISMATCH", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "The evidence changed after approval was granted.");
defineFinding("APPROVAL_SCOPE_MISMATCH", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "The approval was granted for a different action, packet, run, or step.");
defineFinding("APPROVAL_BAD_SIGNATURE", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "The approval token failed verification.");
defineFinding("APPROVAL_ALREADY_USED", SEVERITIES.HARD_STOP, "finding.approval_invalid",
  "The approval token was already used once and cannot be reused.");

// Artifacts (Milestone 4)
defineFinding("ARTIFACT_MISSING", SEVERITIES.HARD_STOP, "finding.artifact_missing",
  "A required artifact does not exist.");
defineFinding("ARTIFACT_STALE", SEVERITIES.HARD_STOP, "finding.artifact_stale",
  "An artifact was generated before the current packet facts and must be regenerated.");
defineFinding("ARTIFACT_TAMPERED", SEVERITIES.HARD_STOP, "finding.artifact_tampered",
  "An artifact no longer matches its recorded hash.");

// Recipes (Milestone 3)
defineFinding("RECIPE_SCHEMA_UNSUPPORTED", SEVERITIES.HARD_STOP, "finding.recipe_invalid",
  "The recipe uses a schema version this application does not support.");
defineFinding("RECIPE_INVALID", SEVERITIES.HARD_STOP, "finding.recipe_invalid",
  "The recipe definition is incomplete or inconsistent.");
defineFinding("RECIPE_GATE_MISSING", SEVERITIES.HARD_STOP, "finding.recipe_invalid",
  "An irreversible recipe step declares no approval gate.");

// Duplicate detection (Milestone 2)
defineFinding("DUPLICATE_SERVICE", SEVERITIES.WARNING, "finding.duplicate_service",
  "A service line duplicates previously imported work.");
defineFinding("NEAR_DUPLICATE_SERVICE", SEVERITIES.WARNING, "finding.near_duplicate_service",
  "A service line closely matches previously imported work with changed content.");

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

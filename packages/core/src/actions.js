// The named-action vocabulary (see docs/INTERACTION_MODEL.md). Each action
// maps to one worker or service operation and one auditable result, and
// carries the assistance metadata required by ADR-0007: label, description,
// classification, preconditions, expected evidence, and likely failures.

const ACTION_LIST = [
  {
    id: "validate_packet",
    label: "Validate packet",
    description: "Run every deterministic schema and consistency rule against the packet.",
    helpTopicId: "action.validate_packet",
    classification: "read_only",
    preconditions: ["A packet is selected."],
    expectedEvidence: ["Findings list with stable codes and severities."],
    likelyFailureCodes: ["PACKET_TOTAL_INCONSISTENT", "MISSING_REQUIRED_FIELD", "MALFORMED_MONEY"]
  },
  {
    id: "generate_artifacts",
    label: "Generate artifacts",
    description: "Produce the documents this recipe requires and record their hashes in a manifest.",
    helpTopicId: "action.generate_artifacts",
    classification: "reversible",
    preconditions: ["The packet validated without hard stops."],
    expectedEvidence: ["Artifact manifest entries with file hashes and provenance."],
    likelyFailureCodes: ["ARTIFACT_STALE", "ARTIFACT_MISSING"]
  },
  {
    id: "open_destination",
    label: "Open destination",
    description: "Open the destination workspace in a visible browser session.",
    helpTopicId: "action.open_destination",
    classification: "read_only",
    preconditions: ["Required artifacts are generated and fresh."],
    expectedEvidence: ["Destination page classification."],
    likelyFailureCodes: ["PAGE_UNKNOWN"]
  },
  {
    id: "read_page",
    label: "Read page",
    description: "Classify the current destination page and report what it permits.",
    helpTopicId: "action.read_page",
    classification: "read_only",
    preconditions: ["A destination workspace is open."],
    expectedEvidence: ["URL, title, required text, and required controls observed."],
    likelyFailureCodes: ["PAGE_UNKNOWN"]
  },
  {
    id: "show_target",
    label: "Show target",
    description: "Highlight the relevant control on the page without changing any data.",
    helpTopicId: "action.show_target",
    classification: "read_only",
    preconditions: ["The current page is recognized."],
    expectedEvidence: ["The highlighted control exists on the page."],
    likelyFailureCodes: ["PAGE_UNKNOWN", "TARGET_NOT_FOUND"]
  },
  {
    id: "match_record",
    label: "Match record",
    description: "Confirm the destination shows the same client this packet bills for.",
    helpTopicId: "action.match_record",
    classification: "read_only",
    preconditions: ["The current page is recognized."],
    expectedEvidence: ["Matched identity fields, expected versus observed."],
    likelyFailureCodes: ["RECORD_MISMATCH", "PAGE_UNKNOWN"]
  },
  {
    id: "fill_one_row",
    label: "Fill one row",
    description: "Fill a single service row on the destination form.",
    helpTopicId: "action.fill_service_rows",
    classification: "reversible",
    preconditions: ["The record is matched.", "Assistance mode permits reversible steps."],
    expectedEvidence: ["Expected versus observed row values."],
    likelyFailureCodes: ["PAGE_UNKNOWN", "RECORD_MISMATCH"]
  },
  {
    id: "fill_service_rows",
    label: "Fill service rows",
    description: "Fill the destination form with this packet's service rows.",
    helpTopicId: "action.fill_service_rows",
    classification: "reversible",
    preconditions: ["The record is matched.", "Assistance mode permits reversible steps."],
    expectedEvidence: ["Expected versus observed row counts and values."],
    likelyFailureCodes: ["PAGE_UNKNOWN", "RECORD_MISMATCH", "TOTAL_MISMATCH"]
  },
  {
    id: "compare_totals",
    label: "Compare totals",
    description: "Compare the destination total against the packet total.",
    helpTopicId: "action.compare_totals",
    classification: "read_only",
    preconditions: ["Service rows are filled."],
    expectedEvidence: ["Expected and observed totals."],
    likelyFailureCodes: ["TOTAL_MISMATCH"]
  },
  {
    id: "upload_artifact",
    label: "Upload selected artifact",
    description: "Attach a generated artifact to the destination form.",
    helpTopicId: "action.upload_artifact",
    classification: "reversible",
    preconditions: ["The artifact exists, is fresh, and matches its manifest hash."],
    expectedEvidence: ["Uploaded file name and hash."],
    likelyFailureCodes: ["ARTIFACT_MISSING", "ARTIFACT_STALE", "ARTIFACT_TAMPERED"]
  },
  {
    id: "undo_fill",
    label: "Undo filled rows",
    description: "Clear the rows this workflow filled, returning the form to its pre-fill state.",
    helpTopicId: "action.undo_fill",
    classification: "reversible",
    preconditions: ["This run previously filled rows."],
    expectedEvidence: ["Observed empty rows after the undo."],
    likelyFailureCodes: ["PAGE_UNKNOWN"]
  },
  {
    id: "user_review",
    label: "Confirm review",
    description: "Record that a person reviewed the filled destination form against the packet.",
    helpTopicId: "action.user_review",
    classification: "human",
    preconditions: ["Totals were compared and match."],
    expectedEvidence: ["Reviewer identity and time."],
    likelyFailureCodes: []
  },
  {
    id: "request_approval",
    label: "Request approval",
    description: "Create a short-lived approval bound to the current evidence for one irreversible action.",
    helpTopicId: "action.request_approval",
    classification: "read_only",
    preconditions: ["The review is confirmed and nothing blocks the workflow."],
    expectedEvidence: ["Approval token bound to an evidence digest and expiry."],
    likelyFailureCodes: ["APPROVAL_EVIDENCE_MISMATCH"]
  },
  {
    id: "submit",
    label: "Submit claim",
    description: "Submit the prepared claim at the destination. This cannot be undone.",
    helpTopicId: "action.submit",
    classification: "irreversible",
    preconditions: ["A valid, unexpired approval token bound to the current evidence."],
    expectedEvidence: ["Destination confirmation and receipt identifier."],
    likelyFailureCodes: ["APPROVAL_REQUIRED", "APPROVAL_EXPIRED", "APPROVAL_EVIDENCE_MISMATCH", "DUPLICATE_SUBMISSION"]
  },
  {
    id: "capture_receipt",
    label: "Capture receipt",
    description: "Capture and hash the destination receipt and associate it with this packet.",
    helpTopicId: "action.capture_receipt",
    classification: "read_only",
    preconditions: ["The destination shows a receipt for this submission."],
    expectedEvidence: ["Receipt identifier, capture time, and content hash."],
    likelyFailureCodes: ["RECEIPT_MISSING"]
  },
  {
    id: "record_override",
    label: "Record override",
    description: "Record an explicit, reasoned override for one warning finding the recipe permits.",
    helpTopicId: "action.record_override",
    classification: "human",
    preconditions: ["The finding is a warning the recipe marks overridable."],
    expectedEvidence: ["Override reason, operator, and time in the audit history."],
    likelyFailureCodes: ["OVERRIDE_NOT_PERMITTED"]
  },
  {
    id: "resolve_missing_field",
    label: "Resolve missing information",
    description: "Provide a reviewed value for a required field or apply a recipe-defined exception.",
    helpTopicId: "action.resolve_missing_field",
    classification: "human",
    preconditions: ["A required field is missing."],
    expectedEvidence: ["The provided value and its provenance."],
    likelyFailureCodes: []
  },
  {
    id: "mark_manual",
    label: "Handle manually",
    description: "Route this packet to manual handling and stop automation for it.",
    helpTopicId: "action.mark_manual",
    classification: "human",
    preconditions: [],
    expectedEvidence: ["The reason recorded in the audit history."],
    likelyFailureCodes: []
  },
  {
    id: "report_unexpected_page",
    label: "Report unexpected page",
    description: "Record that the destination showed something the recipe does not recognize.",
    helpTopicId: "action.report_unexpected_page",
    classification: "read_only",
    preconditions: ["A destination workspace is open."],
    expectedEvidence: ["Observed URL, title, and page evidence."],
    likelyFailureCodes: []
  },
  {
    id: "set_assistance_mode",
    label: "Change assistance mode",
    description: "Raise or lower how much the workbench is allowed to do automatically.",
    helpTopicId: "action.set_assistance_mode",
    classification: "human",
    preconditions: ["The recipe permits the requested mode."],
    expectedEvidence: ["The mode change in the audit history."],
    likelyFailureCodes: ["MODE_NOT_ALLOWED"]
  },
  {
    id: "complete",
    label: "Complete packet",
    description: "Close out the packet after its receipt is captured.",
    helpTopicId: "action.complete",
    classification: "read_only",
    preconditions: ["A receipt is captured and associated."],
    expectedEvidence: [],
    likelyFailureCodes: ["RECEIPT_MISSING"]
  }
];

export const ACTIONS = new Map(ACTION_LIST.map((action) => [action.id, Object.freeze(action)]));

export function getAction(id) {
  return ACTIONS.get(id) ?? null;
}

export function isKnownAction(id) {
  return ACTIONS.has(id);
}

export function listActions() {
  return ACTION_LIST.slice();
}

export const ASSISTANCE_MODES = Object.freeze([
  "Observe",
  "Guide",
  "Prefill",
  "RunReversibleSteps",
  "StopBeforeSubmit",
  "SubmitWithExplicitApproval"
]);

// Modes at or above the named mode allow the behavior.
export function modeAtLeast(mode, requiredMode) {
  return ASSISTANCE_MODES.indexOf(mode) >= ASSISTANCE_MODES.indexOf(requiredMode);
}

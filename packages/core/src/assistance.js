// Contextual assistance content and retrieval (ADR-0007). Help topics are
// small, independently retrievable records keyed by stable IDs. Everything
// here works without a model; a model may only rephrase this content.

export const helpTopics = [
  // ---- Workflow states ----------------------------------------------------
  {
    id: "state.imported",
    title: "Packet imported",
    summary: "The packet has been created from source data and is ready for deterministic validation.",
    appliesWhen: { state: "Imported" },
    explanation: [
      "Review the packet identity, destination, and service-line total before opening a destination workflow.",
      "Validation findings decide whether the next action is available."
    ],
    allowedActions: ["validate_packet", "mark_manual"],
    neverSuggest: ["submit", "ignore_hard_stop"],
    related: ["action.validate_packet"]
  },
  {
    id: "state.packet_validated",
    title: "Packet validated",
    summary: "Deterministic validation passed and artifact generation is available.",
    appliesWhen: { state: "PacketValidated" },
    explanation: [
      "The packet satisfied every schema and consistency rule for its recipe.",
      "Generate required artifacts before opening the destination."
    ],
    allowedActions: ["generate_artifacts", "show_packet", "mark_manual"],
    neverSuggest: ["submit"],
    related: ["state.artifacts_generated"]
  },
  {
    id: "state.manual_handling_required",
    title: "Manual handling required",
    summary: "An operator chose to complete this packet outside the assisted workflow.",
    appliesWhen: { state: "ManualHandlingRequired" },
    explanation: [
      "Automation is stopped for this packet. The audit history records why it was routed to manual handling.",
      "Complete the work in the destination directly, then record the outcome."
    ],
    allowedActions: ["show_audit"],
    neverSuggest: ["submit", "fill_service_rows"],
    related: ["action.mark_manual"]
  },
  {
    id: "state.hard_stopped",
    title: "Hard stopped",
    summary: "A hard-stop finding blocks this packet until the underlying problem is fixed.",
    appliesWhen: { state: "HardStopped" },
    explanation: [
      "Hard stops cannot be overridden in the current run.",
      "Fix the source data or recipe conditions, then re-validate the packet."
    ],
    allowedActions: ["show_findings", "mark_manual"],
    neverSuggest: ["ignore_hard_stop", "submit"],
    related: ["finding.packet_total_inconsistent"]
  },

  // ---- Findings -----------------------------------------------------------
  {
    id: "finding.packet_malformed",
    title: "The packet cannot be read",
    summary: "The document is not a structurally valid billing packet.",
    appliesWhen: { findingCode: "PACKET_MALFORMED" },
    explanation: [
      "The file or message is missing the basic packet structure.",
      "Re-import the source data instead of editing the packet by hand."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["submit", "edit_packet_by_hand"],
    related: ["finding.packet_schema_unsupported"]
  },
  {
    id: "finding.packet_schema_unsupported",
    title: "Unsupported packet version",
    summary: "The packet was written by a newer or unknown application version.",
    appliesWhen: { findingCode: "PACKET_SCHEMA_UNSUPPORTED" },
    explanation: [
      "This application refuses to guess at unknown formats and never modifies the source data.",
      "Upgrade the application or re-import the source report with this version."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["edit_packet_by_hand"],
    related: ["finding.packet_malformed"]
  },
  {
    id: "finding.missing_required_field",
    title: "Required information is missing",
    summary: "A workflow-required field is absent and must be resolved before reversible automation can continue.",
    appliesWhen: { findingCode: "MISSING_REQUIRED_FIELD" },
    explanation: [
      "Enter a reviewed value, apply a recipe-defined not-required condition, or send the packet to manual handling.",
      "Do not infer required billing values from unrelated context."
    ],
    allowedActions: ["resolve_missing_field", "mark_manual"],
    neverSuggest: ["invent_value", "submit"],
    related: ["finding.missing_provenance"]
  },
  {
    id: "finding.missing_provenance",
    title: "Source provenance is missing",
    summary: "The packet does not record which import produced it.",
    appliesWhen: { findingCode: "MISSING_PROVENANCE" },
    explanation: [
      "Provenance links every packet to a source report and import batch for duplicate detection and audits.",
      "Re-import the data through a source adapter instead of building packets by hand."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["ignore_warning_silently"],
    related: ["finding.missing_source_id"]
  },
  {
    id: "finding.invalid_workflow_state",
    title: "Unknown workflow state",
    summary: "The packet records a workflow state this application does not recognize.",
    appliesWhen: { findingCode: "INVALID_WORKFLOW_STATE" },
    explanation: [
      "The packet may come from a newer application version.",
      "Do not continue the workflow until the state is understood."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["edit_packet_by_hand"],
    related: ["finding.packet_schema_unsupported"]
  },
  {
    id: "finding.empty_service_lines",
    title: "No service lines",
    summary: "The packet contains no billable service lines.",
    appliesWhen: { findingCode: "EMPTY_SERVICE_LINES" },
    explanation: [
      "A claim without service lines cannot be billed.",
      "Check the source report and the import column mapping."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["submit"],
    related: ["finding.missing_required_field"]
  },
  {
    id: "finding.duplicate_service_line_id",
    title: "Duplicate service line identifier",
    summary: "Two service lines share one identifier, so evidence cannot be matched reliably.",
    appliesWhen: { findingCode: "DUPLICATE_SERVICE_LINE_ID" },
    explanation: [
      "Service line identifiers must be unique inside a packet.",
      "Re-import the source data; do not delete lines by hand."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["edit_packet_by_hand"],
    related: ["finding.missing_source_id"]
  },
  {
    id: "finding.invalid_service_date",
    title: "Invalid service date",
    summary: "A service date is not a real ISO 8601 calendar date.",
    appliesWhen: { findingCode: "INVALID_SERVICE_DATE" },
    explanation: [
      "Dates must use the YYYY-MM-DD format and exist on the calendar.",
      "Fix the source report or the import column mapping, then re-import."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.service_date_out_of_period"]
  },
  {
    id: "finding.service_date_out_of_period",
    title: "Service date outside the billing period",
    summary: "A service happened outside the period this packet claims to cover.",
    appliesWhen: { findingCode: "SERVICE_DATE_OUT_OF_PERIOD" },
    explanation: [
      "Confirm whether the service belongs in this billing period.",
      "Proceeding requires an explicit recorded override when the recipe permits it."
    ],
    allowedActions: ["record_override", "mark_manual"],
    neverSuggest: ["ignore_warning_silently"],
    related: ["finding.invalid_service_date"]
  },
  {
    id: "finding.invalid_units",
    title: "Invalid service units",
    summary: "Service units must be a positive whole number.",
    appliesWhen: { findingCode: "INVALID_UNITS" },
    explanation: [
      "Check the source report for a malformed quantity column.",
      "Fix the source data, then re-import."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.malformed_money"]
  },
  {
    id: "finding.missing_source_id",
    title: "No stable source identifier",
    summary: "The source report did not provide a stable row identifier for every service.",
    appliesWhen: { findingCode: "MISSING_SOURCE_ID" },
    explanation: [
      "Duplicate detection falls back to content fingerprints, which still catch identical services.",
      "If the source system can export a row or claim identifier, add it to the column mapping."
    ],
    allowedActions: ["show_packet"],
    neverSuggest: ["invent_value"],
    related: ["finding.duplicate_service_line_id"]
  },
  {
    id: "finding.malformed_money",
    title: "Unreadable money value",
    summary: "An amount is not a valid decimal money value.",
    appliesWhen: { findingCode: "MALFORMED_MONEY" },
    explanation: [
      "Money must be a decimal string with exactly two fraction digits and an ISO 4217 currency code.",
      "Fix the source report or the import column mapping, then re-import."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value", "round_amounts"],
    related: ["finding.currency_mismatch"]
  },
  {
    id: "finding.currency_mismatch",
    title: "Mixed currencies",
    summary: "The packet mixes more than one currency.",
    appliesWhen: { findingCode: "CURRENCY_MISMATCH" },
    explanation: [
      "One packet must use one currency so totals stay meaningful.",
      "Split the source data by currency or fix the mapping, then re-import."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["convert_currency_silently"],
    related: ["finding.malformed_money"]
  },
  {
    id: "finding.packet_total_inconsistent",
    title: "Packet total does not add up",
    summary: "The declared packet total differs from the sum of its service lines.",
    appliesWhen: { findingCode: "PACKET_TOTAL_INCONSISTENT" },
    explanation: [
      "Compare the number of service lines and each decimal amount against the source report.",
      "Do not continue until the difference is resolved."
    ],
    allowedActions: ["show_service_rows", "mark_manual"],
    neverSuggest: ["ignore_hard_stop", "submit"],
    related: ["action.compare_totals"]
  },

  // ---- Actions ------------------------------------------------------------
  {
    id: "action.validate_packet",
    title: "Validate packet",
    summary: "Run every deterministic schema and consistency rule against the packet.",
    appliesWhen: { action: "validate_packet" },
    explanation: [
      "Validation reports findings with stable codes and severities.",
      "A hard stop blocks the workflow; a warning requires a recorded override when permitted."
    ],
    allowedActions: ["validate_packet"],
    neverSuggest: ["skip_validation"],
    related: ["state.packet_validated"]
  },
  {
    id: "action.compare_totals",
    title: "Compare totals",
    summary: "Compare the packet total with destination evidence before approval.",
    appliesWhen: { action: "compare_totals" },
    explanation: [
      "Confirm the number of service rows and each decimal amount.",
      "A mismatch is a hard stop until corrected or handled manually."
    ],
    allowedActions: ["show_service_rows", "mark_manual"],
    neverSuggest: ["submit_on_mismatch"],
    related: ["finding.packet_total_inconsistent"]
  },
  {
    id: "action.mark_manual",
    title: "Handle manually",
    summary: "Route this packet to manual handling and stop automation for it.",
    appliesWhen: { action: "mark_manual" },
    explanation: [
      "Use manual handling when data problems, destination surprises, or judgment calls make automation unsafe.",
      "The decision is recorded in the audit history and can be revisited later."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: [],
    related: ["state.manual_handling_required"]
  },
  {
    id: "action.resolve_missing_field",
    title: "Resolve missing information",
    summary: "Provide a reviewed value for a required field, or apply a recipe-defined exception.",
    appliesWhen: { action: "resolve_missing_field" },
    explanation: [
      "Enter a value for the current packet, reuse a reviewed stored value, or apply a recipe-defined not-required condition.",
      "The application never silently infers a required billing value."
    ],
    allowedActions: ["resolve_missing_field", "mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.missing_required_field"]
  }
];

const topicIndex = new Map(helpTopics.map((topic) => [topic.id, topic]));

export function getHelpTopic(id) {
  return topicIndex.get(id) ?? null;
}

export function findTopicForFinding(findingCode) {
  return helpTopics.find((topic) => topic.appliesWhen?.findingCode === findingCode) ?? null;
}

export function findTopicForState(state) {
  return helpTopics.find((topic) => topic.appliesWhen?.state === state) ?? null;
}

export function searchHelpTopics(query) {
  const needle = String(query).trim().toLowerCase();
  if (needle.length === 0) return [];
  return helpTopics.filter((topic) =>
    topic.id.toLowerCase().includes(needle) ||
    topic.title.toLowerCase().includes(needle) ||
    topic.summary.toLowerCase().includes(needle)
  );
}

export function renderHelpTopic(topic) {
  return [topic.title, topic.summary, ...topic.explanation.map((line) => `- ${line}`)].join("\n");
}

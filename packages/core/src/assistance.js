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

  {
    id: "state.artifacts_generated",
    title: "Artifacts generated",
    summary: "Required documents exist with recorded hashes; the destination can be opened.",
    appliesWhen: { state: "ArtifactsGenerated" },
    explanation: [
      "Each artifact is listed in the manifest with its hash and provenance.",
      "If packet facts change, artifacts must be regenerated before use."
    ],
    allowedActions: ["open_destination", "mark_manual"],
    neverSuggest: ["submit"],
    related: ["action.generate_artifacts"]
  },
  {
    id: "state.destination_opened",
    title: "Destination opened",
    summary: "A visible browser session shows the destination; the page must be recognized before anything else.",
    appliesWhen: { state: "DestinationOpened" },
    explanation: [
      "Log in manually if the destination asks; the workbench never stores website passwords.",
      "Match the record before any field is touched."
    ],
    allowedActions: ["read_page", "match_record", "report_unexpected_page", "mark_manual"],
    neverSuggest: ["fill_service_rows", "submit"],
    related: ["action.match_record"]
  },
  {
    id: "state.record_matched",
    title: "Record matched",
    summary: "The destination shows the same client this packet bills for.",
    appliesWhen: { state: "RecordMatched" },
    explanation: [
      "Matched identity evidence is recorded with the run.",
      "Reversible filling is now available when the assistance mode permits it."
    ],
    allowedActions: ["fill_service_rows", "show_target", "mark_manual"],
    neverSuggest: ["submit"],
    related: ["action.fill_service_rows"]
  },
  {
    id: "state.fields_filled",
    title: "Fields filled",
    summary: "Service rows are entered on the destination form and await comparison and review.",
    appliesWhen: { state: "FieldsFilled" },
    explanation: [
      "Compare totals before anyone reviews or approves.",
      "Everything filled so far can still be undone."
    ],
    allowedActions: ["compare_totals", "undo_fill", "user_review", "mark_manual"],
    neverSuggest: ["submit"],
    related: ["action.compare_totals", "action.undo_fill"]
  },
  {
    id: "state.user_reviewed",
    title: "Review confirmed",
    summary: "A person confirmed the filled form matches the packet; submission requires explicit approval.",
    appliesWhen: { state: "UserReviewed" },
    explanation: [
      "Request an approval bound to the current evidence to enable submission.",
      "Any change to the page or packet invalidates that approval."
    ],
    allowedActions: ["request_approval", "undo_fill", "mark_manual"],
    neverSuggest: ["submit_without_approval"],
    related: ["action.request_approval", "action.submit"]
  },
  {
    id: "state.submitted",
    title: "Submitted",
    summary: "The claim was submitted; the receipt must be captured before the packet is complete.",
    appliesWhen: { state: "Submitted" },
    explanation: [
      "Capture the destination receipt so the packet carries proof of submission.",
      "A missing receipt keeps the packet from completing."
    ],
    allowedActions: ["capture_receipt"],
    neverSuggest: ["submit"],
    related: ["action.capture_receipt"]
  },
  {
    id: "state.receipt_captured",
    title: "Receipt captured",
    summary: "The receipt is hashed and associated with the packet.",
    appliesWhen: { state: "ReceiptCaptured" },
    explanation: [
      "Completing the packet closes the workflow and keeps the audit history."
    ],
    allowedActions: ["complete"],
    neverSuggest: ["submit"],
    related: ["state.complete"]
  },
  {
    id: "state.complete",
    title: "Complete",
    summary: "The packet finished its workflow; records and receipts remain available.",
    appliesWhen: { state: "Complete" },
    explanation: [
      "No further actions are available on this run.",
      "The audit history and receipt stay with the packet."
    ],
    allowedActions: [],
    neverSuggest: ["submit"],
    related: []
  },

  // ---- Findings -----------------------------------------------------------
  {
    id: "finding.recipe_invalid",
    title: "The recipe cannot be used",
    summary: "The workflow recipe is incomplete, inconsistent, or from an unsupported version.",
    appliesWhen: { findingCode: "RECIPE_INVALID" },
    explanation: [
      "A broken recipe blocks every packet that uses it.",
      "Fix the recipe definition; packets and their data are unaffected."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["edit_packet_by_hand"],
    related: ["finding.packet_schema_unsupported"]
  },
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
    id: "finding.import_mapping_invalid",
    title: "The import mapping is not usable",
    summary: "The column mapping for this source is incomplete or uses an unsupported version.",
    appliesWhen: { findingCode: "IMPORT_MAPPING_INVALID" },
    explanation: [
      "The mapping must name the client, date, code, and amount columns and declare a currency.",
      "Fix the mapping configuration; do not edit the source report to match a broken mapping."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.import_missing_column"]
  },
  {
    id: "finding.import_parse_error",
    title: "The source report cannot be parsed",
    summary: "The file is not structurally valid CSV.",
    appliesWhen: { findingCode: "IMPORT_PARSE_ERROR" },
    explanation: [
      "Re-export the report from the source system.",
      "Check for a truncated download or an unclosed quoted field."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["edit_packet_by_hand"],
    related: ["finding.import_row_invalid"]
  },
  {
    id: "finding.import_missing_column",
    title: "A mapped column is missing",
    summary: "The source report does not contain a column the mapping requires.",
    appliesWhen: { findingCode: "IMPORT_MISSING_COLUMN" },
    explanation: [
      "The source system may have changed its export format.",
      "Update the column mapping or re-export the report, then import again."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.import_mapping_invalid"]
  },
  {
    id: "finding.import_empty",
    title: "The source report is empty",
    summary: "The report parsed correctly but contains no data rows.",
    appliesWhen: { findingCode: "IMPORT_EMPTY" },
    explanation: [
      "Check the export filters and date range in the source system.",
      "An empty import creates no packets."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: [],
    related: ["finding.import_parse_error"]
  },
  {
    id: "finding.import_row_invalid",
    title: "A source row could not be read",
    summary: "One or more rows could not be normalized, so the affected packet may be incomplete.",
    appliesWhen: { findingCode: "IMPORT_ROW_INVALID" },
    explanation: [
      "The row and its problems are listed in the finding details.",
      "Fix the source report and re-import; rows are never silently dropped from a billable packet."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: ["invent_value", "submit"],
    related: ["finding.import_parse_error"]
  },
  {
    id: "finding.duplicate_service",
    title: "Already imported",
    summary: "A service line exactly matches previously imported work.",
    appliesWhen: { findingCode: "DUPLICATE_SERVICE" },
    explanation: [
      "The finding details name the existing packet that already contains this service.",
      "If the service really happened twice, record an explicit override; otherwise exclude the duplicate."
    ],
    allowedActions: ["record_override", "mark_manual"],
    neverSuggest: ["submit", "ignore_warning_silently"],
    related: ["finding.near_duplicate_service"]
  },
  {
    id: "finding.near_duplicate_service",
    title: "Similar work already imported",
    summary: "A service line closely matches existing work but its content changed.",
    appliesWhen: { findingCode: "NEAR_DUPLICATE_SERVICE" },
    explanation: [
      "A changed amount or corrected source row usually means the source report was revised.",
      "Compare both versions and decide which one is billable before continuing."
    ],
    allowedActions: ["record_override", "mark_manual"],
    neverSuggest: ["submit", "ignore_warning_silently"],
    related: ["finding.duplicate_service"]
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

  {
    id: "finding.page_unknown",
    title: "This page is not recognized",
    summary: "The destination shows a page the recipe cannot identify, so nothing may be changed on it.",
    appliesWhen: { findingCode: "PAGE_UNKNOWN" },
    explanation: [
      "Recognition needs the URL, title, expected text, and expected controls to agree; a lookalike or partially loaded page fails on purpose.",
      "Read the page again once it finishes loading, or report it so the recipe can be updated."
    ],
    allowedActions: ["read_page", "report_unexpected_page", "mark_manual"],
    neverSuggest: ["fill_on_unknown_page", "submit"],
    related: ["action.read_page", "action.report_unexpected_page"]
  },
  {
    id: "finding.record_mismatch",
    title: "Wrong record on screen",
    summary: "The destination shows a different client than this packet bills for.",
    appliesWhen: { findingCode: "RECORD_MISMATCH" },
    explanation: [
      "Filling anything on the wrong member's claim is never acceptable.",
      "Open the correct record at the destination, then match again."
    ],
    allowedActions: ["match_record", "mark_manual"],
    neverSuggest: ["fill_on_mismatch", "submit"],
    related: ["action.match_record"]
  },
  {
    id: "finding.target_not_found",
    title: "Control not found",
    summary: "A control the workflow expected is missing from an otherwise recognized page.",
    appliesWhen: { findingCode: "TARGET_NOT_FOUND" },
    explanation: [
      "The destination may have changed its layout.",
      "Report the page so the recipe's expectations can be updated."
    ],
    allowedActions: ["read_page", "report_unexpected_page"],
    neverSuggest: ["fill_on_unknown_page"],
    related: ["finding.page_unknown"]
  },
  {
    id: "finding.total_mismatch",
    title: "Why do the totals not match?",
    summary: "The packet total and destination total are different.",
    appliesWhen: { findingCode: "TOTAL_MISMATCH" },
    explanation: [
      "Compare the number of service rows.",
      "Compare each amount against the packet.",
      "Do not continue until the difference is resolved."
    ],
    allowedActions: ["show_service_rows", "compare_totals", "mark_manual"],
    neverSuggest: ["ignore_hard_stop", "submit"],
    related: ["action.compare_totals"]
  },
  {
    id: "finding.worker_paused",
    title: "Assistance is paused",
    summary: "You paused browser assistance; commands wait until you resume.",
    appliesWhen: { findingCode: "WORKER_PAUSED" },
    explanation: [
      "Nothing was executed while paused.",
      "Resume when you are ready; the workflow continues from the same step."
    ],
    allowedActions: ["read_page"],
    neverSuggest: [],
    related: ["finding.worker_stopped"]
  },
  {
    id: "finding.worker_stopped",
    title: "Emergency stop is active",
    summary: "The emergency stop ended this assistance session; no further commands will run.",
    appliesWhen: { findingCode: "WORKER_STOPPED" },
    explanation: [
      "Pending and future commands were cancelled.",
      "Review the destination in the browser, then start a new session when ready."
    ],
    allowedActions: ["mark_manual"],
    neverSuggest: [],
    related: ["finding.worker_paused"]
  },
  {
    id: "finding.duplicate_submission",
    title: "Already submitted at the destination",
    summary: "The destination rejected the submission because this claim was already submitted.",
    appliesWhen: { findingCode: "DUPLICATE_SUBMISSION" },
    explanation: [
      "Capture the existing receipt instead of retrying.",
      "If no receipt is on file, investigate what was submitted and when before doing anything else."
    ],
    allowedActions: ["capture_receipt", "mark_manual"],
    neverSuggest: ["retry_submit_automatically", "submit"],
    related: ["action.capture_receipt"]
  },
  {
    id: "finding.receipt_missing",
    title: "No receipt captured",
    summary: "The workflow requires a submission receipt that could not be captured.",
    appliesWhen: { findingCode: "RECEIPT_MISSING" },
    explanation: [
      "A submission without its receipt cannot be completed or audited.",
      "Locate the receipt at the destination and capture it, or handle the packet manually."
    ],
    allowedActions: ["capture_receipt", "mark_manual"],
    neverSuggest: ["complete_without_receipt"],
    related: ["state.submitted"]
  },
  {
    id: "finding.approval_invalid",
    title: "Approval missing or no longer valid",
    summary: "The irreversible action did not run because its approval is absent, expired, used, or bound to different evidence.",
    appliesWhen: { findingCode: "APPROVAL_REQUIRED" },
    explanation: [
      "Approvals are short-lived and bound to the exact evidence you reviewed.",
      "Re-check the page, request a fresh approval, and submit while it is valid."
    ],
    allowedActions: ["request_approval", "mark_manual"],
    neverSuggest: ["submit_without_approval", "reuse_old_approval"],
    related: ["action.request_approval", "action.submit"]
  },
  {
    id: "finding.artifact_missing",
    title: "A required document is missing",
    summary: "A document this workflow requires does not exist or was never generated.",
    appliesWhen: { findingCode: "ARTIFACT_MISSING" },
    explanation: [
      "Documents are generated from packet facts; regenerate instead of hunting for the file.",
      "The workflow stays blocked until every required document exists and verifies."
    ],
    allowedActions: ["generate_artifacts", "mark_manual"],
    neverSuggest: ["upload_unverified_file", "submit"],
    related: ["finding.artifact_stale"]
  },
  {
    id: "finding.artifact_stale",
    title: "A document is out of date",
    summary: "Packet facts changed after this document was generated, so it no longer reflects the claim.",
    appliesWhen: { findingCode: "ARTIFACT_STALE" },
    explanation: [
      "A document can exist and still be invalid when it predates the services it describes.",
      "Regenerate the artifacts; the manifest will record the new hashes."
    ],
    allowedActions: ["generate_artifacts", "mark_manual"],
    neverSuggest: ["upload_unverified_file", "edit_artifact_by_hand"],
    related: ["finding.artifact_tampered"]
  },
  {
    id: "finding.artifact_tampered",
    title: "A document changed outside the workflow",
    summary: "The file on disk no longer matches the hash recorded when it was generated.",
    appliesWhen: { findingCode: "ARTIFACT_TAMPERED" },
    explanation: [
      "Someone or something modified the file after generation.",
      "Regenerate the artifacts and investigate how the file changed."
    ],
    allowedActions: ["generate_artifacts", "mark_manual"],
    neverSuggest: ["upload_unverified_file", "ignore_hard_stop"],
    related: ["finding.artifact_stale"]
  },

  // ---- Fields and artifacts ------------------------------------------------
  {
    id: "field.member_id",
    title: "Member ID",
    summary: "The destination's stable identifier for the client being billed.",
    appliesWhen: { field: "client.externalIds.sourceClientId" },
    explanation: [
      "This value comes from the source report and is used to match the destination record.",
      "If it is missing, fix the source report or the column mapping; never guess an identifier."
    ],
    allowedActions: ["resolve_missing_field", "mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["finding.missing_required_field", "action.match_record"]
  },
  {
    id: "field.member_name",
    title: "Member name",
    summary: "The client display name used to confirm the destination record.",
    appliesWhen: { field: "client.displayName" },
    explanation: [
      "The name supports record matching; the Member ID remains the authoritative identifier."
    ],
    allowedActions: ["resolve_missing_field", "mark_manual"],
    neverSuggest: ["invent_value"],
    related: ["field.member_id"]
  },
  {
    id: "artifact.claim_summary",
    title: "Claim summary document",
    summary: "A generated document summarizing the packet's services for this billing period.",
    appliesWhen: { artifactKind: "claim-summary" },
    explanation: [
      "The document is generated from packet facts and hashed into the manifest.",
      "If service lines change after generation, the document becomes stale and must be regenerated."
    ],
    allowedActions: ["generate_artifacts"],
    neverSuggest: ["edit_artifact_by_hand"],
    related: ["action.generate_artifacts"]
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
    id: "action.generate_artifacts",
    title: "Generate artifacts",
    summary: "Produce the recipe's required documents and record their hashes in a manifest.",
    appliesWhen: { action: "generate_artifacts" },
    explanation: [
      "Artifacts are generated from packet facts, never typed by hand.",
      "The manifest records a hash and provenance for every file so staleness and tampering are detectable."
    ],
    allowedActions: ["generate_artifacts"],
    neverSuggest: ["edit_artifact_by_hand"],
    related: ["state.artifacts_generated"]
  },
  {
    id: "action.open_destination",
    title: "Open destination",
    summary: "Open the destination workspace in a visible browser session.",
    appliesWhen: { action: "open_destination" },
    explanation: [
      "The browser stays visible and under your control at all times.",
      "Log in yourself if the destination asks; automation waits for you."
    ],
    allowedActions: ["open_destination"],
    neverSuggest: ["hide_browser"],
    related: ["state.destination_opened"]
  },
  {
    id: "action.read_page",
    title: "Read page",
    summary: "Classify the current page and report what it permits.",
    appliesWhen: { action: "read_page" },
    explanation: [
      "Classification combines the URL, title, required text, and required controls.",
      "Unknown or ambiguous pages disable every mutating action."
    ],
    allowedActions: ["read_page", "report_unexpected_page"],
    neverSuggest: ["fill_on_unknown_page"],
    related: ["action.report_unexpected_page"]
  },
  {
    id: "action.show_target",
    title: "Show target",
    summary: "Highlight the relevant control without changing page data.",
    appliesWhen: { action: "show_target" },
    explanation: [
      "Use this to locate a field before deciding what to do.",
      "Highlighting never types, clicks, or submits."
    ],
    allowedActions: ["show_target"],
    neverSuggest: [],
    related: ["action.read_page"]
  },
  {
    id: "action.match_record",
    title: "Match record",
    summary: "Confirm the destination shows the same client this packet bills for.",
    appliesWhen: { action: "match_record" },
    explanation: [
      "Identity fields are compared expected-versus-observed and recorded as evidence.",
      "An identity mismatch is a hard stop."
    ],
    allowedActions: ["match_record", "mark_manual"],
    neverSuggest: ["fill_on_mismatch"],
    related: ["state.record_matched"]
  },
  {
    id: "action.fill_service_rows",
    title: "Fill service rows",
    summary: "Enter this packet's service rows on the destination form.",
    appliesWhen: { action: "fill_service_rows" },
    explanation: [
      "Filling is reversible and only runs in a mode that permits it.",
      "The same fill command never runs twice; repeated requests return the original result."
    ],
    allowedActions: ["fill_service_rows", "undo_fill"],
    neverSuggest: ["submit"],
    related: ["state.fields_filled", "action.undo_fill"]
  },
  {
    id: "action.upload_artifact",
    title: "Upload selected artifact",
    summary: "Attach a generated artifact to the destination form.",
    appliesWhen: { action: "upload_artifact" },
    explanation: [
      "The file is verified against its manifest hash before upload.",
      "Stale or tampered artifacts are refused."
    ],
    allowedActions: ["upload_artifact"],
    neverSuggest: ["upload_unverified_file"],
    related: ["action.generate_artifacts"]
  },
  {
    id: "action.undo_fill",
    title: "Undo filled rows",
    summary: "Clear the rows this workflow filled and return the form to its pre-fill state.",
    appliesWhen: { action: "undo_fill" },
    explanation: [
      "Undo also reopens the comparison and review steps, since their evidence is no longer current."
    ],
    allowedActions: ["undo_fill"],
    neverSuggest: [],
    related: ["action.fill_service_rows"]
  },
  {
    id: "action.user_review",
    title: "Confirm review",
    summary: "Record that a person reviewed the filled form against the packet.",
    appliesWhen: { action: "user_review" },
    explanation: [
      "Review the rows and totals on the visible page, not a summary.",
      "Your confirmation is recorded with the run's evidence."
    ],
    allowedActions: ["user_review", "undo_fill"],
    neverSuggest: ["approve_without_looking"],
    related: ["state.user_reviewed"]
  },
  {
    id: "action.request_approval",
    title: "Request approval",
    summary: "Create a short-lived approval bound to the current evidence for one irreversible action.",
    appliesWhen: { action: "request_approval" },
    explanation: [
      "The approval encodes the packet, step, evidence digest, and an expiry.",
      "If anything changes before submission, the approval stops working."
    ],
    allowedActions: ["request_approval"],
    neverSuggest: ["reuse_old_approval"],
    related: ["action.submit"]
  },
  {
    id: "action.submit",
    title: "Submit claim",
    summary: "Submit the prepared claim at the destination. This cannot be undone.",
    appliesWhen: { action: "submit" },
    explanation: [
      "Submission requires a valid, unexpired approval bound to the exact current evidence.",
      "A duplicate submission attempt is rejected, not retried."
    ],
    allowedActions: ["submit"],
    neverSuggest: ["submit_without_approval", "retry_submit_automatically"],
    related: ["state.submitted", "action.capture_receipt"]
  },
  {
    id: "action.capture_receipt",
    title: "Capture receipt",
    summary: "Capture and hash the destination receipt and associate it with this packet.",
    appliesWhen: { action: "capture_receipt" },
    explanation: [
      "The receipt identifier, capture time, and content hash become part of the packet record.",
      "A required receipt that cannot be captured keeps the packet from completing."
    ],
    allowedActions: ["capture_receipt", "mark_manual"],
    neverSuggest: ["complete_without_receipt"],
    related: ["state.receipt_captured"]
  },
  {
    id: "action.record_override",
    title: "Record override",
    summary: "Record an explicit, reasoned override for one warning the recipe permits.",
    appliesWhen: { action: "record_override" },
    explanation: [
      "Overrides apply to warnings only; hard stops can never be overridden.",
      "The override, its reason, and who recorded it stay in the audit history."
    ],
    allowedActions: ["record_override"],
    neverSuggest: ["ignore_hard_stop"],
    related: ["finding.duplicate_service"]
  },
  {
    id: "action.report_unexpected_page",
    title: "Report unexpected page",
    summary: "Record that the destination showed something the recipe does not recognize.",
    appliesWhen: { action: "report_unexpected_page" },
    explanation: [
      "The observed URL, title, and page evidence are recorded for review.",
      "Mutating actions stay disabled until a recognized page is confirmed."
    ],
    allowedActions: ["report_unexpected_page", "mark_manual"],
    neverSuggest: ["fill_on_unknown_page"],
    related: ["action.read_page"]
  },
  {
    id: "action.set_assistance_mode",
    title: "Change assistance mode",
    summary: "Raise or lower how much the workbench may do automatically.",
    appliesWhen: { action: "set_assistance_mode" },
    explanation: [
      "Modes increase in explicit stages from Observe to SubmitWithExplicitApproval.",
      "Changing modes never clears a finding and never bypasses an approval gate."
    ],
    allowedActions: ["set_assistance_mode"],
    neverSuggest: ["ignore_hard_stop"],
    related: ["action.record_override"]
  },
  {
    id: "action.complete",
    title: "Complete packet",
    summary: "Close out the packet after its receipt is captured.",
    appliesWhen: { action: "complete" },
    explanation: [
      "Completion is only available once the receipt is captured and associated."
    ],
    allowedActions: ["complete"],
    neverSuggest: ["complete_without_receipt"],
    related: ["state.complete"]
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

export const CONTEXT_ENVELOPE_VERSION = "1";
export const DEFAULT_CONTEXT_BUDGET_BYTES = 8192;

// Build the compact, redacted context envelope the assistant receives
// (ADR-0007). Redaction is by construction: only stable identifiers,
// codes, labels, and topic IDs are copied. Packet facts, client names,
// and money amounts never enter the envelope unless a task-specific
// policy adds them deliberately.
export function buildContextEnvelope({ screen, evaluation, maxBytes = DEFAULT_CONTEXT_BUDGET_BYTES }) {
  const findings = evaluation.findings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    helpTopicId: finding.helpTopicId ?? null
  }));
  const availableActions = evaluation.availableActions.map((action) => ({
    id: action.id,
    label: action.label,
    helpTopicId: action.helpTopicId ?? null
  }));
  const topicIds = [...new Set([
    findTopicForState(evaluation.state)?.id,
    ...findings.map((finding) => finding.helpTopicId),
    ...availableActions.map((action) => action.helpTopicId)
  ].filter(Boolean))];

  const envelope = {
    contextVersion: CONTEXT_ENVELOPE_VERSION,
    screen,
    state: evaluation.state,
    mode: evaluation.mode ?? null,
    step: evaluation.nextStep
      ? { id: evaluation.nextStep.id, label: evaluation.nextStep.label, helpTopicId: evaluation.nextStep.helpTopicId ?? null }
      : null,
    findings,
    availableActions,
    helpTopics: topicIds
  };

  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
  if (bytes > maxBytes) {
    throw new Error(`Context envelope is ${bytes} bytes, over the ${maxBytes}-byte budget.`);
  }
  return envelope;
}

// Deterministic no-model assistance: render what the envelope supports and
// nothing else. A model may rephrase this text; it cannot add actions the
// envelope does not contain, and unsupported questions get an explicit
// insufficient-context answer instead of an invented one.
export function renderNoModelAnswer(envelope, question = null) {
  const lines = [];
  const citations = new Set();

  if (question !== null) {
    const normalized = String(question).toLowerCase();
    const matchedAction = envelope.availableActions.find((action) =>
      normalized.includes(action.label.toLowerCase()) || normalized.includes(action.id.replaceAll("_", " ")));
    const matchedTopic = envelope.helpTopics
      .map((id) => getHelpTopic(id))
      .filter(Boolean)
      .find((topic) => normalized.includes(topic.title.toLowerCase()));
    if (!matchedAction && !matchedTopic) {
      return {
        answer: "The supplied context does not cover that question. Use the workflow help topics, or ask about the current step, findings, or available actions.",
        citations: []
      };
    }
    if (matchedAction) {
      const topic = getHelpTopic(matchedAction.helpTopicId);
      if (topic) {
        citations.add(topic.id);
        lines.push(renderHelpTopic(topic));
      } else {
        lines.push(`${matchedAction.label} is currently available.`);
      }
    } else {
      citations.add(matchedTopic.id);
      lines.push(renderHelpTopic(matchedTopic));
    }
    return { answer: lines.join("\n"), citations: [...citations] };
  }

  lines.push(`Current state: ${envelope.state}.`);
  const stateTopic = findTopicForState(envelope.state);
  if (stateTopic) {
    citations.add(stateTopic.id);
    lines.push(stateTopic.summary);
  }
  if (envelope.step) {
    lines.push(`Next step: ${envelope.step.label}.`);
    if (envelope.step.helpTopicId) citations.add(envelope.step.helpTopicId);
  }
  for (const finding of envelope.findings) {
    const topic = finding.helpTopicId ? getHelpTopic(finding.helpTopicId) : null;
    if (topic) {
      citations.add(topic.id);
      lines.push(`Finding ${finding.code} (${finding.severity}): ${topic.summary}`);
    } else {
      lines.push(`Finding ${finding.code} (${finding.severity}).`);
    }
  }
  if (envelope.availableActions.length > 0) {
    lines.push(`Available actions: ${envelope.availableActions.map((action) => action.label).join(", ")}.`);
    for (const action of envelope.availableActions) {
      if (action.helpTopicId) citations.add(action.helpTopicId);
    }
  } else {
    lines.push("No actions are available in this state.");
  }
  return { answer: lines.join("\n"), citations: [...citations] };
}

// Auditable workflow state machine (Milestone 3). State transitions are
// explicit, recipe steps order the procedure, and blocking findings decide
// whether progress actions are available. A failed validation cannot be
// converted into success by explanatory output; only fixed data or a
// recorded, recipe-permitted override changes what is possible.

import { getAction, modeAtLeast, ASSISTANCE_MODES } from "./actions.js";
import { makeAuditEvent } from "./audit.js";
import { utcNow } from "./dates.js";
import { SEVERITIES } from "./findings.js";
import { evaluateRequiredFields } from "./recipe.js";
import { newId } from "./ids.js";
import { isWorkflowState } from "./packet.js";
import { validatePacket } from "./validate-packet.js";

export const RUN_SCHEMA_VERSION = "1";

export class WorkflowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}

// Progress actions per state. `null` targets mean the action is available
// in that state but does not change it (evidence-producing actions).
const STATE_ACTIONS = {
  Imported: { validate_packet: "PacketValidated" },
  PacketValidated: { generate_artifacts: "ArtifactsGenerated", validate_packet: null },
  ArtifactsGenerated: { open_destination: "DestinationOpened", generate_artifacts: null, validate_packet: null },
  DestinationOpened: { read_page: null, show_target: null, match_record: "RecordMatched", report_unexpected_page: null },
  RecordMatched: { read_page: null, show_target: null, fill_one_row: null, fill_service_rows: "FieldsFilled", report_unexpected_page: null },
  FieldsFilled: { read_page: null, compare_totals: null, upload_artifact: null, undo_fill: "RecordMatched", user_review: "UserReviewed", report_unexpected_page: null },
  UserReviewed: { request_approval: null, submit: "Submitted", undo_fill: "RecordMatched", report_unexpected_page: null },
  Submitted: { capture_receipt: "ReceiptCaptured" },
  ReceiptCaptured: { complete: "Complete" },
  Complete: {},
  ManualHandlingRequired: {},
  HardStopped: { validate_packet: "PacketValidated" }
};

const TERMINAL_STATES = new Set(["Complete", "ManualHandlingRequired"]);

// Actions available in any non-terminal state.
const UNIVERSAL_ACTIONS = new Set(["mark_manual", "record_override", "set_assistance_mode", "resolve_missing_field"]);

export function createRun({ packet, recipe, mode, idFactory, clock } = {}) {
  const makeId = idFactory ?? newId;
  const initialMode = mode ?? recipe.allowedModes[0];
  if (!recipe.allowedModes.includes(initialMode)) {
    throw new WorkflowError("MODE_NOT_ALLOWED", `Recipe ${recipe.id} does not allow mode ${initialMode}.`);
  }
  return {
    runVersion: RUN_SCHEMA_VERSION,
    id: makeId("run"),
    packetId: packet.id,
    recipeId: recipe.id,
    recipeRevision: recipe.revision,
    state: isWorkflowState(packet.workflowState) ? packet.workflowState : "Imported",
    mode: initialMode,
    completedSteps: [],
    overrides: [],
    evidence: {},
    startedAt: utcNow(clock ?? Date),
    updatedAt: utcNow(clock ?? Date)
  };
}

function dedupeFindings(findings) {
  const seen = new Set();
  const result = [];
  for (const finding of findings) {
    const key = `${finding.code}|${finding.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

function isOverridden(run, finding) {
  return run.overrides.some((override) =>
    override.findingCode === finding.code &&
    (override.path === undefined || override.path === null || override.path === finding.path)
  );
}

// Combine packet findings (import and duplicate review), schema validation,
// recipe-required fields, and any extra findings the caller supplies (for
// example artifact freshness). Classify which of them block progress.
export function collectFindings({ packet, recipe, run, extraFindings = [] }) {
  const combined = dedupeFindings([
    ...validatePacket(packet).findings,
    ...(packet.findings ?? []),
    ...evaluateRequiredFields(recipe, packet),
    ...extraFindings
  ]);
  const blocking = combined.filter((finding) => {
    if (finding.severity === SEVERITIES.HARD_STOP) return true;
    if (finding.severity === SEVERITIES.WARNING) {
      const overridable = (recipe.overridableWarnings ?? []).includes(finding.code);
      if (!overridable) return true;
      return !isOverridden(run, finding);
    }
    return false;
  });
  return { findings: combined, blocking };
}

function nextRecipeStep(recipe, run) {
  const completed = new Set(run.completedSteps.map((step) => step.stepId));
  return recipe.steps.find((step) => !completed.has(step.id)) ?? null;
}

// Deterministically evaluate what the workflow currently is and permits.
export function evaluateRun({ packet, recipe, run, extraFindings = [] }) {
  const { findings, blocking } = collectFindings({ packet, recipe, run, extraFindings });
  const stateActions = STATE_ACTIONS[run.state] ?? {};
  const nextStep = nextRecipeStep(recipe, run);
  const terminal = TERMINAL_STATES.has(run.state);

  const availableActions = [];
  if (!terminal) {
    for (const [actionId] of Object.entries(stateActions)) {
      const action = getAction(actionId);
      // Progress and evidence actions are blocked while blocking findings
      // exist. Deterministic re-checks (validate_packet) stay available.
      if (blocking.length > 0 && actionId !== "validate_packet") continue;
      // The recipe orders procedure: a state-changing action must also be
      // the next uncompleted recipe step when the recipe includes it.
      const isRecipeStepAction = recipe.steps.some((step) => step.action === actionId);
      if (isRecipeStepAction && nextStep && nextStep.action !== actionId) continue;
      availableActions.push(action);
    }
    for (const actionId of UNIVERSAL_ACTIONS) {
      availableActions.push(getAction(actionId));
    }
  }

  return {
    state: run.state,
    mode: run.mode,
    terminal,
    findings,
    blocking,
    nextStep: nextStep ? { id: nextStep.id, label: nextStep.label, action: nextStep.action, helpTopicId: nextStep.helpTopicId ?? null } : null,
    availableActions: availableActions.map((action) => ({
      id: action.id,
      label: action.label,
      classification: action.classification,
      helpTopicId: action.helpTopicId
    }))
  };
}

// Apply a named action to a run. Pure: returns { run, events } and never
// mutates its inputs. The caller persists both.
export function applyAction({ packet, recipe, run, action, payload = {}, extraFindings = [], actor = "operator", clock = Date, idFactory }) {
  const makeId = idFactory ?? newId;
  const at = utcNow(clock);
  const definition = getAction(action);
  if (!definition) throw new WorkflowError("UNKNOWN_ACTION", `Unknown action ${JSON.stringify(action)}.`);
  if (TERMINAL_STATES.has(run.state)) {
    throw new WorkflowError("RUN_TERMINAL", `Run ${run.id} is ${run.state} and accepts no further actions.`);
  }

  const next = structuredClone(run);
  next.updatedAt = at;
  const events = [];
  const record = (summary, details = {}) => {
    events.push(makeAuditEvent({
      id: makeId("event"),
      runId: run.id,
      packetId: run.packetId,
      action,
      actor,
      at,
      summary,
      details
    }));
  };

  // Universal actions first.
  if (action === "mark_manual") {
    if (typeof payload.reason !== "string" || payload.reason.trim() === "") {
      throw new WorkflowError("REASON_REQUIRED", "Manual handling requires a recorded reason.");
    }
    next.state = "ManualHandlingRequired";
    record(`Routed to manual handling: ${payload.reason}`, { reason: payload.reason });
    return { run: next, events };
  }
  if (action === "record_override") {
    const { findingCode, path, reason } = payload;
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new WorkflowError("REASON_REQUIRED", "An override requires a recorded reason.");
    }
    if (!(recipe.overridableWarnings ?? []).includes(findingCode)) {
      throw new WorkflowError("OVERRIDE_NOT_PERMITTED", `Recipe ${recipe.id} does not permit overriding ${findingCode}.`);
    }
    const { findings } = collectFindings({ packet, recipe, run, extraFindings });
    const target = findings.find((finding) => finding.code === findingCode && (path === undefined || finding.path === path));
    if (!target) {
      throw new WorkflowError("OVERRIDE_NOT_PERMITTED", `No current ${findingCode} finding to override.`);
    }
    if (target.severity !== SEVERITIES.WARNING) {
      throw new WorkflowError("OVERRIDE_NOT_PERMITTED", `${findingCode} is a ${target.severity} and cannot be overridden.`);
    }
    next.overrides.push({ findingCode, path: path ?? target.path ?? null, reason, actor, at });
    record(`Override recorded for ${findingCode}: ${reason}`, { findingCode, path: path ?? target.path ?? null, reason });
    return { run: next, events };
  }
  if (action === "set_assistance_mode") {
    const { mode } = payload;
    if (!ASSISTANCE_MODES.includes(mode) || !recipe.allowedModes.includes(mode)) {
      throw new WorkflowError("MODE_NOT_ALLOWED", `Recipe ${recipe.id} does not allow mode ${JSON.stringify(mode)}.`);
    }
    next.mode = mode;
    record(`Assistance mode set to ${mode}.`, { mode });
    return { run: next, events };
  }
  if (action === "resolve_missing_field") {
    throw new WorkflowError("NOT_IMPLEMENTED", "Field resolution requires re-importing corrected source data in this milestone.");
  }

  // State-machine actions.
  const stateActions = STATE_ACTIONS[run.state] ?? {};
  if (!(action in stateActions)) {
    throw new WorkflowError("TRANSITION_INVALID", `Action ${action} is not valid in state ${run.state}.`);
  }

  const { blocking } = collectFindings({ packet, recipe, run, extraFindings });
  if (blocking.length > 0 && action !== "validate_packet") {
    const hard = blocking.some((finding) => finding.severity === SEVERITIES.HARD_STOP);
    throw new WorkflowError(
      hard ? "BLOCKED_BY_HARD_STOP" : "OVERRIDE_REQUIRED",
      hard
        ? `${blocking.length} blocking finding(s) prevent ${action}. Hard stops cannot be overridden.`
        : `${blocking.length} warning finding(s) require a recorded override before ${action}.`
    );
  }

  // Validation is the one action that runs while findings block progress;
  // its outcome decides the state instead of following the happy path.
  if (action === "validate_packet" && blocking.length > 0) {
    const hardNow = blocking.some((finding) => finding.severity === SEVERITIES.HARD_STOP);
    if (hardNow) {
      next.state = "HardStopped";
      record("Validation found hard stops; the packet is blocked.", { blockingCount: blocking.length });
    } else {
      record("Validation found warnings that need recorded overrides.", { blockingCount: blocking.length });
    }
    return { run: next, events };
  }

  // The recipe orders the procedure for actions it includes.
  const nextStep = nextRecipeStep(recipe, run);
  const isRecipeStepAction = recipe.steps.some((step) => step.action === action);
  if (isRecipeStepAction) {
    if (!nextStep || nextStep.action !== action) {
      throw new WorkflowError("TRANSITION_INVALID",
        `Action ${action} is out of order. The next recipe step is ${nextStep ? `${nextStep.id} (${nextStep.action})` : "already complete"}.`);
    }
    if (nextStep.irreversible === true || nextStep.approvalGate === true) {
      // Approval verification is owned by the caller (service/worker);
      // the state machine only refuses to proceed without it.
      if (payload.approvalVerified !== true) {
        throw new WorkflowError("APPROVAL_REQUIRED", `Step ${nextStep.id} requires a verified approval.`);
      }
    }
    if (nextStep.minimumMode && !modeAtLeast(run.mode, nextStep.minimumMode)) {
      throw new WorkflowError("MODE_NOT_ALLOWED",
        `Step ${nextStep.id} requires assistance mode ${nextStep.minimumMode} or higher; current mode is ${run.mode}.`);
    }
    next.completedSteps.push({
      stepId: nextStep.id,
      action,
      at,
      commandId: payload.commandId ?? null,
      evidenceDigest: payload.evidenceDigest ?? null
    });
  }

  // Undoing filled rows also un-completes every step the undo invalidates,
  // so the recipe order requires re-filling, re-comparing, and re-reviewing.
  if (action === "undo_fill") {
    const undone = new Set(["fill_one_row", "fill_service_rows", "compare_totals", "upload_artifact", "user_review"]);
    next.completedSteps = next.completedSteps.filter((step) => !undone.has(step.action));
    for (const key of undone) delete next.evidence[key];
  }

  const target = stateActions[action];
  if (target !== null && target !== undefined) {
    next.state = target;
  }
  if (payload.evidence !== undefined) {
    next.evidence[action] = payload.evidence;
  }
  record(`${definition.label} completed.`, { target: next.state, evidence: payload.evidence ?? null });
  return { run: next, events };
}

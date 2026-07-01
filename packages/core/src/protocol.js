// Worker command/result protocol (docs/WORKER_PROTOCOL.md). The interface
// owns intent, the worker owns destination interaction; both sides validate
// every message that crosses the boundary.

export const WORKER_PROTOCOL_VERSION = "1";

export const RESULT_STATUSES = Object.freeze([
  "succeeded",
  "needs_approval",
  "blocked",
  "manual_required",
  "failed",
  "cancelled"
]);

export const WORKER_COMMANDS = Object.freeze({
  readPage: { mutates: false, minimumMode: "Observe" },
  showTarget: { mutates: false, minimumMode: "Guide" },
  matchRecord: { mutates: false, minimumMode: "Observe" },
  fillServiceRows: { mutates: true, minimumMode: "RunReversibleSteps" },
  verifyTotal: { mutates: false, minimumMode: "Observe" },
  uploadArtifact: { mutates: true, minimumMode: "RunReversibleSteps" },
  undoFill: { mutates: true, minimumMode: "RunReversibleSteps" },
  submit: { mutates: true, irreversible: true, minimumMode: "SubmitWithExplicitApproval" },
  captureReceipt: { mutates: false, minimumMode: "Observe" }
});

export function validateWorkerCommand(command) {
  const problems = [];
  if (typeof command !== "object" || command === null) {
    return ["Command must be an object."];
  }
  if (command.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    problems.push(`protocolVersion must be ${JSON.stringify(WORKER_PROTOCOL_VERSION)}.`);
  }
  for (const key of ["commandId", "runId", "packetId", "recipeId", "stepId", "action", "mode"]) {
    if (typeof command[key] !== "string" || command[key].length === 0) {
      problems.push(`${key} is required.`);
    }
  }
  if (typeof command.action === "string" && !(command.action in WORKER_COMMANDS)) {
    problems.push(`Unknown worker action ${JSON.stringify(command.action)}.`);
  }
  if (command.input !== undefined && (typeof command.input !== "object" || command.input === null || Array.isArray(command.input))) {
    problems.push("input must be an object when present.");
  }
  return problems;
}

export function makeWorkerResult({ command, status, summary, evidence = {}, findings = [], artifacts = [], nextActions = [], diagnostics = null }) {
  if (!RESULT_STATUSES.includes(status)) {
    throw new TypeError(`Unknown result status ${JSON.stringify(status)}`);
  }
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    commandId: command?.commandId ?? null,
    status,
    stepId: command?.stepId ?? null,
    summary,
    evidence,
    findings,
    artifacts,
    nextActions,
    diagnostics
  };
}

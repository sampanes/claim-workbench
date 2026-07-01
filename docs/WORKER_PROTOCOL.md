# Worker Protocol

## Boundary

The user interface owns intent. The worker owns destination interaction. The
recipe owns procedure. The packet owns facts. Validators own whether evidence
is sufficient to proceed.

Interface code must not directly execute browser selectors. It sends a named,
versioned command containing packet, recipe, run, and approval context.

## Command Shape

```json
{
  "protocolVersion": "1",
  "commandId": "cmd_01JEXAMPLE",
  "runId": "run_01JEXAMPLE",
  "packetId": "packet_01JEXAMPLE",
  "recipeId": "synthetic-eap-monthly",
  "stepId": "fill-service-lines",
  "action": "fillServiceRows",
  "mode": "RunReversibleSteps",
  "approvalToken": null,
  "input": {
    "serviceLineIds": ["service_1", "service_2"]
  }
}
```

The worker resolves packet facts through a controlled application boundary. A
command should not contain unrelated packet data.

## Result Shape

```json
{
  "protocolVersion": "1",
  "commandId": "cmd_01JEXAMPLE",
  "status": "needs_approval",
  "stepId": "fill-service-lines",
  "summary": "Filled 2 service rows. Observed total matches the packet.",
  "evidence": {
    "recordMatched": true,
    "serviceRowsExpected": 2,
    "serviceRowsObserved": 2,
    "expectedTotal": "250.00",
    "observedTotal": "250.00"
  },
  "findings": [],
  "artifacts": [],
  "nextActions": ["approve", "undo", "mark_manual"]
}
```

Monetary values are decimal strings with an explicit currency in the packet
schema. They must not be represented as binary floating-point values.

## Status Values

Initial result statuses are:

```text
succeeded
needs_approval
blocked
manual_required
failed
cancelled
```

`failed` means the command could not complete. `blocked` means a deterministic
rule prevents it. `manual_required` means the recipe intentionally transfers
control to the operator.

## Evidence

Success is not merely the absence of a browser error. Every mutating command
defines expected evidence, such as:

- destination page classification
- matched record fields
- expected and observed row counts
- expected and observed totals
- resulting field values
- downloaded artifact hash and media type
- receipt identifier and capture time

Evidence is structured for validation and summarized separately for display.

## Approval

An irreversible command requires a short-lived approval token bound to:

- command action
- packet and run
- recipe step
- evidence digest
- destination classification
- expiration time

Changing packet facts, page identity, totals, or evidence invalidates the token.
Approval is an input to a command, not a mutable boolean stored in the browser
worker.

## Idempotency And Retries

Commands declare whether they are read-only, reversible, idempotent, or
irreversible. Automatic retries are permitted only for read-only or explicitly
idempotent actions.

The same `commandId` must not perform a mutating action twice. Potentially
duplicated work returns a reviewable result instead of silently repeating or
discarding the action.

## Diagnostics

The result may reference technical diagnostics including screenshots, traces,
selectors, URLs, and content hashes. Diagnostics must follow configured
retention and redaction rules.

Human-readable audit events and technical diagnostics share command and run IDs
so an operator-facing event can be investigated without exposing implementation
details in the normal interface.

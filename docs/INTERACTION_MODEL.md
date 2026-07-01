# Interaction Model

## Purpose

Claim Workbench is a stateful operations console, not a chatbot wrapped around
a browser. It should always make four things clear:

- which packet is active
- what the application currently believes
- what the current page permits
- what the next safe action is

## Workspace Layout

The primary workspace consists of:

- a top bar for batch, packet, destination, page, safety mode, and next action
- a visible browser or destination workspace
- a workflow sidebar driven by recipe and run state
- a status strip for downloads, last action, errors, pause, and emergency stop

The sidebar presents:

1. Current step and expected page evidence
2. Read-only billing packet summary
3. Required fields and their provenance
4. Available named actions
5. Generated and received artifacts
6. Validation findings
7. Human-readable audit history

## Assistance Modes

Automation authority increases in explicit stages:

```text
Observe
Guide
Prefill
RunReversibleSteps
StopBeforeSubmit
SubmitWithExplicitApproval
```

A recipe may restrict which modes are available. Changing modes cannot clear a
validation failure or bypass an approval gate.

## Small, Named Actions

Early workflows should expose narrow actions such as:

- Read page
- Show target
- Match record
- Fill one row
- Fill service rows
- Compare totals
- Upload selected artifact
- Capture receipt
- Mark for manual handling
- Report unexpected page

Each action maps to one worker command and one auditable result. Broad
"automate everything" actions should be composed only after their individual
steps have reliable tests and evidence requirements.

`Show target` is a first-class guidance action. It highlights the relevant
control without changing page data.

## Packet Presentation

The packet summary is read-only by default. It shows facts and provenance before
the worker interacts with a destination.

Missing values require an explicit resolution:

- enter a value for the current packet
- reuse a reviewed stored value
- apply a recipe-defined not-required condition
- stop and handle the packet manually

The interface must not silently infer a required billing value.

## Page Awareness

Page classification combines:

- URL pattern
- document title
- required visible text
- required controls or fields

URL alone is insufficient because many destinations use generic routes or
single-page applications. Unknown or ambiguous pages disable mutating actions.

## Validation Severity

Findings use three levels:

- `notice`: informational and does not block progress
- `warning`: requires an explicit, recorded override when the recipe permits it
- `hard_stop`: blocks automation and cannot be overridden in the current run

Examples of hard stops include identity mismatch, missing required
authorization, destination mismatch, unresolved total mismatch, and an
unapproved irreversible action.

Artifact validation includes provenance and freshness. A document can exist and
still be invalid when it predates a service included in the packet.

## Progressive Disclosure

The normal interface uses plain operational language and a small set of
available actions. An advanced view may expose recipe IDs, selectors, raw
observations, screenshots, traces, hashes, and protocol payloads.

User-facing audit entries describe outcomes in readable language. Technical
diagnostics remain linked to the same event without dominating the workflow.

## Resumability

Workflow state belongs to a packet and run, not to the currently open window.
Reopening a packet restores its last completed step, pending approval,
validation findings, artifacts, and next safe actions.

The batch view groups packets by operational state, including ready, missing
information, in progress, manual handling, complete, and hard stopped.

# Architecture

## Design Principles

Claim Workbench is local-first, deterministic at its correctness boundaries,
and human-controlled at irreversible boundaries.

The system separates reusable workflow mechanics from configurable source,
artifact, and destination behavior. Integrations should extend stable
interfaces instead of adding payer-specific branches throughout the
application.

## Core Domain

The central object is a normalized `BillingPacket`. A packet describes:

- source records and their provenance
- client and billing identifiers required by the workflow
- service lines and amounts
- workflow recipe and destination
- required artifacts
- validation results and hard stops
- workflow progress
- receipts and audit events

Expected extension points include:

```text
SourceAdapter
WorkflowRecipe
ValidationRule
ArtifactGenerator
PortalAdapter
ApprovalGate
SubmissionReceipt
```

## Component Boundaries

### Portable Core

The portable core owns schemas, normalization, recipe evaluation, validation,
duplicate detection, state transitions, and audit event definitions. It should
be testable without a graphical interface or browser.

### Browser Worker

The browser worker uses Playwright to execute reversible workflow steps in a
visible browser. It receives structured instructions and returns structured
results. It must not bypass approval gates or silently submit claims.

The application sends named commands rather than allowing interface code to
manipulate pages directly. Examples include `readPage`, `matchRecord`,
`fillServiceRows`, `verifyTotal`, and `captureReceipt`. See the
[worker protocol](WORKER_PROTOCOL.md).

### Native macOS Application

The SwiftUI application presents packets, workflow progress, documents,
warnings, and available actions. Native integrations may include PDFKit, Quick
Look, Finder, and explicitly authorized automation bridges.

### Recipes And Adapters

Recipes define required fields, artifacts, validation rules, workflow steps,
allowed automation, and approval gates. Adapters translate source reports or
destination pages without changing the core domain model.

The workflow interface renders recipe state instead of maintaining a separate
informal checklist. See the [interaction model](INTERACTION_MODEL.md).

## Workflow States

The initial state model is:

```text
Imported
PacketValidated
ArtifactsGenerated
DestinationOpened
RecordMatched
FieldsFilled
UserReviewed
Submitted
ReceiptCaptured
Complete
ManualHandlingRequired
HardStopped
```

State transitions must be explicit and auditable. A failed validation cannot be
converted into success by explanatory AI output.

## Duplicate Prevention

Duplicate protection combines:

- import-batch provenance and source date ranges
- stable source identifiers when available
- normalized service-line fingerprints
- existing packet, claim, and receipt associations

Potential duplicates are reviewable records, not silently discarded data.

## Repository Shape

The top-level layout is:

```text
apps/
  macos/
  workbench/
packages/
  core/
  service/
  browser-worker/
examples/
  synthetic-eap/
  fake-portal/
schemas/
scripts/
docs/
```

The exact language and package boundaries will be finalized during the first
prototype, with preference given to simple cross-platform test execution and a
clean Swift integration boundary.

## Automation Boundary

Automation may navigate, read, highlight, fill, validate, download, and prepare.
An irreversible operation requires an `ApprovalGate` represented in both the
domain state and user interface.

Local AI may explain errors or summarize missing fields. It does not determine
claim validity, select unsupported billing codes, or authorize submission.

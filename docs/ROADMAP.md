# Roadmap

Every milestone ends with a runnable demonstration and automated acceptance
checks. Examples use synthetic data and local services only.

## Milestone 0: Reproducible Repository

Deliver:

- package and application directory structure
- pinned development toolchain
- Windows, Linux, and macOS CI
- bootstrap and verification commands
- one trivial test in each selected runtime
- deterministic help-topic rendering without a model

Acceptance:

```text
fresh clone -> bootstrap -> verify -> all supported checks pass
```

The macOS CI job compiles an empty SwiftUI application. The portable-core and
browser-worker test jobs pass on every supported operating system.

## Milestone 1: Billing Packet Core

Deliver:

- versioned billing packet schema
- service-line and money representations
- provenance fields
- synthetic valid and invalid packet fixtures
- command-line packet validator

Acceptance:

```text
synthetic source data -> normalized packet -> schema validation report
```

Tests prove valid packets pass; missing identifiers, invalid dates, malformed
money, and inconsistent totals fail with stable finding codes.

## Milestone 2: Import And Duplicate Detection

Deliver:

- generic CSV source adapter
- configurable column mapping
- import-batch provenance
- stable source-ID handling
- deterministic service fingerprints
- duplicate and near-duplicate review results

Acceptance:

```text
CSV import -> packets -> repeat overlapping import -> no duplicate work created
```

Tests cover reordered rows, overlapping date ranges, changed amounts, missing
source IDs, and repeated imports.

## Milestone 3: Recipes And Workflow State

Deliver:

- versioned workflow recipe schema
- recipe parser and validator
- required-field and artifact rules
- notice, warning, and hard-stop findings
- auditable workflow state machine
- persistence and resume behavior
- assistance metadata for fields, findings, actions, and states

Acceptance:

```text
packet + recipe -> available actions and findings -> restart -> same run state
```

Tests prove invalid transitions are rejected, hard stops cannot be overridden,
permitted warnings require a recorded override, and completed steps resume
correctly. Contextual help resolves by stable topic ID without requiring a
model.

## Milestone 4: Artifact Pipeline

Deliver:

- artifact-generator interface
- one synthetic document template
- deterministic filenames and folder layout
- artifact manifest with hashes and provenance
- freshness validation

Acceptance:

```text
packet -> generated document -> manifest -> hash and freshness verification
```

Tests prove repeatable output metadata, missing artifacts, stale artifacts,
tampering, and regeneration behavior are detected.

## Milestone 5: Fake Portal And Read-Only Worker

Deliver:

- local synthetic claim portal
- representative multi-row form and receipt page
- Playwright worker process
- page classification using URL, title, text, and controls
- `readPage`, `showTarget`, and `matchRecord` commands
- screenshots and traces on failure

Acceptance:

```text
worker opens fake portal -> classifies page -> highlights target -> returns evidence
```

Tests cover recognized, unknown, incomplete, and misleading pages. No command in
this milestone mutates billing fields.

## Milestone 6: Reversible Browser Assistance

Deliver:

- `fillServiceRows`, `verifyTotal`, `uploadArtifact`, and undo behavior
- structured command and result protocol
- command idempotency
- expected-versus-observed evidence
- pause and emergency-stop behavior

Acceptance:

```text
packet -> fill fake portal -> verify rows and total -> stop before submission
```

Tests prove a repeated command cannot fill twice, mismatches block progress,
unknown pages disable mutation, and cancellation stops pending work.

## Milestone 7: Approval And Receipt Loop

Deliver:

- irreversible-action classification
- short-lived approval tokens bound to evidence
- explicit synthetic submit action
- receipt capture, hashing, and packet association
- human-readable and technical audit records
- compact redacted assistance context envelopes

Acceptance:

```text
validated portal state -> explicit approval -> synthetic submit -> verified receipt
```

Tests prove submission fails without approval, stale approval cannot be reused,
changed evidence invalidates approval, duplicate submission is rejected, and a
required missing receipt prevents completion. Assistance tests prove a model
cannot expose unavailable actions or reinterpret approval state.

This is the first complete proof:

```text
import -> packet -> validate -> generate -> assist -> approve -> receipt
```

## Interim Gate: First Real-Destination Preview

This gate precedes Milestone 8. It proves the portable stack against one real,
private destination configuration before native-application work begins, and it
establishes the boundary that keeps real deployment data out of this public
repository.

Deliver:

- a private overlay for real recipes, adapters, mappings, and data, kept
  entirely outside this public repository (a private location or ignored local
  paths)
- a documented data-handling boundary: the public tree holds synthetic data
  only; all real configuration and data live in the private overlay
- real-data and secret scanning in CI and a pre-commit hook, so no real
  identifiers, credentials, or captured destination content can be committed here
- one real, private destination configuration exercised end to end through the
  dependency-light browser workbench on the operator's own machine

Acceptance:

```text
private real configuration -> import -> validate -> generate -> assist -> approve -> receipt
```

The public repository must contain no real data, credentials, or captured
destination content at any commit. The scanning checks introduced here are a
standing requirement that the release gate depends on.

## Near-Term Capability: Batch Completeness Reconciliation

A deterministic completeness layer over a billing period. Packet validation
answers "is this packet correct?"; reconciliation answers "did every item that
should have been billed this period get a packet and reach its required state?"
No model is involved.

Deliver:

- an expected-work-set input for a period: the source of record for who and what
  should be billed, with configurable mapping like the CSV import adapter
- deterministic coverage comparison of the expected set against the packets
  produced for the period
- findings for missing items (an expected entity with no packet), incomplete
  items (a packet that has not reached its required state), and schedule notices
  (an expected destination not advanced by its usual point in the period)
- a period summary grouped by state, reusing the batch view and duplicate
  fingerprints

Acceptance:

```text
expected work set + period -> coverage report -> every missing or incomplete item listed
```

Tests cover a fully covered period, missing entities, entities present but not
advanced, reordered and partial expected sets, and repeated runs producing an
identical report.

## Milestone 8: Native macOS Workbench

Deliver:

- SwiftUI batch dashboard
- packet and finding views
- recipe-driven action sidebar
- browser-worker process bridge
- document preview and Finder integration
- resumable synthetic workflow

Acceptance:

```text
fresh Mac clone -> verify -> launch -> complete synthetic workflow in the UI
```

GitHub-hosted macOS CI builds and tests the application. Physical-Mac validation
covers permissions, Finder, Quick Look or PDFKit, installed-browser behavior,
and visual interaction quality.

### Delivery Strategy

Native-platform validation is the slowest feedback loop in this project, so
Milestone 8 is delivered with explicit risk controls rather than by iterating
directly on the target platform:

- Maximize logic that macOS CI can build and test headlessly (view models, the
  service and stdio bridge, and state handling), so most regressions are caught
  without a physical device.
- Prove each operator interaction flow on the cross-platform browser workbench
  first, then port the validated flow to SwiftUI. The native application should
  re-skin a proven interaction model, not discover it on the target platform.
- Keep a dedicated validation device for the target platform, independent of any
  single deployment machine, so validation is never blocked on device
  availability.
- Run a written physical-platform validation checklist for what CI cannot cover:
  permissions, Finder, Quick Look or PDFKit, installed-browser behavior, and
  visual quality.

## Milestone 9: Adapter SDK And Example Integration

Deliver:

- documented source, artifact, and destination adapter interfaces
- synthetic behavioral-health EAP example
- recipe authoring validation
- compatibility test kit
- extension development guide
- assistance-topic compatibility checks

Acceptance:

```text
new example adapter -> compatibility suite -> visible in the native workbench
```

Tests prove an adapter cannot bypass packet validation, approval gates, audit
events, destination allowlists, receipt requirements, or assistance metadata.

Validate recipe and adapter expressiveness against several real destination
procedures early, not only the synthetic example, so that destination variety is
absorbed by configuration rather than by branches in the core.

## Release Gate

The first tagged preview requires:

- Milestones 0 through 9 passing in CI
- no real credentials, claims, identities, contracts, or portal captures
- documented threat model and data-retention defaults
- dependency and secret scanning
- tested backup, export, and local-data deletion behavior
- passing no-model assistance and small-model grounding evaluations
- signed release artifacts treated separately from normal development builds

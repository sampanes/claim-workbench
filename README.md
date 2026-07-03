# Claim Workbench

Claim Workbench is a local-first, human-in-the-loop toolkit for building
repeatable healthcare claim workflows.

It turns source reports into normalized billing packets, validates those
packets with deterministic rules, generates supporting artifacts, and assists
with visible browser workflows. Irreversible actions remain under explicit
human control.

## Project Goals

- Normalize billing data from configurable source adapters.
- Describe payer and destination workflows as versioned recipes.
- Catch missing, inconsistent, and duplicate claim data before submission.
- Generate reproducible documents and audit artifacts.
- Assist with browser-based data entry without hiding the browser.
- Stop at explicit approval gates before irreversible actions.
- Run locally with synthetic examples and no external service dependency.
- Provide a native macOS experience backed by a portable core.

## Planned Components

- **Billing packet schema** for normalized clients, services, claims, and
  artifacts
- **Source adapters** for CSV files and report exports
- **Recipe engine** for required fields, validations, workflow steps, and hard
  stops
- **Artifact pipeline** for documents, manifests, receipts, and audit logs
- **Browser worker** using Playwright against visible, user-controlled sessions
- **SwiftUI application** for the native macOS workflow
- **Fake portal** and synthetic fixtures for safe end-to-end testing

## Safety Model

Claim Workbench treats billing correctness as deterministic application logic,
not an AI decision.

- Validation rules and workflow recipes determine whether work can proceed.
- Browser assistance remains visible and interruptible.
- Submission and other irreversible operations require explicit approval.
- Every workflow produces a local audit trail.
- Examples and automated tests use synthetic data.

## Development Status

Roadmap milestones 0 through 7 are implemented in the portable stack, and
the first complete proof runs end to end against the synthetic portal in
the automated test suite:

```text
import -> normalize -> validate -> generate -> assist -> approve -> receipt
```

The native macOS workbench (Milestone 8) is a compiled placeholder shell;
the adapter SDK (Milestone 9) is not started.

See [Architecture](docs/ARCHITECTURE.md),
[architecture decisions](docs/adr/README.md),
[current audit](docs/AUDIT.md),
[contextual assistance](docs/ASSISTANCE.md),
[Interaction model](docs/INTERACTION_MODEL.md),
[Worker protocol](docs/WORKER_PROTOCOL.md),
[roadmap](docs/ROADMAP.md),
[macOS setup](docs/MAC_SETUP.md), and [Contributing](CONTRIBUTING.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Repository Layout

- `packages/core` — the portable domain: packet schema and validation with
  stable finding codes, decimal-string money, CSV import and duplicate
  detection, versioned recipes, the auditable workflow state machine,
  artifact manifests and freshness, approval tokens, the worker protocol,
  and contextual assistance (help topics, redacted context envelopes,
  no-model rendering). Includes the `claim-validate` command-line packet
  validator.
- `packages/service` — the local service that owns SQLite persistence,
  artifact storage, approval issuance, and receipts, exposed as typed
  operations and as one JSON message per line over stdio (ADR-0002).
- `packages/browser-worker` — the worker process: page classification that
  requires URL, title, text, and controls to agree, read-only and
  reversible commands with expected-versus-observed evidence, approval
  verification before submission, and pause/emergency stop. Drivers share
  one observation surface (ADR-0008): an HTTP driver used by the tests and
  a lazily-loaded Playwright driver for visible browser sessions.
- `apps/workbench` — a dependency-light browser shell that drives the real
  core state machine on synthetic data: recipe-ordered steps, findings
  with recorded overrides, approval-gated submission, contextual help, and
  the audit history.
- `apps/macos` — the SwiftUI application shell, compiled and tested by the
  macOS CI job.
- `examples/synthetic-eap` — synthetic source reports, column mapping, and
  the workflow recipe. `examples/fake-portal` — the local synthetic claim
  portal used for end-to-end tests.
- `schemas/` — versioned JSON Schema contracts for packets, findings,
  recipes, worker commands and results, approval tokens, artifact
  manifests, audit events, and assistance context envelopes.

## Running It

```sh
corepack enable pnpm   # Windows: needs an elevated shell once; or prefix commands with `corepack pnpm ...`
pnpm install
pnpm -r test          # every package's test suite
pnpm -r build         # syntax checks and the browser bundle
pnpm --filter @claim-workbench/workbench dev   # interactive shell at http://localhost:5173
node examples/fake-portal/server.mjs --port 8788   # synthetic portal (password: synthetic)
node packages/core/src/cli.js packages/core/fixtures/valid-packet.json   # CLI validator
```

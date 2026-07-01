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

The project is in its initial architecture and prototype phase. The first
milestone will prove this workflow:

```text
import -> normalize -> validate -> generate -> assist -> verify -> approve
```

See [Architecture](docs/ARCHITECTURE.md),
[architecture decisions](docs/adr/README.md),
[contextual assistance](docs/ASSISTANCE.md),
[Interaction model](docs/INTERACTION_MODEL.md),
[Worker protocol](docs/WORKER_PROTOCOL.md),
[roadmap](docs/ROADMAP.md),
[macOS setup](docs/MAC_SETUP.md), and [Contributing](CONTRIBUTING.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Prototype Skeleton

This repository now includes a Milestone 0 executable skeleton:

- `packages/core` contains deterministic domain types, a synthetic billing
  packet, decimal-string total calculation, and no-model help-topic rendering.
- `apps/workbench` contains a dependency-light portable browser workbench shell
  styled to feel at home on macOS while still running in any modern browser.
- `scripts/bootstrap-macos.sh` and `scripts/verify-macos.sh` provide the first
  bootstrap and verification entry points described in the macOS setup docs.

Run the portable prototype with:

```sh
corepack enable pnpm
pnpm install
pnpm --filter @claim-workbench/workbench dev
```

Verify the current skeleton with:

```sh
pnpm verify
```

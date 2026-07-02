# Claim Workbench Audit — 2026-07-02

This audit reviews the repository after the Milestone 0-7 implementation push.
It focuses on what exists, how well it is covered, what remains on the published
roadmap, and low-risk follow-up work.

## Executive Summary

Claim Workbench is in a strong prototype state. The portable stack has a full
synthetic proof from CSV import through receipt capture, with deterministic
validation, workflow gating, local persistence, artifact hashing, explicit
approval tokens, browser-worker safeguards, and no-model contextual assistance.
The test suite is broad and currently passes on the local Linux environment.

The main remaining product gap is not core workflow correctness; it is turning
the portable proof into a native operator experience and a documented adapter
surface. Milestone 8 and Milestone 9 remain the next major roadmap items.

## What It Has

### Product and Safety Model

- Local-first claim workflow toolkit with synthetic examples and no required
  external service dependency.
- Deterministic billing validation rather than AI-driven decisions.
- Visible, interruptible browser assistance with hard stops before irreversible
  operations.
- Local audit trails, receipts, and artifact manifests.
- Redacted, bounded assistance context envelopes and deterministic fallback help.

### Core Package

- Versioned billing packet validation with stable finding codes.
- Decimal-string money handling and currency-safe arithmetic.
- CSV import with configurable mapping, provenance, stable source IDs, duplicate
  detection, and near-duplicate review findings.
- Versioned workflow recipes, required-field checks, ordered actions, warnings,
  hard stops, overrides, manual handling, and terminal states.
- Artifact generation, deterministic paths, SHA-256 manifests, tamper detection,
  missing-artifact detection, and freshness checks.
- Approval token issuance and one-time verification bound to evidence.
- Worker command/result protocol contracts.
- Contextual help topics, search, redaction, and no-model summaries.
- `claim-validate` CLI.

### Service Package

- Local SQLite-backed service for packets, runs, artifacts, audit events,
  approvals, and receipts.
- Typed service operations plus one-JSON-message-per-line stdio transport.
- Persisted resume behavior and structured error boundaries.
- End-to-end synthetic service proof covering import, validation, artifact
  generation, approval, submission record, receipt, and completion.

### Browser Worker

- Page classification that requires URL, title, page text, and controls to
  agree before mutation.
- Read-only commands: page read, target highlighting, record matching.
- Reversible commands: service-row fill, total verification, artifact upload,
  and undo.
- Irreversible submit command gated by approval verification and evidence digest.
- Receipt capture, pause, emergency stop, idempotent command handling, and
  diagnostic capture controls.
- HTTP driver for deterministic tests and lazy Playwright driver for visible
  browser sessions.

### Applications and Examples

- Browser workbench shell that runs against the real core state machine with
  synthetic data, recipe-ordered actions, findings, overrides, approval-gated
  submission, assistance text, and audit history.
- Synthetic EAP source report, mapping, recipe, and revised report.
- Fake local claim portal with form, review, duplicate rejection, and receipt
  pages for safe worker tests.
- Native macOS SwiftUI shell that compiles, but is intentionally still a
  placeholder for Milestone 8.

### Documentation and Governance

- Architecture, roadmap, worker protocol, assistance model, interaction model,
  macOS setup, security policy, contributing guide, and ADRs covering repository
  structure, persistence, domain compatibility, adapter distribution, local
  security, release strategy, assistance architecture, and worker page drivers.
- GitHub Actions CI for portable packages across Linux, Windows, and macOS, plus
  a separate macOS Swift build/test job.

## Local Verification

- `pnpm test` passed across the core, service, browser-worker, and browser
  workbench packages.
- `pnpm build` passed source checks and browser bundle generation.

### Windows Verification (2026-07-02, Windows 11, Node 24.16.0)

- `corepack pnpm -r test`: all 141 tests pass (core 89, browser-worker 34,
  service 16, workbench 2).
- `corepack pnpm -r build`: all packages build; browser bundle generated.
- Fake portal serves `/portal` and the workbench dev server serves the bundle
  at `http://localhost:5173`. `claim-validate` passes the fixture with exit 0.
- Caveat for the README's `corepack enable pnpm` step: it needs an elevated
  shell on Windows (EPERM writing shims into `C:\Program Files\nodejs`).
  Non-admin workaround: prefix commands with `corepack pnpm ...` instead.
- The fake portal's suggested port 8787 may already be taken locally; use
  `--port <other>` if `EADDRINUSE` appears.

## What's Next

### Major Roadmap Work

1. **Milestone 8 — Native macOS Workbench**
   - Replace the placeholder SwiftUI shell with the operator dashboard.
   - Bridge the app to the local service over stdio.
   - Add packet/finding views, recipe action sidebar, document preview, Finder
     integration, and visible browser-worker orchestration.
   - Validate the end-to-end workflow on a physical Mac, including permissions
     and browser behavior.

2. **Milestone 9 — Adapter SDK and Example Integration**
   - Publish source, artifact, and destination adapter interfaces.
   - Add compatibility tests proving adapters cannot bypass validation,
     approval gates, audit events, receipt requirements, destination allowlists,
     or assistance metadata.
   - Write an extension development guide and recipe authoring validation.

3. **Release Gate**
   - Add threat-model and data-retention documentation.
   - Add dependency and secret scanning.
   - Test backup, export, and local-data deletion behavior.
   - Add no-model and small-model assistance grounding evaluations.
   - Define signed release artifact handling separately from development builds.

## Easy Wins and Low-Hanging Fruit

1. **Add an always-current status/audit document.** Done in this file so future
   contributors can quickly orient themselves without reading every ADR.
2. **Add machine-readable coverage totals to CI output.** The current tests are
   extensive, but coverage is not reported. Node's built-in test coverage or
   `c8` would make regression risk easier to track.
3. **Add root-level convenience scripts for macOS verification.** The Swift app
   has its own CI job, but `pnpm verify` does not exercise `swift build` or
   `swift test`; a documented `verify:macos` helper would reduce contributor
   misses.
4. **Add a small architecture diagram.** The text docs are thorough; one diagram
   showing app, service, core, worker, fake portal, artifacts, and SQLite would
   speed onboarding.
5. **Add sample stdio transcripts.** The protocol is documented and tested, but
   checked-in request/response examples would help adapter and app developers.
6. **Expand browser-shell smoke coverage.** The browser app builds and has
   synthetic-data checks, but a lightweight DOM or Playwright smoke test could
   catch UI regressions before Milestone 8 work begins.
7. **Document physical-Mac validation checklist results.** The roadmap names
   physical-Mac validation; a checklist file can collect pass/fail notes as the
   native app matures.
8. **Add adapter SDK skeleton tests before full implementation.** Start with
   failing or skipped compatibility fixtures that define the contract boundaries
   Milestone 9 must satisfy.

## Risk Notes

- The portable workflow has strong deterministic coverage, but real payer
  destinations will introduce page variance, session behavior, file-upload edge
  cases, and operational failure modes not represented by the synthetic portal.
- The browser worker is designed defensively, but visible Playwright operation
  and physical-browser permissions need real-platform validation.
- The native app is currently a compiled shell, so operator experience risk is
  still open.
- Adapter isolation and distribution are intentionally deferred; avoid using
  deployment-specific adapters until the SDK and compatibility suite exist.

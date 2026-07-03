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
  Note that the root wrapper scripts (`verify`, `test:coverage`) re-invoke
  `pnpm -r` internally, which fails when corepack is not enabled; in that
  case call `corepack pnpm -r <script>` directly.
- The fake portal's default port is now 8788 (`--port <other>` still works);
  both it and the workbench dev server now treat `EADDRINUSE` as a no-op
  ("already running") instead of an unhandled-exception crash, so re-running
  either command is idempotent.
- A repo-wide cross-platform sweep found no further live issues of the
  `URL.pathname` class: file paths consistently go through `fileURLToPath`,
  readline uses `crlfDelay: Infinity`, spawns use argv arrays, and artifact
  filenames are a deliberate forward-slash virtual convention translated at
  every filesystem boundary. Two latent notes: the CSV parser keeps a literal
  `\r` inside quoted multi-line fields (no current fixture exercises this),
  and fixture line endings are not pinned by a `.gitattributes`.
- **Missed by the sweep above, found by actually loading the dev server in a
  browser:** `pnpm build` succeeding is not the same as the bundle working.
  `apps/workbench/scripts/build.mjs` stripped the browser-incompatible
  `import "./styles.css";` line from `main.js` with a literal-`\n`-terminated
  string match; on a CRLF checkout (Windows `core.autocrlf`) that line ends in
  `\r\n`, the match silently missed, and the shipped `dist/main.js` kept the
  import. The browser then fetched `styles.css` as a JS module and refused it
  (strict MIME-type checking), so the app rendered a blank page. `pnpm -r test`
  and `pnpm -r build` gave no signal — neither exercises the built bundle in an
  actual browser. Fixed with a `\r?\n`-tolerant regex. Lesson for future
  audits here: a green build/test run does not substitute for opening the app.

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
2. **Add machine-readable coverage totals to CI output.** Done: each library
   package has a `test:coverage` script using Node's built-in coverage, plus a
   root `pnpm test:coverage` wrapper. Baseline line coverage (2026-07-02):
   core 95.2%, service 85.8%, browser-worker 68.5% (the lazily-loaded
   Playwright driver is exercised only in visible browser sessions, which
   accounts for most of the worker's uncovered lines).
3. **Add root-level convenience scripts for macOS verification.** The Swift app
   has its own CI job, but `pnpm verify` does not exercise `swift build` or
   `swift test`; a documented `verify:macos` helper would reduce contributor
   misses.
4. **Add a small architecture diagram.** The text docs are thorough; one diagram
   showing app, service, core, worker, fake portal, artifacts, and SQLite would
   speed onboarding.
5. **Add sample stdio transcripts.** Done: see
   [STDIO_TRANSCRIPT.md](STDIO_TRANSCRIPT.md), generated from a real session
   by `node scripts/generate-stdio-transcript.mjs` (also `pnpm
   stdio:transcript`), covering the happy path and both error shapes.
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

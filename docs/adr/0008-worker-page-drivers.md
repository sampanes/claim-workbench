# ADR-0008: Worker Page Drivers

## Status

Accepted

## Context

The browser worker's value is its judgment: page classification, evidence
comparison, idempotency, and approval enforcement. Binding that logic
directly to Playwright would force every automated test and CI job to
download browser binaries, and would make the worker's decisions hard to
test deterministically. The fake portal is an ordinary server-rendered
HTTP application, so its pages can be observed without a browser engine.

## Decision

- Define one driver observation surface: open a page, submit a form,
  return the current page as a structured model (URL, title, visible
  text, named controls, forms, links).
- Implement an HTTP driver with a cookie jar that drives server-rendered
  destinations directly. The automated test suite and CI use it
  exclusively.
- Implement a Playwright driver for visible, user-controlled browser
  sessions behind the same surface. Playwright is imported lazily and is
  not a package dependency; environments without it get a clear error
  instead of a download.
- Keep all classification, evidence, mode-gating, idempotency, and
  approval logic in the worker, independent of the driver.

## Consequences

Worker logic is fully exercised against the live fake portal in every CI
run without browser binaries. The Playwright driver is validated on
desktop machines as part of native-application work rather than in the
portable test suite. A destination that requires client-side rendering
cannot be driven by the HTTP driver; the driver seam is the place where
that capability plugs in without touching worker logic.

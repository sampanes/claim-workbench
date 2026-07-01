# ADR-0002: Contracts, Processes, and Persistence

## Status

Accepted

## Context

The SwiftUI application and portable service run in different language
runtimes. They need a boundary that remains testable without a GUI, avoids an
unnecessary local network service, and prevents multiple components from
writing persistence independently.

## Decision

- Use versioned JSON Schema as the source of truth for packets, recipes,
  commands, results, findings, evidence, artifacts, and audit events.
- Generate TypeScript and Swift models where generation is reliable.
- Validate every message that crosses a process boundary.
- Start the local service as a child process.
- Exchange one JSON message per line over standard input and standard output.
- Reserve standard error for diagnostics.
- Make the portable local service the sole owner of SQLite.
- Expose database behavior through documented repository interfaces and typed
  service operations.

## Consequences

Swift and browser-facing code never access database tables directly. The same
service can be driven by the native application, command-line tools, and tests.
Malformed or unsupported messages are rejected. Transactions, migrations, and
storage validation remain behind one API-like boundary.

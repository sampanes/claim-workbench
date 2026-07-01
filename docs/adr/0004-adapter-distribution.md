# ADR-0004: Adapter Distribution

## Status

Accepted

## Context

Source and destination adapters provide extensibility but may execute sensitive
file and browser operations. Runtime plugin installation would expand the
security and compatibility surface before the adapter contract is mature.

## Decision

- Define stable source, artifact, and destination adapter interfaces.
- Include adapters at build time.
- Require every shipped adapter to pass a compatibility suite.
- Postpone separately installed executable plugins.
- Allow deployment-specific integration repositories to consume the public core
  and produce deliberate application builds containing reviewed adapters.

## Consequences

Users cannot load arbitrary executable plugins at runtime. Adding an adapter
requires a rebuild, but every distributed adapter has a known code revision and
test result. A future ADR may introduce signed plugins after isolation,
permissions, updates, and compatibility are proven.

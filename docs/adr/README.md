# Architecture Decision Records

Architecture Decision Records capture decisions that materially constrain Claim
Workbench. They explain the selected approach and its consequences without
replacing implementation documentation.

## Accepted Decisions

- [ADR-0001: Repository and Toolchain](0001-repository-and-toolchain.md)
- [ADR-0002: Contracts, Processes, and Persistence](0002-contracts-processes-and-persistence.md)
- [ADR-0003: Domain Representation and Compatibility](0003-domain-representation-and-compatibility.md)
- [ADR-0004: Adapter Distribution](0004-adapter-distribution.md)
- [ADR-0005: Local Security and Data Lifecycle](0005-local-security-and-data-lifecycle.md)
- [ADR-0006: License and Releases](0006-license-and-releases.md)
- [ADR-0007: Contextual Assistance Architecture](0007-contextual-assistance-architecture.md)
- [ADR-0008: Worker Page Drivers](0008-worker-page-drivers.md)

## Format

New records use sequential four-digit identifiers and contain:

- status
- context
- decision
- consequences

Accepted records are not rewritten to hide later changes. A new ADR supersedes
an earlier decision and links back to it.

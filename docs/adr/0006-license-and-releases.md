# ADR-0006: License and Releases

## Status

Accepted

## Context

Public source without a license cannot be safely reused or contributed to.
Pre-release builds also need clear stability expectations, while macOS signing
credentials must remain separate from ordinary development.

## Decision

- License Claim Workbench under Apache License 2.0.
- Require compatible licenses for dependencies and distributed assets.
- Use semantic versioning.
- Mark experimental releases explicitly, for example `0.1.0-alpha.1`.
- Keep ordinary development builds unsigned.
- Sign and notarize deliberate macOS release candidates through a protected
  release workflow.

## Consequences

Commercial and noncommercial reuse is permitted under the Apache 2.0 terms,
including its patent provisions and notice requirements. Alpha builds do not
imply production readiness. Signing credentials are unnecessary for local and
pull-request verification and remain isolated from normal CI.

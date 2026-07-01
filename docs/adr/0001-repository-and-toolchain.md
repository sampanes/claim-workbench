# ADR-0001: Repository and Toolchain

## Status

Accepted

## Context

Claim Workbench contains a portable TypeScript core, a Node-based browser
worker, and a native SwiftUI application. Contributors need reproducible builds
across development machines and CI without maintaining separate repositories or
conflicting dependency locks.

## Decision

- Use one monorepo.
- Use `pnpm` workspaces and commit one `pnpm-lock.yaml`.
- Pin an active Node LTS release, the `pnpm` version, and the Swift tools
  version.
- Upgrade toolchains through reviewed changes that pass the complete
  verification suite.
- Provide first-class support for current 64-bit Windows, current 64-bit Linux,
  and Apple Silicon macOS.
- Treat Intel macOS as best-effort unless a contributor maintains it.

## Consequences

Bootstrap scripts and CI verify declared tool versions. Competing npm or Yarn
lock files are rejected. Portable packages run on Windows, Linux, and macOS;
the native application is compiled and tested on macOS CI. Intel-only failures
do not block releases.

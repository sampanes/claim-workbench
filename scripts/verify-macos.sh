#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Portable packages: tests =="
corepack pnpm -r test

echo "== Portable packages: builds =="
corepack pnpm -r build

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "== Native macOS application =="
  swift build --package-path apps/macos
  swift test --package-path apps/macos
else
  echo "== Native macOS application: skipped (not macOS) =="
fi

echo "All verification steps passed."

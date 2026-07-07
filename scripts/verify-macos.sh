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
  # swift test needs XCTest, which ships with full Xcode.app, not the
  # Command Line Tools. Only run it when a real Xcode is selected; otherwise
  # the build is the meaningful local signal and CI covers the tests.
  if xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
    swift test --package-path apps/macos
  else
    echo "Swift build OK; tests skipped (no full Xcode -> XCTest unavailable). CI runs them on macos-latest."
  fi
else
  echo "== Native macOS application: skipped (not macOS) =="
fi

echo "All verification steps passed."

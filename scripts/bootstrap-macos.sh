#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "macOS $(sw_vers -productVersion) on $(uname -m)"
  xcode-select -p >/dev/null
else
  echo "Non-macOS host detected; bootstrapping portable prototype only."
fi
corepack enable pnpm
pnpm install --frozen-lockfile

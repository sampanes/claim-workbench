#!/usr/bin/env bash
# One command to harvest every take-home output into out/ (plus the transcript).
# Reuses verify-macos.sh so there is a single source of truth for what runs.
# Not fail-fast: captures the logs even when a step fails, so you can read why.
# Safe to re-run; it overwrites out/.
#
# Usage:  ./scripts/capture-macos.sh
# Then:   git add out docs/STDIO_TRANSCRIPT.md && git commit -m "Capture run outputs" && git push
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p out

echo "== Regenerating stdio transcript =="
node scripts/generate-stdio-transcript.mjs

echo "== Coverage -> out/coverage.txt =="
corepack pnpm -r test:coverage 2>&1 | tee out/coverage.txt

echo "== Verify (tests + builds + macOS app) -> out/verify.txt =="
bash scripts/verify-macos.sh 2>&1 | tee out/verify.txt

# Scrub machine-identifying paths before anything is committed: absolute paths
# carry the operator's username (e.g. /Users/<name>/...), which must never
# reach the public repo. (-i.bak works on both BSD/macOS and GNU sed.)
echo "== Scrubbing machine paths from captures =="
for f in out/coverage.txt out/verify.txt docs/STDIO_TRANSCRIPT.md; do
  [[ -f "$f" ]] || continue
  sed -i.bak -e "s|$(pwd)|<repo>|g" -e "s|$HOME|<home>|g" "$f" && rm -f "$f.bak"
done

echo ""
echo "[OK] Harvest complete. Outputs:"
echo "  out/coverage.txt         coverage report (per-package line %)"
echo "  out/verify.txt           tests + builds + macOS Swift app"
echo "  docs/STDIO_TRANSCRIPT.md protocol-by-example session"
echo ""
echo "Take it home:"
echo "  git add out docs/STDIO_TRANSCRIPT.md && git commit -m \"Capture run outputs\" && git push"

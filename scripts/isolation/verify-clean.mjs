// Manual / CI-able audit that runs the exact same checks as the commit
// firewall, plus prints the isolation policy in plain terms so anyone can see
// plainly what may and may not cross the air gap. Exit 0 = clean, 1 = blocked.
//
//   node scripts/isolation/verify-clean.mjs   (or: pnpm verify:clean)

import { scanStaged, stagedFiles, formatViolations } from "./scan.mjs";
import { RED_ZONE_DIRS, REPORT_CHANNEL } from "./policy.mjs";

const files = stagedFiles();

process.stdout.write(
  [
    "Data-isolation policy",
    "─────────────────────",
    "  Green zone (may be committed): source code, docs, and synthetic",
    "    examples/fixtures only.",
    `  Red zone (never committed):    ${RED_ZONE_DIRS.join(", ")}, .env files,`,
    "    and *.trace.zip — real client data and secrets live here.",
    `  Report channel (scrubbed):     ${REPORT_CHANNEL} — the only path real-origin`,
    "    diagnostics may cross, and only after the PHI scan passes.",
    "",
    files.length
      ? `Scanning ${files.length} staged file(s)...`
      : "No files staged; nothing to scan.",
    ""
  ].join("\n")
);

const violations = scanStaged(files);

if (violations.length === 0) {
  process.stdout.write("✓ Clean — nothing staged would carry real data or secrets.\n");
  process.exit(0);
}

process.stdout.write("✗ Blocked — the following would leak across the air gap:\n\n");
process.stdout.write(`${formatViolations(violations)}\n`);
process.exit(1);

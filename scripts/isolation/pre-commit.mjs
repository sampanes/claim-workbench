// The commit firewall. Runs as the git pre-commit hook (see scripts/githooks/
// pre-commit) and refuses any commit that would carry real client data or
// secrets from the red zone into version control. This is the wall that lets
// the two-machine air gap hold even when someone runs `git add -A` by mistake.

import { scanStaged, formatViolations } from "./scan.mjs";
import { RED_ZONE_DIRS, REPORT_CHANNEL } from "./policy.mjs";

const violations = scanStaged();

if (violations.length === 0) {
  process.exit(0);
}

process.stderr.write(
  [
    "",
    "  ┌──────────────────────────────────────────────────────────────┐",
    "  │  COMMIT BLOCKED — data-isolation firewall                      │",
    "  └──────────────────────────────────────────────────────────────┘",
    "",
    "  This commit was stopped because it would carry real data or secrets",
    "  out of the red zone. Nothing was committed.",
    "",
    formatViolations(violations),
    "",
    "  What to do:",
    `    • Real client data and secrets belong only in the red-zone folders`,
    `      (${RED_ZONE_DIRS.join(", ")}) — never in git. Move them there.`,
    `    • To send diagnostics back to the laptop, run the scrubber and let it`,
    `      write into ${REPORT_CHANNEL}; the firewall re-checks that folder.`,
    "    • This is a wall, not a warning. If you believe it is wrong, fix the",
    "      policy in scripts/isolation/policy.mjs — do not bypass with --no-verify.",
    ""
  ].join("\n")
);

process.exit(1);

// One-time setup: point git at the tracked hooks directory so the commit
// firewall is active in this clone. Safe to run repeatedly. Run on every
// machine that commits — especially Mom's Mac.
//
//   node scripts/isolation/install.mjs   (or: pnpm hooks:install)

import { execFileSync } from "node:child_process";

execFileSync("git", ["config", "core.hooksPath", "scripts/githooks"], { stdio: "inherit" });

const current = execFileSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();

process.stdout.write(
  current === "scripts/githooks"
    ? "✓ Commit firewall installed (core.hooksPath = scripts/githooks).\n"
    : `✗ Expected core.hooksPath=scripts/githooks but got '${current}'.\n`
);
process.exit(current === "scripts/githooks" ? 0 : 1);

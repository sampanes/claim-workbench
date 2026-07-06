// Tier-1 diagnostic capture: how this machine behaves, with ZERO real data
// touched. Environment, firewall status, and synthetic-only checks. The
// result is safe by construction, but we still run every captured command's
// output through the scrubber's backstop and the same fail-closed self-check
// the scrubber uses, so a stray number in tool output can never slip through.
//
//   node scripts/isolation/capture-diagnostics.mjs [--full] [--out <path>]
//
// --full also runs the synthetic test suite and build (slower). Default is a
// fast environment + core-smoke pass. Real-portal / real-CSV diagnostics are
// Tier-2 and go through scrub.mjs, never this script.

import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { applyBackstop, residualFindings } from "./scrub.mjs";
import { REPORT_CHANNEL } from "./policy.mjs";

const args = process.argv.slice(2);
const full = args.includes("--full");
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : `${REPORT_CHANNEL}diagnostics.json`;

function seconds(startNs) {
  return `${(Number(process.hrtime.bigint() - startNs) / 1e9).toFixed(1)}s`;
}

function lastLines(text, n) {
  const lines = String(text).replace(/\s+$/, "").split(/\r?\n/);
  return applyBackstop(lines.slice(-n).join("\n"));
}

function runStep(label, cmd, cmdArgs) {
  const start = process.hrtime.bigint();
  const opts = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  // On Windows, .cmd shims (corepack, pnpm) need a shell; pass one joined
  // string rather than args-with-shell to avoid the DEP0190 warning. On macOS
  // (Mom's Mac) we exec directly with no shell.
  const r =
    process.platform === "win32"
      ? spawnSync([cmd, ...cmdArgs].join(" "), { ...opts, shell: true })
      : spawnSync(cmd, cmdArgs, { ...opts, shell: false });
  return {
    label,
    ok: r.status === 0,
    exitCode: r.status ?? null,
    unavailable: r.error?.code === "ENOENT",
    took: seconds(start),
    tail: lastLines(`${r.stdout ?? ""}\n${r.stderr ?? ""}`, 12)
  };
}

function hooksPath() {
  try {
    return execFileSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim() || "(unset)";
  } catch {
    return "(unset)";
  }
}

const report = {
  tier: 1,
  note: "PHI-free capture: no real client data or credentials are read by this script.",
  environment: {
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    node: process.version
  },
  firewall: { coreHooksPath: hooksPath(), installed: hooksPath() === "scripts/githooks" },
  checks: []
};

// Fast core smoke: the CLI validator against the synthetic fixture.
report.checks.push(
  runStep("core validator (synthetic fixture)", "node", [
    "packages/core/src/cli.js",
    "packages/core/fixtures/valid-packet.json"
  ])
);

if (full) {
  report.checks.push(runStep("synthetic test suite", "corepack", ["pnpm", "-r", "test"]));
  report.checks.push(runStep("build", "corepack", ["pnpm", "-r", "build"]));
  if (process.platform === "darwin") {
    report.checks.push(runStep("swift build", "swift", ["build", "--package-path", "apps/macos"]));
    report.checks.push(runStep("swift test", "swift", ["test", "--package-path", "apps/macos"]));
  }
}

const json = JSON.stringify(report, null, 2);
const residual = residualFindings(json);
if (residual.length > 0) {
  process.stderr.write(
    `capture aborted: output still contains PHI-shaped text (${residual.map((h) => h.name).join(", ")}). Not written.\n`
  );
  process.exit(1);
}

writeFileSync(outPath, `${json}\n`);
const passed = report.checks.filter((c) => c.ok).length;
process.stdout.write(`✓ Wrote ${outPath} — ${passed}/${report.checks.length} checks ok. Safe to review and commit.\n`);

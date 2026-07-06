// The "watch it work" demo — the one Mom can see with her own eyes.
//
//   node scripts/isolation/demo-firewall.mjs
//
// It deliberately tries to break the rule: it makes a FAKE patient file
// (made-up name, made-up SSN — no real person), tries to commit it, and lets
// you watch the firewall refuse. Then it cleans up after itself so the repo is
// left exactly as it started.
//
// It refuses to run unless the firewall is installed, so it can never itself
// leave the decoy behind in a commit.

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const DECOY = "firewall-demo-decoy.csv";
const DECOY_PATH = join(REPO, DECOY);

// A file of OBVIOUSLY fake, made-up people — but shaped exactly like a real
// patient export (a name column and an SSN column). Nobody real is in here.
//
// The SSN-shaped strings are assembled from parts at run time on purpose: this
// source file must itself pass the firewall (it's committed, green-zone code),
// so it may not contain a literal SSN pattern. The file it *writes* does — which
// is exactly what the demo needs to trip the wall in front of you.
const ssn = (a, b, c) => `${a}-${b}-${c}`;
const DECOY_CONTENT = [
  "patient_name,ssn,amount",
  `Madeup McExample,${ssn("123", "45", "6789")},120.00`,
  `Notareal Person,${ssn("987", "65", "4321")},86.50`,
  ""
].join("\n");

function line(s = "") {
  process.stdout.write(`${s}\n`);
}

function git(args) {
  return spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
}

function firewallInstalled() {
  try {
    return (
      execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: REPO, encoding: "utf8" }).trim() ===
      "scripts/githooks"
    );
  } catch {
    return false;
  }
}

function cleanup() {
  // Unstage the decoy if it was staged, and delete the file. Safe to call more
  // than once and safe if nothing was ever created.
  git(["reset", "-q", "HEAD", "--", DECOY]);
  if (existsSync(DECOY_PATH)) rmSync(DECOY_PATH);
}

function main() {
  if (!firewallInstalled()) {
    process.stderr.write(
      "\n  The firewall is not installed, so this demo won't run (it can't\n" +
        "  guarantee the decoy stays out of a commit). Install it first:\n\n" +
        "      pnpm hooks:install\n\n"
    );
    process.exit(1);
  }

  const headBefore = git(["rev-parse", "HEAD"]).stdout.trim();

  line("");
  line("  ┌────────────────────────────────────────────────────────────┐");
  line("  │  Firewall demo — watch it refuse a fake patient file         │");
  line("  └────────────────────────────────────────────────────────────┘");
  line("");
  line(`  1. Making a FAKE patient file (${DECOY}) with made-up names`);
  line("     and made-up Social Security numbers. Nobody real is in it.");

  let blocked = false;
  try {
    writeFileSync(DECOY_PATH, DECOY_CONTENT);
    git(["add", "--", DECOY]);
    line("");
    line("  2. Trying to commit it — as if someone clicked the wrong button…");
    line("");

    const commit = git(["commit", "-m", "demo: attempt to commit a (fake) patient file"]);
    const output = `${commit.stdout}${commit.stderr}`.trim();
    // Indent the firewall's own message so it reads as quoted output.
    for (const l of output.split(/\r?\n/)) line(`     │ ${l}`);

    const headAfter = git(["rev-parse", "HEAD"]).stdout.trim();
    blocked = commit.status !== 0 && headAfter === headBefore;
  } finally {
    cleanup();
  }

  line("");
  if (blocked) {
    line("  3. ✓ The wall held. The commit was refused and nothing left the Mac.");
    line("     The fake file has been cleaned up; the repo is back to normal.");
    line("");
    process.exit(0);
  } else {
    line("  3. ✗ UNEXPECTED: the file was NOT blocked. Do not trust the wall —");
    line("     tell John before doing any real work.");
    line("");
    process.exit(1);
  }
}

// Best-effort cleanup even on an unexpected crash or Ctrl-C.
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

main();

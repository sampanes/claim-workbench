// Readiness doctor — the first thing to run on Mom's Mac. It reports a
// green/red board of exactly what is set up versus still needed, so the scarce
// time at the Mac goes to the Mac-only steps (Keychain, real portal, browser
// install) instead of discovering gaps mid-session.
//
//   node scripts/doctor.mjs          # or: pnpm doctor
//
// It is READ-ONLY: it diagnoses and never changes anything (the sync check
// refreshes remote-tracking refs, nothing more — the working tree is never
// touched). It never reads or prints any password — the Keychain check uses
// existence only.

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const CONFIG_PATH = join(REPO, "local-data", "run-config.json");
const isMac = process.platform === "darwin";

const checks = [];
// status: "ok" | "warn" | "missing". `fix` is shown when not ok.
function add(label, status, detail, fix) {
  checks.push({ label, status, detail, fix });
}

function has(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

// 0. Clone freshness — is this checkout current with origin/main? A stale or
// diverged clone is how a whole Mac visit gets wasted (2026-07-07). The quiet
// fetch only refreshes remote-tracking refs; the working tree is never touched.
{
  const label = "Clone in sync with origin/main";
  const fetch = spawnSync("git", ["fetch", "--quiet", "origin", "main"], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 15000
  });
  if (fetch.status !== 0) {
    add(label, "warn", "could not reach origin — freshness unknown (offline?)", "Re-run with network, or continue if you know the clone is current.");
  } else {
    const count = (range) =>
      Number(execFileSync("git", ["rev-list", "--count", range], { cwd: REPO, encoding: "utf8" }).trim());
    let behind = null;
    let ahead = null;
    try {
      behind = count("HEAD..origin/main");
      ahead = count("origin/main..HEAD");
    } catch {
      /* detached/odd state falls through to the diverged advice below */
    }
    if (behind === 0 && ahead === 0) {
      add(label, "ok", "up to date");
    } else if (behind > 0 && ahead === 0) {
      add(label, "missing", `behind by ${behind} commit(s)`, "git pull --ff-only");
    } else if (ahead > 0 && behind === 0) {
      add(label, "warn", `${ahead} unpushed local commit(s)`, "git push origin main");
    } else {
      add(
        label,
        "missing",
        behind === null ? "state unreadable" : `diverged (${behind} behind / ${ahead} ahead) — expected on clones older than the 2026-07 history rewrite`,
        "git fetch origin && git reset --hard origin/main   (discards local commits — push or copy anything real first)"
      );
    }
  }
}

// 1. Node
{
  const major = Number(process.version.replace(/^v/, "").split(".")[0]);
  add(
    "Node.js >= 24",
    major >= 24 ? "ok" : "missing",
    process.version,
    "Install Node 24+ (nodejs.org or nvm)."
  );
}

// 2. pnpm
{
  const v = has("pnpm", ["--version"]);
  add("pnpm", v ? "ok" : "warn", v ? `v${v}` : "not found", "Enable it once: corepack enable pnpm");
}

// 3. Dependencies installed
{
  const ok = existsSync(join(REPO, "node_modules"));
  add("Dependencies installed", ok ? "ok" : "missing", ok ? "node_modules present" : "no node_modules", "pnpm install");
}

// 4. Playwright (the visible-browser driver). Not a package dep by design; a
// real run needs it. Chromium download is separate and slow — flag it early.
{
  const pkg = existsSync(join(REPO, "node_modules", "playwright"));
  add(
    "Playwright + Chromium",
    pkg ? "ok" : "warn",
    pkg ? "playwright present (verify chromium is installed)" : "not installed",
    "pnpm add -w playwright && pnpm exec playwright install chromium"
  );
}

// 5. Commit firewall
{
  let hooks = "(unset)";
  try {
    hooks = execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    /* not a git repo / git missing */
  }
  const ok = hooks === "scripts/githooks";
  add("Commit firewall installed", ok ? "ok" : "missing", `core.hooksPath = ${hooks || "(unset)"}`, "pnpm hooks:install");
}

// 6. Red-zone vault
{
  const dirs = ["local-data", "artifacts", "receipts", "auth-state"];
  const missing = dirs.filter((d) => !existsSync(join(REPO, d)));
  add(
    "Red-zone vault directories",
    missing.length === 0 ? "ok" : "warn",
    missing.length === 0 ? dirs.join(", ") : `missing: ${missing.join(", ")}`,
    "Created automatically on first `pnpm run:real`."
  );
}

// 7. Run configuration (+ which fields still need real values)
let config = null;
{
  if (!existsSync(CONFIG_PATH)) {
    add("Run configuration", "missing", "local-data/run-config.json absent", "pnpm run:real --preflight  (writes a template)");
  } else {
    try {
      config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      const blanks = [];
      if (!config.username) blanks.push("username");
      if (!config.keychain?.account) blanks.push("keychain.account");
      const sel = config.loginSelectors || {};
      const autofill = sel.username && sel.password;
      const usingFakePortal = String(config.portalUrl || "").includes("127.0.0.1");
      const detail = usingFakePortal
        ? "points at the synthetic portal (rehearsal-ready)"
        : `portal: ${config.portalUrl}`;
      add(
        "Run configuration",
        blanks.length ? "warn" : "ok",
        blanks.length ? `${detail}; still blank: ${blanks.join(", ")}` : `${detail}; ${autofill ? "autofill configured" : "manual login"}`,
        "Edit local-data/run-config.json with the real portal URL, username, and Keychain account."
      );
    } catch (err) {
      add("Run configuration", "missing", `unreadable: ${err.message}`, "Fix or delete local-data/run-config.json, then re-run.");
    }
  }
}

// 8. Keychain entry (macOS only, existence only — never reads the password)
{
  const acct = config?.keychain?.account;
  const svc = config?.keychain?.service;
  if (!isMac) {
    add("Portal password in Keychain", "warn", "skipped (not macOS)", "On the Mac, store it once (see fix on the config row).");
  } else if (!acct || !svc) {
    add("Portal password in Keychain", "warn", "no Keychain account configured yet", "Set keychain.account in the config first.");
  } else {
    // No -w: we check the item exists without ever printing the secret.
    const r = spawnSync("security", ["find-generic-password", "-s", svc, "-a", acct], { encoding: "utf8" });
    const ok = r.status === 0;
    add(
      "Portal password in Keychain",
      ok ? "ok" : "missing",
      ok ? `stored (service ${svc})` : "not found",
      `security add-generic-password -s ${svc} -a ${acct} -w`
    );
  }
}

// --- Render -----------------------------------------------------------------
const MARK = { ok: "✓", warn: "!", missing: "✗" };
const width = Math.max(...checks.map((c) => c.label.length));

process.stdout.write("\n  Claim Workbench — readiness doctor\n");
process.stdout.write("  ──────────────────────────────────\n");
for (const c of checks) {
  process.stdout.write(`  ${MARK[c.status]}  ${c.label.padEnd(width)}  ${c.detail}\n`);
  if (c.status !== "ok" && c.fix) process.stdout.write(`     ${" ".repeat(width)}   → ${c.fix}\n`);
}

const missing = checks.filter((c) => c.status === "missing");
const warn = checks.filter((c) => c.status === "warn");

process.stdout.write("\n");
if (missing.length === 0 && warn.length === 0) {
  process.stdout.write("  Ready for a real run. → pnpm run:real\n\n");
  process.exit(0);
}
if (missing.length === 0) {
  process.stdout.write("  Core is ready. You can rehearse now (synthetic, no real data):\n");
  process.stdout.write("    → pnpm demo:firewall     (watch the wall hold)\n");
  process.stdout.write("    → pnpm run:real --preflight\n");
  process.stdout.write(`  ${warn.length} item(s) above still need attention before a real run.\n\n`);
  process.exit(0);
}
process.stdout.write(`  Setup needed: ${missing.length} required item(s) not ready (marked ✗ above).\n\n`);
process.exit(1);

// Real-run launcher (RED ZONE — Mom's Mac). One command to open the real claim
// portal against the real client vault, with the portal password pulled from
// the macOS Keychain in memory only — never written to disk, never logged,
// never shown to Claude.
//
//   node scripts/isolation/real-run.mjs             # launch the visible browser
//   node scripts/isolation/real-run.mjs --preflight # run every check, launch nothing
//
// NON-NEGOTIABLES this script enforces:
//   1. NO AI. It imports no model and makes no network call except to the
//      portal URL you configure. Claude never runs here.
//   2. Firewall-gated. It refuses to run unless the commit firewall is
//      installed, so a real run can never happen on a machine where a leaked
//      file could still reach a commit.
//   3. Red zone only. The client CSVs, portal config, and browser session all
//      live under gitignored red-zone directories. Nothing it touches is
//      committable.
//   4. Password in memory only. Read from the Keychain at launch, held in a
//      local variable, typed into the login form, and dropped when the process
//      exits. It is never printed, saved, or included in any diagnostic.

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RED_ZONE_DIRS } from "./policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const PROFILE_DIR = join(REPO, "auth-state", "browser-profile");

const argv = process.argv.slice(2);
const preflightOnly = argv.includes("--preflight");
// --config <path> points at an alternate config (used by rehearsal mode to
// drive the launcher with a synthetic config without touching the real one).
const configIdx = argv.indexOf("--config");
const CONFIG_PATH = configIdx >= 0 ? resolve(argv[configIdx + 1]) : join(REPO, "local-data", "run-config.json");

// The red-zone vault the launcher provisions: real client data and the browser
// session live here and only here. This is the writable subset of the shared
// red-zone list (the rest, e.g. playwright-report, are tool-generated), so the
// firewall and this launcher can never disagree on what counts as red zone.
const VAULT_DIRS = ["local-data", "artifacts", "receipts", "auth-state"].filter((d) =>
  RED_ZONE_DIRS.includes(d)
);

function line(s = "") {
  process.stdout.write(`${s}\n`);
}

function fail(message, hint) {
  process.stderr.write(`\n  ✗ ${message}\n`);
  if (hint) process.stderr.write(`\n${hint}\n`);
  process.stderr.write("\n");
  process.exit(1);
}

// --- Guard 1: the commit firewall must be installed -------------------------
function firewallInstalled() {
  try {
    const value = execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: REPO,
      encoding: "utf8"
    }).trim();
    return value === "scripts/githooks";
  } catch {
    return false;
  }
}

// --- Guard 2: ensure the red-zone vault exists ------------------------------
function ensureVault() {
  const created = [];
  for (const dir of VAULT_DIRS) {
    const abs = join(REPO, dir);
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true });
      created.push(dir);
    }
  }
  return created;
}

// --- Config: lives in the gitignored vault, never in git --------------------
const CONFIG_TEMPLATE = {
  portalUrl: "http://127.0.0.1:8788/portal",
  username: "",
  // macOS Keychain lookup. Store the password once with, e.g.:
  //   security add-generic-password -s claim-workbench-portal -a <username> -w
  // Then this launcher reads it at run time and never stores it again.
  keychain: { service: "claim-workbench-portal", account: "" },
  // Optional CSS selectors for auto-filling the login form. Leave any blank to
  // log in by hand (the safe default for portals with MFA or a captcha).
  loginSelectors: { username: "", password: "", submit: "" }
};

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, `${JSON.stringify(CONFIG_TEMPLATE, null, 2)}\n`);
    fail(
      "No run configuration found — wrote a template into the vault.",
      [
        `  Created: local-data/run-config.json  (gitignored — safe for real values)`,
        "",
        "  Edit it with the real portal URL and your Keychain account, then",
        "  store the password once in the Keychain (macOS):",
        "",
        "      security add-generic-password -s claim-workbench-portal -a <username> -w",
        "",
        "  It defaults to the synthetic portal so you can rehearse safely first:",
        "      node examples/fake-portal/server.mjs --port 8788",
        "      node scripts/isolation/real-run.mjs --preflight"
      ].join("\n")
    );
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail(`Could not parse local-data/run-config.json: ${err.message}`);
  }
}

// --- Password: Keychain first, env fallback, never to disk or logs ----------
// Returns { source, value } where value is held only in memory. The caller
// logs `source`, never `value`.
function resolvePassword(config) {
  const kc = config.keychain || {};
  if (process.platform === "darwin" && kc.service && kc.account) {
    const r = spawnSync(
      "security",
      ["find-generic-password", "-w", "-s", kc.service, "-a", kc.account],
      { encoding: "utf8" }
    );
    if (r.status === 0 && r.stdout) {
      // Keychain appends a trailing newline; strip it without touching the rest.
      return { source: `macOS Keychain (${kc.service})`, value: r.stdout.replace(/\n$/, "") };
    }
  }
  if (process.env.CLAIM_PORTAL_PASSWORD) {
    return { source: "CLAIM_PORTAL_PASSWORD env var", value: process.env.CLAIM_PORTAL_PASSWORD };
  }
  return { source: "none — you will log in by hand", value: null };
}

// --- Report (never prints the password) -------------------------------------
function report({ createdDirs, config, password }) {
  line("");
  line("  Claim Workbench — real-run launcher (red zone)");
  line("  ─────────────────────────────────────────────");
  line("  No AI runs here. No external call except the portal below.");
  line("");
  line(`  Firewall installed : yes (core.hooksPath = scripts/githooks)`);
  line(`  Vault directories  : ${VAULT_DIRS.join(", ")}${createdDirs.length ? `  (created: ${createdDirs.join(", ")})` : ""}`);
  line(`  Portal URL         : ${config.portalUrl || "(unset — edit run-config.json)"}`);
  line(`  Username           : ${config.username || "(unset)"}`);
  line(`  Password source    : ${password.source}`);
  const sel = config.loginSelectors || {};
  const canAutofill = Boolean(sel.username && sel.password && password.value);
  line(`  Login              : ${canAutofill ? "auto-fill, then hand off" : "manual (browser opens at sign-in)"}`);
  line("");
  return canAutofill;
}

async function launch({ config, password, canAutofill }) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    fail(
      "Playwright is not installed.",
      "  Install it once on this Mac:\n" +
        "      pnpm add -w playwright && pnpm exec playwright install chromium"
    );
  }

  mkdirSync(dirname(PROFILE_DIR), { recursive: true });
  // A persistent, VISIBLE context: the browser is never hidden, and the login
  // session persists across runs inside the red-zone vault (auth-state/).
  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false
  });
  const page = context.pages()[0] || (await context.newPage());

  line(`  Opening ${config.portalUrl} …`);
  await page.goto(config.portalUrl, { waitUntil: "load" }).catch((err) => {
    line(`  (could not load the portal: ${err.message})`);
  });

  const sel = config.loginSelectors || {};
  if (canAutofill) {
    try {
      if (config.username) await page.fill(sel.username, config.username);
      await page.fill(sel.password, password.value); // typed, never logged
      if (sel.submit) await page.click(sel.submit);
      line("  Signed in. The browser is yours — do the billing by hand.");
    } catch (err) {
      line(`  Auto-fill did not complete (${err.message}); log in by hand.`);
    }
  } else {
    line("  Log in by hand in the window that opened.");
  }

  line("");
  line("  Leave this window open while you work. Close the browser (or press");
  line("  Ctrl-C here) when you are done; your session stays in the vault.");
  line("");

  // Hold until the operator closes the browser or interrupts.
  await new Promise((done) => {
    context.on("close", done);
    process.on("SIGINT", () => context.close().finally(done));
  });
}

async function main() {
  if (!firewallInstalled()) {
    fail(
      "The data-isolation commit firewall is not installed on this machine.",
      "  A real run is blocked until it is, so nothing can leak into a commit:\n" +
        "      pnpm hooks:install\n" +
        "  Then re-run this launcher."
    );
  }

  const createdDirs = ensureVault();
  const config = loadConfig();
  const password = resolvePassword(config);
  const canAutofill = report({ createdDirs, config, password });

  if (preflightOnly) {
    line("  Preflight only — every check passed, nothing was launched.");
    line("");
    return;
  }

  await launch({ config, password, canAutofill });
}

main().catch((err) => fail(err.message));

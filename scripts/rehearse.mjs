// Rehearsal — prove the whole stack end-to-end with ZERO real data, so the
// first real night at the Mac is friction-free. One command boots the synthetic
// portal and exercises every moving part against it:
//
//   node scripts/rehearse.mjs          # or: pnpm rehearse
//   node scripts/rehearse.mjs --headless   # unattended (no visible browser)
//
// Steps: synthetic portal boots → firewall demo blocks a fake file → launcher
// preflight passes → the browser auto-fills the login and lands on the portal
// (the one path that needs a real browser) → diagnostics capture writes a clean
// report. Each step reports pass / skip / fail; nothing touches the real config
// or the report channel.

import { spawn, spawnSync } from "node:child_process";
import { get } from "node:http";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const argv = process.argv.slice(2);
const headless = argv.includes("--headless");
const PORT = 8788;
const PORTAL_URL = `http://127.0.0.1:${PORT}/portal`;

const TMP = join(tmpdir(), "claim-workbench-rehearsal");
const REHEARSAL_CONFIG = join(TMP, "run-config.json");
const DIAG_OUT = join(TMP, "diagnostics.json");

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const mark = { pass: "✓", skip: "•", fail: "✗" }[status];
  process.stdout.write(`  ${mark}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function node(scriptArgs, env = {}) {
  return spawnSync(process.execPath, scriptArgs, {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Poll the portal until it answers or we give up.
async function waitForPortal(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    const up = await new Promise((done) => {
      const req = get(url, (res) => {
        res.resume();
        done(res.statusCode > 0);
      });
      req.on("error", () => done(false));
      req.setTimeout(500, () => {
        req.destroy();
        done(false);
      });
    });
    if (up) return true;
    await delay(250);
  }
  return false;
}

// The autofill smoke: the one path that needs a real browser. Mirrors the
// launcher's fill logic exactly (fill username, fill password, click submit)
// and asserts we land on the post-login page. Skips cleanly without Playwright.
async function autofillSmoke() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return { status: "skip", detail: "Playwright not installed (runs on the Mac after setup)" };
  }
  const browser = await playwright.chromium.launch({ headless });
  try {
    const page = await browser.newPage();
    await page.goto(PORTAL_URL, { waitUntil: "load" });
    await page.fill('input[name="username"]', "rehearsal");
    await page.fill('input[name="password"]', "synthetic"); // synthetic portal password
    await Promise.all([
      page.waitForLoadState("load"),
      page.click('button[type="submit"]')
    ]);
    if (!headless) await delay(1200); // let a watching human see the result
    const landed = page.url().includes("/portal/home");
    return landed
      ? { status: "pass", detail: "auto-filled login and landed on /portal/home" }
      : { status: "fail", detail: `unexpected page after login: ${page.url()}` };
  } finally {
    await browser.close();
  }
}

async function main() {
  process.stdout.write("\n  Claim Workbench — rehearsal (synthetic, no real data)\n");
  process.stdout.write("  ─────────────────────────────────────────────────────\n");

  // A synthetic config just for this rehearsal — written to a temp dir, never
  // the real local-data/run-config.json.
  mkdirSync(TMP, { recursive: true });
  writeFileSync(
    REHEARSAL_CONFIG,
    `${JSON.stringify(
      {
        portalUrl: PORTAL_URL,
        username: "rehearsal",
        keychain: {},
        loginSelectors: {
          username: 'input[name="username"]',
          password: 'input[name="password"]',
          submit: 'button[type="submit"]'
        }
      },
      null,
      2
    )}\n`
  );

  // Step 1: boot the synthetic portal.
  const portal = spawn(process.execPath, ["examples/fake-portal/server.mjs", "--port", String(PORT)], {
    cwd: REPO,
    stdio: "ignore",
    env: { ...process.env, COCKPIT_PROC_LABEL: "rehearse-fake-portal" }
  });
  let portalUp = false;
  try {
    portalUp = await waitForPortal(PORTAL_URL);
    record("Synthetic portal", portalUp ? "pass" : "fail", portalUp ? PORTAL_URL : "did not come up");

    // Step 2: firewall demo (fake patient file is refused, repo left clean).
    const demo = node(["scripts/isolation/demo-firewall.mjs"]);
    record("Firewall blocks a fake patient file", demo.status === 0 ? "pass" : "fail", demo.status === 0 ? "wall held" : "did not block");

    // Step 3: launcher preflight against the synthetic config.
    const pre = node(["scripts/isolation/real-run.mjs", "--preflight", "--config", REHEARSAL_CONFIG], {
      CLAIM_PORTAL_PASSWORD: "synthetic"
    });
    record("Launcher preflight", pre.status === 0 ? "pass" : "fail", pre.status === 0 ? "all checks passed" : "preflight failed");

    // Step 4: the browser autofill path (needs a real browser).
    if (portalUp) {
      const smoke = await autofillSmoke();
      record("Browser autofill", smoke.status, smoke.detail);
    } else {
      record("Browser autofill", "skip", "portal was not up");
    }

    // Step 5: PHI-free diagnostics capture writes a clean report.
    const diag = node(["scripts/isolation/capture-diagnostics.mjs", "--out", DIAG_OUT]);
    record("Diagnostics capture", diag.status === 0 ? "pass" : "fail", diag.status === 0 ? "wrote a clean report" : "capture failed");
  } finally {
    portal.kill();
    rmSync(TMP, { recursive: true, force: true });
  }

  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  process.stdout.write("\n");
  if (failed.length === 0) {
    process.stdout.write(
      `  Rehearsal passed${skipped.length ? ` (${skipped.length} skipped — will run on the Mac)` : ""}. The stack works end-to-end.\n\n`
    );
    process.exit(0);
  }
  process.stdout.write(`  Rehearsal found ${failed.length} problem(s): ${failed.map((f) => f.name).join(", ")}.\n\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`\n  rehearsal error: ${err.message}\n\n`);
  process.exit(1);
});

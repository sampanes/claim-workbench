# Runbook: a night at the Mac

The scarce resource is time at Mom's Mac. This runbook keeps that time spent on
the things that *only* the Mac can do — the Keychain, the real portal, the
installed browser — and moves everything else off the critical path.

**Always start here:**

```sh
pnpm doctor
```

It prints a green/red board of what's ready and what isn't, and tells you the
exact command to fix each red line. Everything below is just those commands in
order.

---

## State of the target Mac (as of the 2026-07-07 visit)

What the first hands-on visit **proved** (captured in `out/verify.txt` and
`out/coverage.txt`):

- The clone exists at `~/Documents/bespoke-billing-tool/claim-workbench` —
  the next visit starts with `git pull`, **not** a fresh clone.
- Node + `corepack pnpm` work; the full portable stack is green on macOS:
  **141/141 tests** (core 89, browser-worker 34, service 16, workbench 2) and
  every package builds, including the self-contained browser bundle.
- **Swift builds** (`swift build` on `apps/macos`, 0.11s) via the Command Line
  Tools — but there is **no full Xcode**, so `swift test`/XCTest cannot run
  locally. CI on `macos-latest` covers the Swift tests; installing Xcode on
  the Mac is optional and only matters for Milestone 8 iteration.
- Git push to `origin/main` works from the Mac.

What has **never run on the target Mac** (the isolation stack landed on `main`
after the visit), in the order a next visit should knock them out:

1. `git pull` — picks up everything below.
2. `pnpm install` — new dependency state.
3. `pnpm hooks:install` — **the firewall has never been armed on that Mac.**
   Arm it first; every isolation tool refuses to run without it.
4. `pnpm doctor` — turns the rest of this list into a live green/red board.
5. `pnpm add -w playwright && pnpm exec playwright install chromium` — the
   browser download (the unit tests never needed it; the launcher does).
6. `pnpm rehearse` — proves the one path no other machine can: the browser
   autofill step (step 4) has only ever been verified by review.
7. `security add-generic-password -s claim-workbench-portal -a <username> -w`
   — Keychain entry (section A step 5).
8. `pnpm run:real --preflight` — writes the config template; fill in the real
   portal details.

Items 1–6 need **zero real data** — they are a complete non-billing visit on
their own. Items 7–8 are only worth doing when a real portal session is
actually planned.

---

## A. One-time setup (per Mac, ~15 min, no billing needed)

Do this once. `pnpm doctor` turns each line green as you go.

```sh
# 1. Get the code and dependencies
git clone https://github.com/sampanes/claim-workbench.git
cd claim-workbench
corepack enable pnpm
pnpm install

# 2. Install the visible browser (slow download — do it now, not mid-session)
pnpm add -w playwright && pnpm exec playwright install chromium

# 3. Install the data-isolation firewall (nothing real can leave without it)
pnpm hooks:install

# 4. Create the config template, then edit it with the real portal details
pnpm run:real --preflight        # writes local-data/run-config.json
#   → set portalUrl, username, keychain.account, and (optional) loginSelectors
#     by inspecting the real portal's login fields.

# 5. Store the portal password in the Keychain — once, in memory forever after
security add-generic-password -s claim-workbench-portal -a <username> -w
#   (paste the password when prompted; it never touches a file or git)
```

When `pnpm doctor` shows no ✗ and no ! you care about, you're set.

## B. Every run

```sh
pnpm doctor          # 10-second sanity check
pnpm run:real        # opens the visible portal, password pulled from Keychain
```

The browser opens at the portal. The password is read from the Keychain into
memory and typed in (or you log in by hand if selectors aren't set). Do the
billing in the window; close it when done. The session persists in `auth-state/`
so you're not re-logging-in every time.

## C. Bring something back to the laptop (optional, always scrubbed)

Two ways real-origin signal crosses the air gap — both scrubbed, both land only
in `reports/from-mac/`, both re-checked by the firewall at commit time:

```sh
# PHI-free environment/build/test capture (safe by construction)
node scripts/isolation/capture-diagnostics.mjs --full

# A specific raw output, scrubbed against the real client CSV's own values
node scripts/isolation/scrub.mjs --raw <rawFile> --keys <clientCsv> \
     --out reports/from-mac/<name>.txt
```

Review what it wrote, then commit and push. If anything real slipped in, the
firewall blocks the commit — that's the wall, working.

**Never crosses:** screenshots, trace files (`*.trace.zip`), the vault
(`local-data/`, `artifacts/`, `receipts/`, `auth-state/`), and `.env` files.
They stay red-zone by path; the firewall refuses them.

---

## Making a non-billing night count

No real billing session? Prove the whole stack end-to-end with zero real data in
one command, so the first *real* night is friction-free:

```sh
pnpm rehearse
```

It boots the synthetic portal and checks each moving part: the portal comes up,
the firewall refuses a fake patient file, the launcher's preflight passes, the
browser auto-fills the login and lands on the portal, and a clean diagnostics
report is written. Each step reports pass / skip / fail; nothing touches your
real config or the report channel. (`--headless` runs it without a visible
window.) When a real session happens, only section B is new.

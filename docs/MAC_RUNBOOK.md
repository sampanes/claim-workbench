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

No real billing session? You can still prove the whole stack end-to-end with
zero real data, so the first *real* night is friction-free:

```sh
node examples/fake-portal/server.mjs --port 8788   # synthetic portal
pnpm demo:firewall                                 # watch the wall hold
pnpm run:real --preflight                          # confirm the launcher's checks
```

That exercises the browser install, the launcher, and the firewall against the
synthetic portal (password `synthetic`) — everything except the real login. When
a real session happens, only step B is new.

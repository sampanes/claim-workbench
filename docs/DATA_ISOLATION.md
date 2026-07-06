# How I Keep Your Patients' Information Safe

*A promise from your son, in plain English*

Mom, you've spent your whole career being careful with patients' private
information. I want you to know that the helper tool I'm building for you is held
to that same standard — and I want you to understand exactly how, not just take
my word for it.

---

## Two separate computers, and only one of them has the AI

I build this tool with the help of an AI assistant — a computer program that
helps me write things faster. That assistant lives **only on my laptop**. It is
never on your Mac. Your Mac never talks to it, and never talks to any internet
AI at all.

Think of it like hiring a contractor to design a filing system for your office.
He does all his designing **from his own office**. He mails you the blueprints.
He never sets foot in your house — and your patients' files never leave your
house. That's exactly how this works: the tool's instructions travel from my
laptop to your Mac. Your patients' information never travels back.

## The locked drawer

On your Mac, the real client spreadsheets and your website passwords live in
what I think of as a **locked drawer**: a protected folder, plus the Mac's own
built-in place for storing passwords safely (the same trusted spot your Mac
already uses when it remembers a password for you).

The tool can reach into that drawer to do its work — filling in the spreadsheet,
logging into the portal. But the AI assistant? **It has no key. It isn't even in
the building.** It's back at the contractor's office, drawing blueprints.

## A one-way mail slot — with a censor

Sometimes I need to know how the tool behaved on your real work so I can fix a
problem. For that, your Mac can send me a **report** — but only through what
amounts to a one-way mail slot with a very strict censor standing at it.

Before anything leaves your Mac, an automatic censor goes through the report and
**blacks out every name, every ID number, every password** — like taking a black
marker to a document before it goes in the mail. And then I read it over myself,
to double-check the marker did its job.

So what I actually see is something like *"row 7 had a formatting problem."* I
never see *"Jane Doe's amount was wrong."* I get enough to fix the tool — and
nothing about any actual person.

## Nothing private can leave by accident

People make mistakes — a wrong click, a moment of distraction. So I didn't leave
this up to carefulness alone. There is an **automatic guard** on your Mac that
refuses to send any file containing real names or passwords back to my laptop.
Even if someone clicks the wrong button, the guard blocks it. It's not a rule I
promise to follow; it's a wall that stands there whether or not anyone is paying
attention.

## See it for yourself

Here's the part I'm proudest of: **you don't have to take my word for any of
this.**

Next time I'm over, I'll sit down with you and deliberately *try* to break my own
rule. I'll make a fake patient file — made-up names, made-up numbers — and try to
send it back to my laptop, right in front of you. And you'll watch the guard
refuse it.

It's one command, and it cleans up after itself:

```sh
pnpm demo:firewall
```

You'll see it make the fake file, try to commit it, and watch the wall answer
with **`COMMIT BLOCKED — data-isolation firewall`**. Nothing leaves. Then it
throws the fake file away so everything is back to normal.

You'll see the wall hold with your own eyes. That's the standard, Mom — not
"trust me," but "watch it work."

With love (and a lot of black marker),
Your son

---

## The exact commands (for John)

Everything the plain-English promises above describe is enforced by real code in
`scripts/isolation/`, sharing one policy file (`policy.mjs`) so the two sides of
the wall can never drift apart.

| Do this | Command | What it proves |
| --- | --- | --- |
| Install the guard | `pnpm hooks:install` | Wires the pre-commit firewall via `core.hooksPath`. Every other step below refuses to run until this is done. |
| Watch the wall hold | `pnpm demo:firewall` | Stages a fake patient file (fake name + fake SSN), tries to commit it, shows the block, and cleans up. Exit 0 = the wall held. |
| Audit what's staged | `pnpm verify:clean` | Runs the same scan the firewall runs, on demand, so you can check by hand before committing. |
| Open the real portal | `pnpm run:real` (or `--preflight`) | Firewall-gated launcher. Opens the visible portal against the vault with the password read from the Keychain in memory only — no AI, no external call but the portal. |
| Send a scrubbed report | `node scripts/isolation/scrub.mjs --raw <file> --keys <clientCsv> --out reports/from-mac/<name>` | Redacts real values by exact match, backstops with pattern scanning, and **refuses to write** if any PHI shape survives (fail-closed). |
| Capture safe diagnostics | `node scripts/isolation/capture-diagnostics.mjs [--full]` | PHI-free environment/build/test capture; every line is scrubbed and re-checked before it is written. |

**The zones**

- **Red zone (never leaves the Mac):** `local-data/`, `artifacts/`, `receipts/`,
  `auth-state/`, `playwright-report/`, `test-results/`, any `.env`, and any
  `*.trace.zip`. All gitignored; the firewall blocks them by path.
- **Report channel (the one-way mail slot):** `reports/from-mac/` — the only path
  real-origin content may cross, and only after it passes the strict PHI scan.
- **Green zone (safe to share):** source code, docs, and synthetic
  examples/fixtures. Scanned anyway so a real file dropped in the wrong place is
  still caught on its content (that's what the demo shows).

**Why it can't be bypassed by accident:** the guard is a `git` pre-commit hook, a
wall that stands regardless of attention. Bypassing it takes a deliberate
`--no-verify`, which is exactly what we never do. If the policy is ever wrong, the
fix is to edit `scripts/isolation/policy.mjs` — never to route around the wall.

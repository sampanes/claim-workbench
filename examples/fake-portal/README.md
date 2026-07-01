# Fake Portal

A synthetic claim portal used to test the browser worker end to end. It is
an ordinary local HTTP application with no external dependencies and no
real data: members, claims, and confirmation numbers are all invented.

Run it standalone:

```sh
node examples/fake-portal/server.mjs --port 8787
```

Then open `http://127.0.0.1:8787/portal` and sign in with any username and
the password `synthetic`.

## Pages

- `/portal` and `/portal/home` — sign-in and member dashboard
- `/portal/claim?draft=...` — the multi-row claim form (member panel,
  service rows, attachments, running total)
- `/portal/claim/review?draft=...` — review and confirm page
- `/portal/receipt?draft=...` — submission receipt with a deterministic
  confirmation number derived from the claim content
- `/portal/help` — a deliberately misleading page that mentions the same
  phrases as the claim form; classification must reject it
- `/portal/claim?draft=...&degraded=1` — the claim form with its member
  panel missing, simulating a partially loaded page

## Behavior worth testing against

- Login is a manual step: nothing works without the session cookie.
- Rows and attachments are edited through ordinary form posts.
- Submission requires the review confirmation checkbox.
- A second submission of the same draft is rejected with a duplicate
  notice — the portal enforces this independently of the worker.
- Committed rows are exposed as hidden `rowN` inputs so evidence
  extraction can compare expected and observed values exactly.

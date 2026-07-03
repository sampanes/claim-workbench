#!/usr/bin/env node
// Synthetic claim portal for end-to-end testing (Milestone 5). Serves a
// login page, a member dashboard, a multi-row claim form, a review page,
// and a submission receipt — all in memory, all synthetic. Deliberately
// uses generic routes and shared titles so page classification must rely
// on more than the URL.

import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const PORTAL_TITLE = "Synthetic EAP Portal";
const LOGIN_PASSWORD = "synthetic";

const MEMBERS = new Map([
  ["SYN-000123", { memberId: "SYN-000123", name: "Taylor Example" }],
  ["SYN-000456", { memberId: "SYN-000456", name: "Jordan Example" }]
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function centsOf(amount) {
  if (!/^\d+\.\d{2}$/.test(amount)) return null;
  const [units, cents] = amount.split(".");
  return Number(units) * 100 + Number(cents);
}

function formatCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title></head>
<body>
<header><strong>${PORTAL_TITLE}</strong> — synthetic testing portal, not a real payer</header>
${body}
</body>
</html>`;
}

export function startFakePortal({ port = 0 } = {}) {
  const sessions = new Map();

  function session(req, res) {
    const cookies = Object.fromEntries(
      (req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).filter((pair) => pair.length === 2)
    );
    let id = cookies.fpsession;
    if (!id || !sessions.has(id)) {
      id = randomUUID();
      sessions.set(id, { loggedIn: false, drafts: new Map(), draftCounter: 0 });
      res.setHeader("set-cookie", `fpsession=${id}; Path=/; HttpOnly`);
    }
    return sessions.get(id);
  }

  function draftTotalCents(draft) {
    return draft.rows.reduce((sum, row) => sum + centsOf(row.amount), 0);
  }

  function renderClaimForm(draft, { degraded = false } = {}) {
    const memberPanel = degraded ? "<p>Member panel failed to load.</p>" : `
  <fieldset>
    <legend>Member</legend>
    <label>Member ID <input name="memberId" value="${escapeHtml(draft.memberId)}" disabled/></label>
    <label>Name <input name="memberName" value="${escapeHtml(draft.memberName)}" disabled/></label>
  </fieldset>`;
    const rows = draft.rows.map((row, index) => `
      <li>
        ${escapeHtml(row.serviceDate)} ${escapeHtml(row.code)} x${escapeHtml(row.units)} ${escapeHtml(row.amount)}
        <input type="hidden" name="row${index + 1}" value="${escapeHtml(`${row.serviceDate}|${row.code}|${row.units}|${row.amount}`)}"/>
        <form method="post" action="/portal/claim/remove">
          <input type="hidden" name="draft" value="${escapeHtml(draft.id)}"/>
          <input type="hidden" name="row" value="row${index + 1}"/>
          <button type="submit">Remove</button>
        </form>
      </li>`).join("\n");
    const attachments = draft.attachments.map((attachment) => `
      <li>${escapeHtml(attachment.filename)} <input type="hidden" name="attachment" value="${escapeHtml(attachment.filename)}"/></li>`).join("\n");
    return page(PORTAL_TITLE, `
  <h1>Prepare claim</h1>
  ${memberPanel}
  <h2>Service rows</h2>
  <ol>${rows || "<li>No rows yet.</li>"}</ol>
  <form method="post" action="/portal/claim/add">
    <input type="hidden" name="draft" value="${escapeHtml(draft.id)}"/>
    <label>Service date <input name="serviceDate"/></label>
    <label>Code <input name="code"/></label>
    <label>Units <input name="units" value="1"/></label>
    <label>Amount <input name="amount"/></label>
    <button type="submit">Add row</button>
  </form>
  <h2>Attachments</h2>
  <ul>${attachments || "<li>None.</li>"}</ul>
  <form method="post" action="/portal/claim/attach">
    <input type="hidden" name="draft" value="${escapeHtml(draft.id)}"/>
    <label>File name <input name="filename"/></label>
    <label>Content <textarea name="content"></textarea></label>
    <button type="submit">Attach</button>
  </form>
  <p>Running total: <input name="portalTotal" value="${formatCents(draftTotalCents(draft))}" disabled/></p>
  <p><a href="/portal/claim/review?draft=${escapeHtml(draft.id)}">Review claim</a></p>`);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const state = session(req, res);

    const respond = (status, html) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    };
    const redirect = (location) => {
      res.writeHead(303, { location });
      res.end();
    };
    const notFound = () => respond(404, page("Page not found", "<h1>Page not found</h1><p>This synthetic portal does not know that address.</p>"));

    const withBody = (handler) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const body = Object.fromEntries(new URLSearchParams(raw));
        handler(body);
      });
    };

    const requireLogin = () => {
      if (!state.loggedIn) {
        respond(200, page(PORTAL_TITLE, `
  <h1>Sign in</h1>
  <p>Use any username with the password "synthetic".</p>
  <form method="post" action="/portal/login">
    <label>Username <input name="username"/></label>
    <label>Password <input name="password" type="password"/></label>
    <button type="submit">Sign in</button>
  </form>`));
        return false;
      }
      return true;
    };

    const draftFor = (id) => state.drafts.get(id) ?? null;

    if (req.method === "GET" && (url.pathname === "/portal" || url.pathname === "/portal/home")) {
      if (!requireLogin()) return;
      const drafts = [...state.drafts.values()].map((draft) =>
        `<li><a href="/portal/claim?draft=${escapeHtml(draft.id)}">${escapeHtml(draft.memberName)} (${draft.submitted ? "submitted" : "draft"})</a></li>`).join("\n");
      respond(200, page(PORTAL_TITLE, `
  <h1>Member dashboard</h1>
  <form method="post" action="/portal/claim/start">
    <label>Member ID <input name="memberId"/></label>
    <button type="submit">Start claim</button>
  </form>
  <h2>Recent claims</h2>
  <ul>${drafts || "<li>None.</li>"}</ul>`));
      return;
    }

    if (req.method === "POST" && url.pathname === "/portal/login") {
      withBody((body) => {
        if (body.password === LOGIN_PASSWORD && body.username) {
          state.loggedIn = true;
          redirect("/portal/home");
        } else {
          respond(403, page(PORTAL_TITLE, "<h1>Sign in failed</h1><p>Wrong synthetic credentials.</p>"));
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/portal/claim/start") {
      if (!requireLogin()) return;
      withBody((body) => {
        const member = MEMBERS.get(body.memberId);
        if (!member) {
          respond(404, page(PORTAL_TITLE, `<h1>Member not found</h1><p>No member with ID ${escapeHtml(body.memberId ?? "")}.</p>`));
          return;
        }
        state.draftCounter += 1;
        const id = `draft-${state.draftCounter}`;
        state.drafts.set(id, {
          id, memberId: member.memberId, memberName: member.name,
          rows: [], attachments: [], submitted: false, receiptNumber: null
        });
        redirect(`/portal/claim?draft=${id}`);
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/portal/claim") {
      if (!requireLogin()) return;
      const draft = draftFor(url.searchParams.get("draft"));
      if (!draft) return notFound();
      respond(200, renderClaimForm(draft, { degraded: url.searchParams.get("degraded") === "1" }));
      return;
    }

    if (req.method === "POST" && (url.pathname === "/portal/claim/add" || url.pathname === "/portal/claim/remove" || url.pathname === "/portal/claim/attach")) {
      if (!requireLogin()) return;
      withBody((body) => {
        const draft = draftFor(body.draft);
        if (!draft) return notFound();
        if (draft.submitted) {
          respond(409, page(PORTAL_TITLE, "<h1>Claim already submitted</h1><p>This claim can no longer be edited.</p>"));
          return;
        }
        if (url.pathname === "/portal/claim/add") {
          if (!body.serviceDate || !body.code || centsOf(body.amount) === null || !/^\d+$/.test(body.units ?? "1")) {
            respond(400, page(PORTAL_TITLE, "<h1>Invalid row</h1><p>The synthetic portal needs a date, code, whole-number units, and a decimal amount.</p>"));
            return;
          }
          draft.rows.push({ serviceDate: body.serviceDate, code: body.code, units: body.units ?? "1", amount: body.amount });
        } else if (url.pathname === "/portal/claim/remove") {
          const index = Number(/^row(\d+)$/.exec(body.row ?? "")?.[1] ?? NaN) - 1;
          if (Number.isInteger(index) && index >= 0 && index < draft.rows.length) draft.rows.splice(index, 1);
        } else {
          if (!body.filename || body.content === undefined) {
            respond(400, page(PORTAL_TITLE, "<h1>Invalid attachment</h1>"));
            return;
          }
          draft.attachments.push({ filename: body.filename, content: body.content, sha256: sha256(body.content) });
        }
        redirect(`/portal/claim?draft=${draft.id}`);
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/portal/claim/review") {
      if (!requireLogin()) return;
      const draft = draftFor(url.searchParams.get("draft"));
      if (!draft) return notFound();
      const rows = draft.rows.map((row, index) => `
      <li>${escapeHtml(row.serviceDate)} ${escapeHtml(row.code)} x${escapeHtml(row.units)} ${escapeHtml(row.amount)}
        <input type="hidden" name="row${index + 1}" value="${escapeHtml(`${row.serviceDate}|${row.code}|${row.units}|${row.amount}`)}"/></li>`).join("\n");
      respond(200, page(PORTAL_TITLE, `
  <h1>Review claim</h1>
  <p>Member: <input name="memberId" value="${escapeHtml(draft.memberId)}" disabled/> ${escapeHtml(draft.memberName)}</p>
  <ol>${rows || "<li>No rows.</li>"}</ol>
  <p>Total: <input name="portalTotal" value="${formatCents(draftTotalCents(draft))}" disabled/></p>
  <p>Attachments: ${draft.attachments.length}</p>
  <form method="post" action="/portal/claim/submit">
    <input type="hidden" name="draft" value="${escapeHtml(draft.id)}"/>
    <label><input type="checkbox" name="confirm" value="yes"/> I reviewed this claim</label>
    <button type="submit" name="submitClaim" value="1">Confirm and submit</button>
  </form>
  <p><a href="/portal/claim?draft=${escapeHtml(draft.id)}">Back to claim</a></p>`));
      return;
    }

    if (req.method === "POST" && url.pathname === "/portal/claim/submit") {
      if (!requireLogin()) return;
      withBody((body) => {
        const draft = draftFor(body.draft);
        if (!draft) return notFound();
        if (draft.submitted) {
          respond(409, page(PORTAL_TITLE, `
  <h1>Duplicate submission rejected</h1>
  <p>This claim was already submitted as confirmation ${escapeHtml(draft.receiptNumber)}.</p>`));
          return;
        }
        if (body.confirm !== "yes") {
          respond(400, page(PORTAL_TITLE, "<h1>Confirmation required</h1><p>Check the review box before submitting.</p>"));
          return;
        }
        if (draft.rows.length === 0) {
          respond(400, page(PORTAL_TITLE, "<h1>Nothing to submit</h1><p>The claim has no service rows.</p>"));
          return;
        }
        draft.submitted = true;
        // Deterministic confirmation number derived from claim content.
        const digest = sha256([draft.memberId, ...draft.rows.map((row) => `${row.serviceDate}|${row.code}|${row.units}|${row.amount}`)].join("\n"));
        draft.receiptNumber = `SYN-RCPT-${digest.slice(0, 10).toUpperCase()}`;
        redirect(`/portal/receipt?draft=${draft.id}`);
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/portal/receipt") {
      if (!requireLogin()) return;
      const draft = draftFor(url.searchParams.get("draft"));
      if (!draft || !draft.submitted) return notFound();
      respond(200, page(PORTAL_TITLE, `
  <h1>Submission receipt</h1>
  <p>Confirmation number: <input name="confirmationNumber" value="${escapeHtml(draft.receiptNumber)}" disabled/></p>
  <p>Member: <input name="memberId" value="${escapeHtml(draft.memberId)}" disabled/> ${escapeHtml(draft.memberName)}</p>
  <p>Rows: ${draft.rows.length}</p>
  <p>Total: <input name="portalTotal" value="${formatCents(draftTotalCents(draft))}" disabled/></p>
  <p>This synthetic receipt confirms a submission to a test system only.</p>`));
      return;
    }

    if (req.method === "GET" && url.pathname === "/portal/help") {
      // Deliberately misleading: mentions the same phrases as the claim form
      // ("Prepare claim", "Service rows") without being it. Classification
      // must fail here because the required controls are absent.
      respond(200, page(PORTAL_TITLE, `
  <h1>Help</h1>
  <p>To prepare a claim, open the member dashboard and choose Start claim.</p>
  <p>The Prepare claim screen lists Service rows and a running total.</p>
  <p>After review, submission produces a confirmation number.</p>`));
      return;
    }

    notFound();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const boundPort = server.address().port;
      resolve({
        server,
        port: boundPort,
        url: `http://127.0.0.1:${boundPort}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg === -1 ? 8788 : Number(process.argv[portArg + 1]);
  try {
    const portal = await startFakePortal({ port });
    console.log(`Synthetic claim portal: ${portal.url}/portal (password: "${LOGIN_PASSWORD}")`);
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      // Idempotent: a repeat run should not crash with a stack trace, it
      // means something is already listening on this port.
      console.log(`Synthetic claim portal: port ${port} is already in use — it may already be running at http://127.0.0.1:${port}/portal`);
      process.exit(0);
    }
    throw error;
  }
}

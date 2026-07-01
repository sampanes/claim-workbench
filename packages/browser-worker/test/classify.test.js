import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyPage } from "../src/classify.js";
import { parsePage } from "../src/page-model.js";

async function specs() {
  const recipe = JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
  return recipe.destination.classification;
}

const CLAIM_HTML = `<!doctype html><html><head><title>Synthetic EAP Portal</title></head><body>
<h1>Prepare claim</h1>
<input name="memberId" value="SYN-000123" disabled/>
<h2>Service rows</h2>
<form method="post" action="/portal/claim/add">
<input name="serviceDate"/><input name="code"/><input name="units" value="1"/><input name="amount"/>
</form>
<p>Running total: <input name="portalTotal" value="0.00" disabled/></p>
</body></html>`;

test("the claim form is recognized only when every evidence class agrees", async () => {
  const classification = classifyPage(
    parsePage({ url: "http://127.0.0.1:8787/portal/claim?draft=draft-1", html: CLAIM_HTML }),
    await specs()
  );
  assert.equal(classification.pageId, "claim-form");
  assert.equal(classification.ambiguous, false);
  assert.deepEqual(classification.evidence.controlsMissing, []);
});

test("a matching URL alone is not sufficient", async () => {
  const lookalike = `<!doctype html><html><head><title>Synthetic EAP Portal</title></head><body>
  <h1>Session expired</h1><p>Please sign in again.</p></body></html>`;
  const classification = classifyPage(
    parsePage({ url: "http://127.0.0.1:8787/portal/claim?draft=draft-1", html: lookalike }),
    await specs()
  );
  assert.equal(classification.pageId, null);
});

test("a misleading page with the right words but no controls is unknown", async () => {
  const misleading = `<!doctype html><html><head><title>Synthetic EAP Portal</title></head><body>
  <p>To prepare a claim open the dashboard. The Prepare claim screen lists Service rows and a Running total.</p>
  </body></html>`;
  const classification = classifyPage(
    parsePage({ url: "http://127.0.0.1:8787/portal/claim?draft=draft-1", html: misleading }),
    await specs()
  );
  assert.equal(classification.pageId, null);
  const claimEvaluation = classification.evaluations.find((evaluation) => evaluation.pageId === "claim-form");
  assert.ok(claimEvaluation.evidence.controlsMissing.length > 0);
});

test("an incomplete page missing one required control is unknown", async () => {
  const incomplete = CLAIM_HTML.replace('<input name="memberId" value="SYN-000123" disabled/>', "");
  const classification = classifyPage(
    parsePage({ url: "http://127.0.0.1:8787/portal/claim?draft=draft-1", html: incomplete }),
    await specs()
  );
  assert.equal(classification.pageId, null);
  const claimEvaluation = classification.evaluations.find((evaluation) => evaluation.pageId === "claim-form");
  assert.deepEqual(claimEvaluation.evidence.controlsMissing, ["memberId"]);
});

test("ambiguous matches are treated as unknown", () => {
  const page = parsePage({ url: "http://localhost/anything", html: "<title>T</title><p>shared text</p>" });
  const classification = classifyPage(page, {
    "page-a": { requiredText: ["shared text"] },
    "page-b": { requiredText: ["shared text"] }
  });
  assert.equal(classification.pageId, null);
  assert.equal(classification.ambiguous, true);
});

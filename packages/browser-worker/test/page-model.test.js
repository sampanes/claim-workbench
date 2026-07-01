import test from "node:test";
import assert from "node:assert/strict";
import { controlByName, observedRows, parsePage } from "../src/page-model.js";

const SAMPLE = `<!doctype html>
<html><head><title>Synthetic EAP Portal</title></head>
<body>
<h1>Prepare claim</h1>
<label>Member ID <input name="memberId" value="SYN-000123" disabled/></label>
<input type="hidden" name="row1" value="2026-06-03|SYN-90834|1|125.00"/>
<input type="hidden" name="row2" value="2026-06-10|SYN-90834|1|125.00"/>
<form method="post" action="/portal/claim/add">
  <input type="hidden" name="draft" value="draft-1"/>
  <label>Amount &amp; fee <input name="amount"/></label>
  <button type="submit">Add row</button>
</form>
<p>Running total: <input name="portalTotal" value="250.00" disabled/></p>
<a href="/portal/claim/review?draft=draft-1">Review claim</a>
<script>var ignored = "<input name='fake'/>";</script>
</body></html>`;

test("extracts title, text, controls, forms, and links", () => {
  const page = parsePage({ url: "http://127.0.0.1:9999/portal/claim?draft=draft-1", html: SAMPLE });
  assert.equal(page.title, "Synthetic EAP Portal");
  assert.match(page.text, /Prepare claim/);
  assert.match(page.text, /Running total/);
  assert.ok(!page.text.includes("ignored"), "script content is not page text");

  const memberId = controlByName(page, "memberId");
  assert.equal(memberId.value, "SYN-000123");
  assert.equal(memberId.disabled, true);
  assert.equal(controlByName(page, "fake"), null);

  const addForm = page.forms.find((form) => form.action === "/portal/claim/add");
  assert.deepEqual(addForm.fields.draft, "draft-1");
  assert.equal(addForm.method, "post");
  // Disabled controls are observations, not submittable fields.
  assert.ok(!("memberId" in addForm.fields));

  assert.deepEqual(page.links, ["/portal/claim/review?draft=draft-1"]);
});

test("observed rows parse hidden row inputs in order", () => {
  const page = parsePage({ url: "http://localhost/x", html: SAMPLE });
  assert.deepEqual(observedRows(page), [
    { rowName: "row1", serviceDate: "2026-06-03", code: "SYN-90834", units: 1, amount: "125.00" },
    { rowName: "row2", serviceDate: "2026-06-10", code: "SYN-90834", units: 1, amount: "125.00" }
  ]);
});

test("decodes entities in attribute values and text", () => {
  const page = parsePage({ url: "http://localhost/x", html: '<title>A &amp; B</title><input name="note" value="x &quot;y&quot;"/>' });
  assert.equal(page.title, "A & B");
  assert.equal(controlByName(page, "note").value, 'x "y"');
});

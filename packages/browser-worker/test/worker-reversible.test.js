import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "@claim-workbench/core";
import { observedRows } from "../src/page-model.js";
import { command, setup, TAYLOR_FACTS } from "./helpers.mjs";

test("fillServiceRows fills every row with expected-versus-observed evidence", async () => {
  const { portal, driver, worker } = await setup();
  try {
    const result = await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    assert.equal(result.status, "succeeded");
    assert.equal(result.evidence.serviceRowsExpected, 2);
    assert.equal(result.evidence.serviceRowsObserved, 2);
    assert.equal(result.evidence.expectedTotal, "250.00");
    assert.equal(result.evidence.observedTotal, "250.00");
    assert.ok(result.evidence.rows.every((row) => row.observed));
    assert.deepEqual(result.findings, []);
    assert.equal(observedRows(driver.currentPage()).length, 2);
  } finally {
    await portal.close();
  }
});

test("a repeated commandId returns the original result and fills nothing twice", async () => {
  const { portal, driver, worker } = await setup();
  try {
    const first = command("fillServiceRows", { mode: "RunReversibleSteps" });
    const original = await worker.handleCommand(first);
    assert.equal(original.status, "succeeded");
    const replay = await worker.handleCommand(first);
    assert.deepEqual(replay, original);
    assert.equal(observedRows(driver.currentPage()).length, 2, "rows were not duplicated");
  } finally {
    await portal.close();
  }
});

test("a new fill command skips rows that are already observed", async () => {
  const { portal, driver, worker } = await setup();
  try {
    await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    const second = await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    assert.equal(second.status, "succeeded");
    assert.match(second.summary, /^Filled 0 row\(s\)/);
    assert.equal(observedRows(driver.currentPage()).length, 2);
  } finally {
    await portal.close();
  }
});

test("verifyTotal blocks on a mismatch and passes once rows agree", async () => {
  const { portal, worker } = await setup();
  try {
    await worker.handleCommand(command("fillServiceRows", {
      mode: "RunReversibleSteps",
      input: { serviceLineIds: ["service_1"] }
    }));
    const mismatch = await worker.handleCommand(command("verifyTotal"));
    assert.equal(mismatch.status, "blocked");
    assert.equal(mismatch.findings[0].code, "TOTAL_MISMATCH");
    assert.equal(mismatch.evidence.observedTotal, "125.00");

    await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    const matched = await worker.handleCommand(command("verifyTotal"));
    assert.equal(matched.status, "succeeded");
    assert.deepEqual(matched.nextActions, ["user_review"]);
  } finally {
    await portal.close();
  }
});

test("mutation is disabled on unknown pages and in low assistance modes", async () => {
  const { portal, driver, worker } = await setup();
  try {
    const lowMode = await worker.handleCommand(command("fillServiceRows", { mode: "Prefill" }));
    assert.equal(lowMode.status, "blocked");
    assert.match(lowMode.summary, /does not permit fillServiceRows/);

    await driver.open(`${portal.url}/portal/help`);
    const unknownPage = await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    assert.equal(unknownPage.status, "blocked");
    assert.equal(unknownPage.findings[0].code, "PAGE_UNKNOWN");
    assert.equal(observedRows(driver.currentPage()).length, 0);
  } finally {
    await portal.close();
  }
});

test("an unknown service line id fails without touching the page", async () => {
  const { portal, driver, worker } = await setup();
  try {
    const result = await worker.handleCommand(command("fillServiceRows", {
      mode: "RunReversibleSteps",
      input: { serviceLineIds: ["service_999"] }
    }));
    assert.equal(result.status, "failed");
    assert.equal(result.evidence.unknownLineId, "service_999");
    assert.equal(observedRows(driver.currentPage()).length, 0);
  } finally {
    await portal.close();
  }
});

test("uploadArtifact verifies the manifest hash before uploading", async () => {
  const content = "<!doctype html><html><body>Synthetic claim summary</body></html>";
  const goodFacts = {
    ...TAYLOR_FACTS,
    artifacts: [{ kind: "claim-summary", filename: "packet_0001/claim-summary.html", content, sha256: sha256Hex(content) }]
  };
  const good = await setup({ facts: goodFacts });
  try {
    const result = await good.worker.handleCommand(command("uploadArtifact", {
      mode: "RunReversibleSteps",
      input: { kind: "claim-summary" }
    }));
    assert.equal(result.status, "succeeded");
    assert.equal(result.evidence.observedAttachment, true);
    assert.equal(result.evidence.filename, "claim-summary.html");
    // Re-running skips the upload but still verifies observation.
    const again = await good.worker.handleCommand(command("uploadArtifact", {
      mode: "RunReversibleSteps",
      input: { kind: "claim-summary" }
    }));
    assert.equal(again.status, "succeeded");
  } finally {
    await good.portal.close();
  }

  const tamperedFacts = {
    ...TAYLOR_FACTS,
    artifacts: [{ kind: "claim-summary", filename: "packet_0001/claim-summary.html", content: "modified", sha256: sha256Hex(content) }]
  };
  const tampered = await setup({ facts: tamperedFacts });
  try {
    const result = await tampered.worker.handleCommand(command("uploadArtifact", {
      mode: "RunReversibleSteps",
      input: { kind: "claim-summary" }
    }));
    assert.equal(result.status, "blocked");
    assert.equal(result.findings[0].code, "ARTIFACT_TAMPERED");
    const attachments = tampered.driver.currentPage().controls.filter((control) => control.name === "attachment");
    assert.equal(attachments.length, 0, "nothing was uploaded");
  } finally {
    await tampered.portal.close();
  }
});

test("undoFill removes exactly what this session filled", async () => {
  const { portal, driver, worker } = await setup();
  try {
    // The operator adds a row by hand before assistance runs.
    await driver.submitForm("/portal/claim/add", {
      draft: driver.currentPage().forms.find((form) => form.action === "/portal/claim/add").fields.draft,
      serviceDate: "2026-06-17", code: "SYN-90999", units: "1", amount: "10.00"
    });
    assert.equal(observedRows(driver.currentPage()).length, 1);

    await worker.handleCommand(command("fillServiceRows", { mode: "RunReversibleSteps" }));
    assert.equal(observedRows(driver.currentPage()).length, 3);

    const undo = await worker.handleCommand(command("undoFill", { mode: "RunReversibleSteps" }));
    assert.equal(undo.status, "succeeded");
    assert.equal(undo.evidence.removedRows, 2);

    const remaining = observedRows(driver.currentPage());
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].code, "SYN-90999", "the operator's manual row is untouched");

    // Undo with nothing left to undo is a clean no-op.
    const again = await worker.handleCommand(command("undoFill", { mode: "RunReversibleSteps" }));
    assert.equal(again.status, "succeeded");
    assert.equal(again.evidence.removedRows, 0);
  } finally {
    await portal.close();
  }
});

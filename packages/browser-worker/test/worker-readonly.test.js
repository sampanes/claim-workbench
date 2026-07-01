import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startFakePortal } from "../../../examples/fake-portal/server.mjs";
import { HttpPageDriver } from "../src/drivers/http-driver.js";
import { BrowserWorker } from "../src/worker.js";

const TAYLOR_FACTS = {
  packetId: "packet_0001",
  memberId: "SYN-000123",
  memberName: "Taylor Example",
  serviceRows: [
    { lineId: "service_1", serviceDate: "2026-06-03", code: "SYN-90834", units: 1, amount: "125.00" },
    { lineId: "service_2", serviceDate: "2026-06-10", code: "SYN-90834", units: 1, amount: "125.00" }
  ],
  expectedTotal: "250.00",
  artifacts: []
};

let commandCounter = 0;
export function command(action, { mode = "SubmitWithExplicitApproval", input, packetId = "packet_0001", overrides } = {}) {
  commandCounter += 1;
  return {
    protocolVersion: "1",
    commandId: `cmd_${String(commandCounter).padStart(4, "0")}`,
    runId: "run_0001",
    packetId,
    recipeId: "synthetic-eap-monthly",
    stepId: "step-test",
    action,
    mode,
    approvalToken: null,
    input,
    ...overrides
  };
}

async function setup({ diagnosticMode = false, facts = TAYLOR_FACTS } = {}) {
  const portal = await startFakePortal();
  const recipe = JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
  const driver = new HttpPageDriver();
  // Login and claim creation are the operator's manual steps, simulated at
  // the driver level: the worker never handles credentials (ADR-0005).
  await driver.open(`${portal.url}/portal`);
  await driver.submitForm("/portal/login", { username: "operator", password: "synthetic" });
  await driver.submitForm("/portal/claim/start", { memberId: facts.memberId });
  const worker = new BrowserWorker({ driver, recipe, facts, diagnosticMode });
  return { portal, driver, worker, recipe };
}

test("readPage recognizes the claim form with full evidence", async () => {
  const { portal, worker } = await setup();
  try {
    const result = await worker.handleCommand(command("readPage"));
    assert.equal(result.status, "succeeded");
    assert.equal(result.evidence.pageId, "claim-form");
    assert.deepEqual(result.findings, []);
    assert.match(result.summary, /Recognized page claim-form/);
    assert.ok(result.evidence.controls.includes("memberId"));
  } finally {
    await portal.close();
  }
});

test("readPage reports unknown pages and disables mutation guidance", async () => {
  const { portal, worker } = await setup();
  try {
    const result = await worker.handleCommand(command("readPage", { input: { url: `${portal.url}/portal/help` } }));
    assert.equal(result.status, "succeeded");
    assert.equal(result.evidence.pageId, null);
    assert.equal(result.findings[0].code, "PAGE_UNKNOWN");
    assert.deepEqual(result.nextActions, ["report_unexpected_page"]);
  } finally {
    await portal.close();
  }
});

test("the degraded claim form is not recognized", async () => {
  const { portal, driver, worker } = await setup();
  try {
    const url = new URL(driver.currentPage().url);
    url.searchParams.set("degraded", "1");
    const result = await worker.handleCommand(command("readPage", { input: { url: url.href } }));
    assert.equal(result.evidence.pageId, null);
    assert.equal(result.findings[0].code, "PAGE_UNKNOWN");
  } finally {
    await portal.close();
  }
});

test("showTarget highlights an existing control and reports missing ones", async () => {
  const { portal, worker } = await setup();
  try {
    const found = await worker.handleCommand(command("showTarget", { mode: "Guide", input: { target: "memberId" } }));
    assert.equal(found.status, "succeeded");
    assert.deepEqual(found.evidence, { target: "memberId", found: true, disabled: true });

    const missing = await worker.handleCommand(command("showTarget", { mode: "Guide", input: { target: "no-such-control" } }));
    assert.equal(missing.status, "failed");
    assert.equal(missing.findings[0].code, "TARGET_NOT_FOUND");
  } finally {
    await portal.close();
  }
});

test("matchRecord confirms the right member and blocks the wrong one", async () => {
  const { portal, worker } = await setup();
  try {
    const matched = await worker.handleCommand(command("matchRecord"));
    assert.equal(matched.status, "succeeded");
    assert.equal(matched.evidence.recordMatched, true);
    assert.equal(matched.evidence.observed.memberId, "SYN-000123");
  } finally {
    await portal.close();
  }

  // Same portal page, but the packet facts bill a different member.
  const wrongFacts = { ...TAYLOR_FACTS, memberId: "SYN-000456", memberName: "Jordan Example" };
  const second = await setup({ facts: { ...wrongFacts, packetId: "packet_0001" } });
  try {
    // The operator opened Taylor's claim, but the facts are Jordan's.
    await second.driver.submitForm("/portal/claim/start", { memberId: "SYN-000123" });
    const mismatched = await second.worker.handleCommand(command("matchRecord"));
    assert.equal(mismatched.status, "blocked");
    assert.equal(mismatched.findings[0].code, "RECORD_MISMATCH");
    assert.equal(mismatched.evidence.recordMatched, false);
  } finally {
    await second.portal.close();
  }
});

test("commands demand a recognized page before acting", async () => {
  const { portal, driver, worker } = await setup();
  try {
    await driver.open(`${portal.url}/portal/help`);
    const result = await worker.handleCommand(command("matchRecord"));
    assert.equal(result.status, "blocked");
    assert.equal(result.findings[0].code, "PAGE_UNKNOWN");
  } finally {
    await portal.close();
  }
});

test("assistance modes gate commands", async () => {
  const { portal, worker } = await setup();
  try {
    const result = await worker.handleCommand(command("showTarget", { mode: "Observe", input: { target: "memberId" } }));
    assert.equal(result.status, "blocked");
    assert.match(result.summary, /does not permit showTarget/);
    assert.deepEqual(result.nextActions, ["set_assistance_mode"]);
  } finally {
    await portal.close();
  }
});

test("protocol violations fail without touching the page", async () => {
  const { portal, worker } = await setup();
  try {
    const badVersion = await worker.handleCommand(command("readPage", { overrides: { protocolVersion: "999" } }));
    assert.equal(badVersion.status, "failed");
    assert.match(badVersion.summary, /protocolVersion/);

    const unknownAction = await worker.handleCommand(command("readPage", { overrides: { action: "hackTheGibson" } }));
    assert.equal(unknownAction.status, "failed");

    const wrongPacket = await worker.handleCommand(command("readPage", { packetId: "packet_9999" }));
    assert.equal(wrongPacket.status, "failed");
    assert.match(wrongPacket.summary, /holds facts for packet_0001/);
  } finally {
    await portal.close();
  }
});

test("pause and emergency stop cancel commands", async () => {
  const { portal, worker } = await setup();
  try {
    worker.pause();
    const paused = await worker.handleCommand(command("readPage"));
    assert.equal(paused.status, "cancelled");
    assert.equal(paused.findings[0].code, "WORKER_PAUSED");

    worker.resume();
    const resumed = await worker.handleCommand(command("readPage"));
    assert.equal(resumed.status, "succeeded");

    worker.emergencyStop();
    const stopped = await worker.handleCommand(command("readPage"));
    assert.equal(stopped.status, "cancelled");
    assert.equal(stopped.findings[0].code, "WORKER_STOPPED");
    worker.resume();
    const stillStopped = await worker.handleCommand(command("readPage"));
    assert.equal(stillStopped.status, "cancelled");
  } finally {
    await portal.close();
  }
});

test("diagnostics are off by default and explicit when enabled", async () => {
  const closed = await setup();
  try {
    const blocked = await closed.worker.handleCommand(command("showTarget", { mode: "Observe", input: { target: "memberId" } }));
    assert.equal(blocked.diagnostics, null);
  } finally {
    await closed.portal.close();
  }

  const diagnostic = await setup({ diagnosticMode: true });
  try {
    await diagnostic.driver.open(`${diagnostic.portal.url}/portal/help`);
    const result = await diagnostic.worker.handleCommand(command("matchRecord"));
    assert.equal(result.status, "blocked");
    assert.match(result.diagnostics.htmlSha256, /^[0-9a-f]{64}$/);
    assert.match(result.diagnostics.html, /Help/);
  } finally {
    await diagnostic.portal.close();
  }
});

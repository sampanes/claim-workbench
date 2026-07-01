// Shared harness for worker integration tests: a live fake portal, an HTTP
// driver logged in as the operator, and a worker holding synthetic facts.

import { readFile } from "node:fs/promises";
import { startFakePortal } from "../../../examples/fake-portal/server.mjs";
import { HttpPageDriver } from "../src/drivers/http-driver.js";
import { BrowserWorker } from "../src/worker.js";

export const TAYLOR_FACTS = Object.freeze({
  packetId: "packet_0001",
  memberId: "SYN-000123",
  memberName: "Taylor Example",
  serviceRows: [
    { lineId: "service_1", serviceDate: "2026-06-03", code: "SYN-90834", units: 1, amount: "125.00" },
    { lineId: "service_2", serviceDate: "2026-06-10", code: "SYN-90834", units: 1, amount: "125.00" }
  ],
  expectedTotal: "250.00",
  artifacts: []
});

let commandCounter = 0;

export function command(action, { mode = "SubmitWithExplicitApproval", input, packetId = "packet_0001", approvalToken = null, overrides } = {}) {
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
    approvalToken,
    input,
    ...overrides
  };
}

export async function loadRecipe() {
  return JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
}

// Log in and open a fresh claim draft as the operator would, then hand the
// same visible session to the worker. The worker never sees credentials.
export async function setup({ diagnosticMode = false, facts = TAYLOR_FACTS, startClaimFor = facts.memberId, worker: workerOptions = {} } = {}) {
  const portal = await startFakePortal();
  const recipe = await loadRecipe();
  const driver = new HttpPageDriver();
  await driver.open(`${portal.url}/portal`);
  await driver.submitForm("/portal/login", { username: "operator", password: "synthetic" });
  await driver.submitForm("/portal/claim/start", { memberId: startClaimFor });
  const worker = new BrowserWorker({ driver, recipe, facts, diagnosticMode, ...workerOptions });
  return { portal, driver, worker, recipe };
}

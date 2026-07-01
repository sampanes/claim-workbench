import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSequentialIdFactory } from "../src/ids.js";
import { applyAction, createRun, evaluateRun, WorkflowError } from "../src/workflow.js";
import { syntheticPacket } from "../src/synthetic.js";

const FIXED_CLOCK = { now: () => Date.parse("2026-07-01T15:00:00.000Z") };

async function loadRecipe() {
  return JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
}

function harness({ packet, recipe, mode }) {
  const idFactory = createSequentialIdFactory();
  let run = createRun({ packet, recipe, mode, idFactory: (prefix) => idFactory(prefix), clock: FIXED_CLOCK });
  const allEvents = [];
  return {
    get run() { return run; },
    events: allEvents,
    apply(action, payload) {
      const result = applyAction({ packet, recipe, run, action, payload, clock: FIXED_CLOCK, idFactory: (prefix) => idFactory(prefix) });
      run = result.run;
      allEvents.push(...result.events);
      return result;
    },
    evaluate(extraFindings = []) {
      return evaluateRun({ packet, recipe, run, extraFindings });
    },
    expectError(action, payload, code) {
      assert.throws(
        () => applyAction({ packet, recipe, run, action, payload, clock: FIXED_CLOCK, idFactory: (prefix) => idFactory(prefix) }),
        (error) => error instanceof WorkflowError && error.code === code,
        `expected ${action} to fail with ${code}`
      );
    }
  };
}

test("the full recipe walks the state machine to Complete", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe, mode: "SubmitWithExplicitApproval" });

  flow.apply("validate_packet");
  assert.equal(flow.run.state, "PacketValidated");
  flow.apply("generate_artifacts");
  assert.equal(flow.run.state, "ArtifactsGenerated");
  flow.apply("open_destination");
  flow.apply("match_record", { evidence: { memberId: "SYN-000123" } });
  assert.equal(flow.run.state, "RecordMatched");
  flow.apply("fill_service_rows", { commandId: "cmd_0001" });
  assert.equal(flow.run.state, "FieldsFilled");
  flow.apply("compare_totals", { evidence: { expected: "250.00", observed: "250.00" } });
  assert.equal(flow.run.state, "FieldsFilled");
  flow.apply("user_review");
  assert.equal(flow.run.state, "UserReviewed");

  flow.expectError("submit", {}, "APPROVAL_REQUIRED");
  flow.apply("submit", { approvalVerified: true });
  assert.equal(flow.run.state, "Submitted");
  flow.apply("capture_receipt", { evidence: { receiptId: "SYN-RCPT-1" } });
  flow.apply("complete");
  assert.equal(flow.run.state, "Complete");

  flow.expectError("validate_packet", {}, "RUN_TERMINAL");
  assert.equal(flow.evaluate().terminal, true);
  assert.deepEqual(flow.evaluate().availableActions, []);

  // Every applied action produced an auditable event with a readable summary.
  assert.ok(flow.events.length >= 10);
  for (const event of flow.events) {
    assert.match(event.summary, /\S/);
    assert.equal(event.runId, flow.run.id);
  }
  assert.equal(new Set(flow.events.map((event) => event.id)).size, flow.events.length);
});

test("invalid transitions and out-of-order steps are rejected", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe });
  flow.expectError("submit", { approvalVerified: true }, "TRANSITION_INVALID");
  flow.expectError("capture_receipt", {}, "TRANSITION_INVALID");
  flow.apply("validate_packet");
  // generate_artifacts is next; skipping ahead to open_destination is refused.
  flow.expectError("open_destination", {}, "TRANSITION_INVALID");
});

test("hard stops block progress and cannot be overridden", async () => {
  const recipe = await loadRecipe();
  const packet = structuredClone(syntheticPacket);
  packet.total = { amount: "999.00", currency: "USD" };
  const flow = harness({ packet, recipe });

  const evaluation = flow.evaluate();
  assert.ok(evaluation.blocking.some((finding) => finding.code === "PACKET_TOTAL_INCONSISTENT"));
  assert.ok(!evaluation.availableActions.some((action) => action.id === "generate_artifacts"));

  flow.apply("validate_packet");
  assert.equal(flow.run.state, "HardStopped");
  assert.equal(flow.run.completedSteps.length, 0);

  flow.expectError("record_override", { findingCode: "PACKET_TOTAL_INCONSISTENT", reason: "looks fine to me" }, "OVERRIDE_NOT_PERMITTED");
  // Re-validating without fixing the data keeps the packet hard stopped.
  flow.apply("validate_packet");
  assert.equal(flow.run.state, "HardStopped");
  // Manual handling stays available from a hard stop.
  flow.apply("mark_manual", { reason: "totals need source correction" });
  assert.equal(flow.run.state, "ManualHandlingRequired");
});

test("permitted warnings require a recorded override before progress", async () => {
  const recipe = await loadRecipe();
  const packet = structuredClone(syntheticPacket);
  packet.serviceLines[1].serviceDate = "2026-07-02"; // outside the period -> warning
  const flow = harness({ packet, recipe });

  flow.apply("validate_packet");
  assert.equal(flow.run.state, "Imported", "warnings hold validation open");
  assert.equal(flow.run.completedSteps.length, 0);

  flow.expectError("record_override", { findingCode: "SERVICE_DATE_OUT_OF_PERIOD" }, "REASON_REQUIRED");
  flow.expectError("record_override", { findingCode: "MISSING_SOURCE_ID", reason: "n/a" }, "OVERRIDE_NOT_PERMITTED");

  flow.apply("record_override", {
    findingCode: "SERVICE_DATE_OUT_OF_PERIOD",
    reason: "Provider confirmed the July session belongs to the June authorization."
  });
  assert.equal(flow.run.overrides.length, 1);

  flow.apply("validate_packet");
  assert.equal(flow.run.state, "PacketValidated");
  const evaluation = flow.evaluate();
  assert.equal(evaluation.blocking.length, 0);
  // The warning finding itself is still visible; only its blocking effect is lifted.
  assert.ok(evaluation.findings.some((finding) => finding.code === "SERVICE_DATE_OUT_OF_PERIOD"));
});

test("assistance modes gate reversible steps and never clear findings", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe, mode: "Observe" });
  flow.apply("validate_packet");
  flow.apply("generate_artifacts");
  flow.apply("open_destination");
  flow.apply("match_record");
  flow.expectError("fill_service_rows", {}, "MODE_NOT_ALLOWED");

  flow.expectError("set_assistance_mode", { mode: "FullAuto" }, "MODE_NOT_ALLOWED");
  flow.apply("set_assistance_mode", { mode: "RunReversibleSteps" });
  flow.apply("fill_service_rows");
  assert.equal(flow.run.state, "FieldsFilled");
});

test("a mode change cannot lift a blocking finding", async () => {
  const recipe = await loadRecipe();
  const packet = structuredClone(syntheticPacket);
  packet.total = { amount: "999.00", currency: "USD" };
  const flow = harness({ packet, recipe, mode: "Observe" });
  const before = flow.evaluate().blocking.length;
  flow.apply("set_assistance_mode", { mode: "SubmitWithExplicitApproval" });
  assert.equal(flow.evaluate().blocking.length, before);
  flow.apply("validate_packet");
  assert.equal(flow.run.state, "HardStopped");
});

test("undo reopens the fill, comparison, and review steps", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe, mode: "SubmitWithExplicitApproval" });
  for (const [action, payload] of [
    ["validate_packet", {}], ["generate_artifacts", {}], ["open_destination", {}],
    ["match_record", {}], ["fill_service_rows", {}], ["compare_totals", {}], ["user_review", {}]
  ]) {
    flow.apply(action, payload);
  }
  assert.equal(flow.run.state, "UserReviewed");

  flow.apply("undo_fill");
  assert.equal(flow.run.state, "RecordMatched");
  const completed = flow.run.completedSteps.map((step) => step.stepId);
  assert.ok(!completed.includes("fill-service-rows"));
  assert.ok(!completed.includes("verify-total"));
  assert.ok(!completed.includes("review"));

  // The recipe requires refilling before reviewing again.
  flow.expectError("user_review", {}, "TRANSITION_INVALID");
  flow.apply("fill_service_rows");
  assert.equal(flow.run.state, "FieldsFilled");
});

test("manual handling requires a reason and is terminal", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe });
  flow.expectError("mark_manual", {}, "REASON_REQUIRED");
  flow.apply("mark_manual", { reason: "operator preference" });
  assert.equal(flow.run.state, "ManualHandlingRequired");
  flow.expectError("validate_packet", {}, "RUN_TERMINAL");
});

test("unknown actions are rejected", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe });
  flow.expectError("launch_missiles", {}, "UNKNOWN_ACTION");
});

test("evaluation is deterministic for identical inputs", async () => {
  const recipe = await loadRecipe();
  const flow = harness({ packet: syntheticPacket, recipe });
  flow.apply("validate_packet");
  const first = flow.evaluate();
  const second = flow.evaluate();
  assert.deepEqual(first, second);
  assert.equal(first.nextStep.id, "generate-artifacts");
  assert.ok(first.availableActions.some((action) => action.id === "generate_artifacts"));
});

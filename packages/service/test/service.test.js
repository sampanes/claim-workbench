import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSequentialIdFactory } from "@claim-workbench/core";
import { ClaimService } from "../src/service.js";

const exampleDir = new URL("../../../examples/synthetic-eap/", import.meta.url);
const FIXED_CLOCK = { now: () => Date.parse("2026-07-01T16:00:00.000Z") };

async function fixtures() {
  return {
    csvText: await readFile(new URL("data/synthetic-eap-2026-06.csv", exampleDir), "utf8"),
    revisedCsv: await readFile(new URL("data/synthetic-eap-2026-06-revised.csv", exampleDir), "utf8"),
    mapping: JSON.parse(await readFile(new URL("mapping.json", exampleDir), "utf8")),
    recipe: JSON.parse(await readFile(new URL("recipe.json", exampleDir), "utf8"))
  };
}

function makeService(recipe, dbPath = ":memory:") {
  return new ClaimService({
    dbPath,
    recipes: [recipe],
    clock: FIXED_CLOCK,
    idFactory: createSequentialIdFactory()
  });
}

test("import persists packets and surfaces summaries", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  const result = service.importCsv({ csvText, mapping, sourceName: "synthetic-eap-2026-06.csv" });
  assert.equal(result.packets.length, 2);
  assert.deepEqual(result.findings, []);
  assert.equal(service.listPackets().length, 2);
  const packet = service.getPacket({ packetId: result.packets[0].id });
  assert.equal(packet.workflowState, "Imported");
  service.close();
});

test("a repeat import creates duplicate-review findings, not silent work", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const second = service.importCsv({ csvText, mapping, sourceName: "second.csv" });
  for (const review of second.reviews) assert.equal(review.verdict, "duplicate");
  for (const summary of second.packets) {
    const packet = service.getPacket({ packetId: summary.id });
    assert.ok(packet.findings.some((finding) => finding.code === "DUPLICATE_SERVICE"));
  }
  service.close();
});

test("runs persist and resume identically after a restart", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const dir = await mkdtemp(join(tmpdir(), "claim-workbench-"));
  const dbPath = join(dir, "workbench.db");
  try {
    const service = makeService(recipe, dbPath);
    const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
    const { run } = service.startRun({ packetId: packets[0].id });
    service.act({ runId: run.id, action: "validate_packet" });
    service.act({ runId: run.id, action: "generate_artifacts" });
    const before = service.getRun({ runId: run.id });
    const evaluationBefore = service.evaluate({ runId: run.id });
    service.close();

    // Restart: a brand-new service instance over the same database.
    const restarted = new ClaimService({ dbPath, recipes: [recipe], clock: FIXED_CLOCK });
    const after = restarted.getRunForPacket({ packetId: packets[0].id });
    assert.deepEqual(after, before);
    assert.equal(after.state, "ArtifactsGenerated");
    assert.deepEqual(restarted.evaluate({ runId: run.id }), evaluationBefore);
    // startRun resumes instead of restarting.
    const resumed = restarted.startRun({ packetId: packets[0].id });
    assert.equal(resumed.resumed, true);
    assert.deepEqual(resumed.run, before);
    restarted.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("audit events persist in order with human-readable summaries", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const { run } = service.startRun({ packetId: packets[0].id });
  service.act({ runId: run.id, action: "validate_packet" });
  service.act({ runId: run.id, action: "generate_artifacts" });
  service.act({ runId: run.id, action: "mark_manual", payload: { reason: "operator taking over" } });
  const events = service.listAuditEvents({ runId: run.id });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3]);
  assert.match(events.at(-1).summary, /manual handling/i);
  service.close();
});

test("duplicate warnings block progress until an override is recorded", async () => {
  const { csvText, revisedCsv, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const second = service.importCsv({ csvText: revisedCsv, mapping, sourceName: "revised.csv" });
  const taylor = second.packets.find((packet) => packet.clientDisplayName === "Taylor Example");
  const { run } = service.startRun({ packetId: taylor.id });

  // Validation holds while duplicate warnings are unaddressed.
  service.act({ runId: run.id, action: "validate_packet" });
  assert.equal(service.getRun({ runId: run.id }).state, "Imported");

  service.act({ runId: run.id, action: "record_override", payload: {
    findingCode: "DUPLICATE_SERVICE",
    reason: "Kept: the June 3 session is genuinely billable once."
  } });
  service.act({ runId: run.id, action: "record_override", payload: {
    findingCode: "NEAR_DUPLICATE_SERVICE",
    reason: "Source corrected the June 10 amount; using the revised value."
  } });
  service.act({ runId: run.id, action: "validate_packet" });
  assert.equal(service.getRun({ runId: run.id }).state, "PacketValidated");
  service.close();
});

test("workflow errors carry stable codes through the service boundary", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const { run } = service.startRun({ packetId: packets[0].id });
  assert.throws(() => service.act({ runId: run.id, action: "submit" }), (error) => error.code === "TRANSITION_INVALID");
  assert.throws(() => service.act({ runId: "run_nope", action: "validate_packet" }), (error) => error.code === "RUN_NOT_FOUND");
  assert.throws(() => service.getPacket({ packetId: "packet_nope" }), (error) => error.code === "PACKET_NOT_FOUND");
  service.close();
});

test("a hard-stopped packet stays blocked in the persisted state", async () => {
  const { csvText, mapping, recipe } = await fixtures();
  const service = makeService(recipe);
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "first.csv" });
  const packet = service.getPacket({ packetId: packets[0].id });
  packet.total = { amount: "999.99", currency: "USD" };
  service.store.putPacket(packet);

  const { run } = service.startRun({ packetId: packet.id });
  service.act({ runId: run.id, action: "validate_packet" });
  assert.equal(service.getRun({ runId: run.id }).state, "HardStopped");
  assert.equal(service.getPacket({ packetId: packet.id }).workflowState, "HardStopped");
  assert.throws(
    () => service.act({ runId: run.id, action: "record_override", payload: { findingCode: "PACKET_TOTAL_INCONSISTENT", reason: "nah" } }),
    (error) => error.code === "OVERRIDE_NOT_PERMITTED"
  );
  service.close();
});

test("an invalid recipe is refused at startup", async () => {
  const { recipe } = await fixtures();
  const broken = structuredClone(recipe);
  delete broken.steps;
  assert.throws(() => makeService(broken), (error) => error.code === "RECIPE_INVALID");
});

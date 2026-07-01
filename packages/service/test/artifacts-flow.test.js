import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSequentialIdFactory } from "@claim-workbench/core";
import { ClaimService } from "../src/service.js";

const exampleDir = new URL("../../../examples/synthetic-eap/", import.meta.url);
const FIXED_CLOCK = { now: () => Date.parse("2026-07-01T17:30:00.000Z") };

async function setup(dir) {
  const csvText = await readFile(new URL("data/synthetic-eap-2026-06.csv", exampleDir), "utf8");
  const mapping = JSON.parse(await readFile(new URL("mapping.json", exampleDir), "utf8"));
  const recipe = JSON.parse(await readFile(new URL("recipe.json", exampleDir), "utf8"));
  const service = new ClaimService({
    dbPath: join(dir, "workbench.db"),
    artifactDir: join(dir, "artifacts"),
    recipes: [recipe],
    clock: FIXED_CLOCK,
    idFactory: createSequentialIdFactory()
  });
  const { packets } = service.importCsv({ csvText, mapping, sourceName: "synthetic-eap-2026-06.csv" });
  const { run } = service.startRun({ packetId: packets[0].id });
  service.act({ runId: run.id, action: "validate_packet" });
  return { service, recipe, runId: run.id, packetId: packets[0].id, dir };
}

test("generate_artifacts writes files, records a manifest, and advances the run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claim-workbench-artifacts-"));
  try {
    const { service, runId, packetId } = await setup(dir);
    const result = service.act({ runId, action: "generate_artifacts" });
    assert.equal(result.run.state, "ArtifactsGenerated");

    const packet = service.getPacket({ packetId });
    assert.equal(packet.artifacts.manifestVersion, "1");
    assert.equal(packet.artifacts.entries.length, 1);
    const entry = packet.artifacts.entries[0];
    assert.equal(entry.kind, "claim-summary");
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);

    const filePath = join(dir, "artifacts", ...entry.filename.split("/"));
    assert.ok(existsSync(filePath), "artifact file exists on disk");
    const content = await readFile(filePath, "utf8");
    assert.match(content, /Claim summary/);

    // Verification is clean, so the destination step is available.
    const evaluation = service.evaluate({ runId });
    assert.deepEqual(evaluation.blocking, []);
    assert.ok(evaluation.availableActions.some((action) => action.id === "open_destination"));
    service.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tampered artifacts block progress until regeneration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claim-workbench-artifacts-"));
  try {
    const { service, runId, packetId } = await setup(dir);
    service.act({ runId, action: "generate_artifacts" });
    const entry = service.getPacket({ packetId }).artifacts.entries[0];
    const filePath = join(dir, "artifacts", ...entry.filename.split("/"));
    await writeFile(filePath, "tampered content", "utf8");

    const evaluation = service.evaluate({ runId });
    assert.ok(evaluation.blocking.some((finding) => finding.code === "ARTIFACT_TAMPERED"));
    assert.ok(!evaluation.availableActions.some((action) => action.id === "open_destination"));
    // Regeneration stays available even though the finding is a hard stop.
    assert.ok(evaluation.availableActions.some((action) => action.id === "generate_artifacts"));
    assert.throws(
      () => service.act({ runId, action: "open_destination" }),
      (error) => error.code === "BLOCKED_BY_HARD_STOP"
    );

    // Regenerate: the step re-executes idempotently and clears the block.
    const regenerated = service.act({ runId, action: "generate_artifacts" });
    assert.equal(regenerated.run.state, "ArtifactsGenerated");
    assert.equal(regenerated.run.completedSteps.filter((step) => step.action === "generate_artifacts").length, 1);
    assert.deepEqual(service.evaluate({ runId }).blocking, []);
    service.act({ runId, action: "open_destination" });
    assert.equal(service.getRun({ runId }).state, "DestinationOpened");
    service.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a deleted artifact file is reported missing after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claim-workbench-artifacts-"));
  try {
    const { service, recipe, runId, packetId } = await setup(dir);
    service.act({ runId, action: "generate_artifacts" });
    const entry = service.getPacket({ packetId }).artifacts.entries[0];
    service.close();

    await rm(join(dir, "artifacts", ...entry.filename.split("/")));
    const restarted = new ClaimService({
      dbPath: join(dir, "workbench.db"),
      artifactDir: join(dir, "artifacts"),
      recipes: [recipe],
      clock: FIXED_CLOCK
    });
    const evaluation = restarted.evaluate({ runId });
    assert.ok(evaluation.blocking.some((finding) => finding.code === "ARTIFACT_MISSING"));
    restarted.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("repeated generation with unchanged facts produces identical hashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claim-workbench-artifacts-"));
  try {
    const { service, runId, packetId } = await setup(dir);
    service.act({ runId, action: "generate_artifacts" });
    const first = service.getPacket({ packetId }).artifacts.entries[0].sha256;
    service.act({ runId, action: "generate_artifacts" });
    const second = service.getPacket({ packetId }).artifacts.entries[0].sha256;
    assert.equal(first, second);
    service.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

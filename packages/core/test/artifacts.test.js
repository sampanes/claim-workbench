import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  artifactFilename,
  buildManifest,
  generateClaimSummaryHtml,
  makeManifestEntry,
  verifyArtifacts
} from "../src/artifacts.js";
import { sha256Hex } from "../src/sha256.js";
import { syntheticPacket } from "../src/synthetic.js";

const GENERATED_AT = "2026-07-01T17:00:00.000Z";

async function loadRecipe() {
  return JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
}

function generate(packet = syntheticPacket) {
  const content = generateClaimSummaryHtml(packet);
  const filename = artifactFilename(packet, "claim-summary", "html");
  const entry = makeManifestEntry({
    artifactId: "artifact_0001",
    kind: "claim-summary",
    filename,
    mediaType: "text/html",
    content,
    generatedAt: GENERATED_AT
  });
  const manifest = buildManifest({ packet, entries: [entry], generatedAt: GENERATED_AT });
  return { content, filename, entry, manifest };
}

test("document generation is deterministic for identical packet facts", () => {
  const first = generateClaimSummaryHtml(syntheticPacket);
  const second = generateClaimSummaryHtml(structuredClone(syntheticPacket));
  assert.equal(first, second);
  assert.equal(sha256Hex(first), sha256Hex(second));
  assert.match(first, /Taylor Example/);
  assert.match(first, /USD 250\.00/);
  assert.match(first, /Synthetic document/);
});

test("html output escapes markup in packet facts", () => {
  const packet = structuredClone(syntheticPacket);
  packet.serviceLines[0].description = '<script>alert("x")</script>';
  const content = generateClaimSummaryHtml(packet);
  assert.ok(!content.includes("<script>alert"));
  assert.match(content, /&lt;script&gt;/);
});

test("filenames and folder layout are deterministic", () => {
  assert.equal(artifactFilename(syntheticPacket, "claim-summary", "html"), "packet_synthetic_001/claim-summary.html");
});

test("a fresh, intact artifact set verifies cleanly", async () => {
  const recipe = await loadRecipe();
  const { content, filename, manifest } = generate();
  const findings = verifyArtifacts({ packet: syntheticPacket, recipe, manifest, files: new Map([[filename, content]]) });
  assert.deepEqual(findings, []);
});

test("a missing file is reported and names its resolving action", async () => {
  const recipe = await loadRecipe();
  const { filename, manifest } = generate();
  const findings = verifyArtifacts({ packet: syntheticPacket, recipe, manifest, files: new Map([[filename, null]]) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "ARTIFACT_MISSING");
  assert.equal(findings[0].severity, "hard_stop");
  assert.equal(findings[0].data.resolvedBy, "generate_artifacts");
});

test("modified content is reported as tampering", async () => {
  const recipe = await loadRecipe();
  const { content, filename, manifest } = generate();
  const findings = verifyArtifacts({
    packet: syntheticPacket, recipe, manifest,
    files: new Map([[filename, content.replace("250.00", "999.00")]])
  });
  assert.deepEqual(findings.map((finding) => finding.code), ["ARTIFACT_TAMPERED"]);
});

test("changed packet facts make every artifact stale", async () => {
  const recipe = await loadRecipe();
  const { content, filename, manifest } = generate();
  const changed = structuredClone(syntheticPacket);
  changed.serviceLines[0].amount = { amount: "130.00", currency: "USD" };
  const findings = verifyArtifacts({ packet: changed, recipe, manifest, files: new Map([[filename, content]]) });
  assert.ok(findings.some((finding) => finding.code === "ARTIFACT_STALE"));
});

test("a required kind absent from the manifest is missing", async () => {
  const recipe = await loadRecipe();
  const manifest = buildManifest({ packet: syntheticPacket, entries: [], generatedAt: GENERATED_AT });
  const findings = verifyArtifacts({ packet: syntheticPacket, recipe, manifest, files: new Map() });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "ARTIFACT_MISSING");
  assert.equal(findings[0].data.kind, "claim-summary");
});

test("no manifest means no artifact findings; step order handles generation", async () => {
  const recipe = await loadRecipe();
  assert.deepEqual(verifyArtifacts({ packet: syntheticPacket, recipe, manifest: null, files: new Map() }), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRecipe, validateRecipe, evaluateRequiredFields, getPacketPath } from "../src/recipe.js";
import { getHelpTopic } from "../src/assistance.js";
import { getAction } from "../src/actions.js";
import { syntheticPacket } from "../src/synthetic.js";

const recipeUrl = new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url);

async function loadRecipe() {
  return JSON.parse(await readFile(recipeUrl, "utf8"));
}

test("the synthetic recipe parses and validates cleanly", async () => {
  const { recipe, findings } = parseRecipe(await readFile(recipeUrl, "utf8"));
  assert.deepEqual(findings, []);
  assert.equal(recipe.id, "synthetic-eap-monthly");
});

test("every recipe step names a known action and a resolvable help topic", async () => {
  const recipe = await loadRecipe();
  for (const step of recipe.steps) {
    assert.ok(getAction(step.action), `unknown action ${step.action}`);
    assert.ok(getHelpTopic(step.helpTopicId), `unresolvable topic ${step.helpTopicId}`);
  }
  for (const field of recipe.requiredFields) {
    assert.ok(getHelpTopic(field.helpTopicId), `unresolvable field topic ${field.helpTopicId}`);
  }
  for (const artifact of recipe.requiredArtifacts) {
    assert.ok(getHelpTopic(artifact.helpTopicId), `unresolvable artifact topic ${artifact.helpTopicId}`);
  }
});

test("an unsupported recipe version is rejected without interpretation", async () => {
  const recipe = { ...(await loadRecipe()), recipeVersion: "99" };
  const findings = validateRecipe(recipe);
  assert.deepEqual(findings.map((finding) => finding.code), ["RECIPE_SCHEMA_UNSUPPORTED"]);
});

test("duplicate step ids and unknown actions are hard stops", async () => {
  const recipe = await loadRecipe();
  recipe.steps[1].id = recipe.steps[0].id;
  recipe.steps[2].action = "do_magic";
  const findings = validateRecipe(recipe);
  const messages = findings.map((finding) => finding.message).join("\n");
  assert.match(messages, /Duplicate step id/);
  assert.match(messages, /unknown action "do_magic"/);
});

test("an irreversible step without an approval gate is rejected", async () => {
  const recipe = await loadRecipe();
  const submit = recipe.steps.find((step) => step.id === "submit");
  delete submit.approvalGate;
  const findings = validateRecipe(recipe);
  assert.ok(findings.some((finding) => finding.code === "RECIPE_GATE_MISSING"));
});

test("a recipe cannot mark a hard stop as overridable", async () => {
  const recipe = await loadRecipe();
  recipe.overridableWarnings.push("PACKET_TOTAL_INCONSISTENT");
  const findings = validateRecipe(recipe);
  assert.ok(findings.some((finding) => finding.message.includes("PACKET_TOTAL_INCONSISTENT")));
});

test("required-field evaluation resolves packet paths", async () => {
  const recipe = await loadRecipe();
  assert.equal(getPacketPath(syntheticPacket, "client.externalIds.sourceClientId"), "SYN-000123");
  assert.deepEqual(evaluateRequiredFields(recipe, syntheticPacket), []);

  const missing = structuredClone(syntheticPacket);
  delete missing.client.externalIds.sourceClientId;
  const findings = evaluateRequiredFields(recipe, missing);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "MISSING_REQUIRED_FIELD");
  assert.equal(findings[0].path, "client.externalIds.sourceClientId");
  assert.equal(findings[0].data.label, "Member ID");
});

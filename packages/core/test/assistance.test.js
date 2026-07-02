import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { buildContextEnvelope, renderNoModelAnswer, getHelpTopic, searchHelpTopics } from "../src/assistance.js";
import { createSequentialIdFactory } from "../src/ids.js";
import { applyAction, createRun, evaluateRun } from "../src/workflow.js";
import { syntheticPacket } from "../src/synthetic.js";

const FIXED_CLOCK = { now: () => Date.parse("2026-07-01T19:00:00.000Z") };

async function loadRecipe() {
  return JSON.parse(await readFile(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url), "utf8"));
}

function walk(packet, recipe, actions, mode = "SubmitWithExplicitApproval") {
  const idFactory = createSequentialIdFactory();
  let run = createRun({ packet, recipe, mode, idFactory, clock: FIXED_CLOCK });
  for (const [action, payload] of actions) {
    ({ run } = applyAction({ packet, recipe, run, action, payload, clock: FIXED_CLOCK, idFactory }));
  }
  return run;
}

test("context envelopes are redacted by construction", async () => {
  const recipe = await loadRecipe();
  const run = walk(syntheticPacket, recipe, [["validate_packet", {}]]);
  const evaluation = evaluateRun({ packet: syntheticPacket, recipe, run });
  const envelope = buildContextEnvelope({ screen: "workflow", evaluation });

  const serialized = JSON.stringify(envelope);
  // No client names, identifiers, or money amounts leave the application.
  assert.ok(!serialized.includes("Taylor"), "client display name must not appear");
  assert.ok(!serialized.includes("SYN-000123"), "member identifiers must not appear");
  assert.ok(!serialized.includes("250.00"), "amounts must not appear");
  assert.equal(envelope.contextVersion, "1");
  assert.equal(envelope.state, "PacketValidated");
  // Every referenced help topic resolves.
  for (const topicId of envelope.helpTopics) {
    assert.ok(getHelpTopic(topicId), `unresolvable topic ${topicId}`);
  }
});

test("envelopes respect the context budget", async () => {
  const recipe = await loadRecipe();
  const run = walk(syntheticPacket, recipe, []);
  const evaluation = evaluateRun({ packet: syntheticPacket, recipe, run });
  assert.throws(() => buildContextEnvelope({ screen: "workflow", evaluation, maxBytes: 64 }), /over the 64-byte budget/);
});

test("a blocked run's envelope cannot expose unavailable actions", async () => {
  const recipe = await loadRecipe();
  const packet = structuredClone(syntheticPacket);
  packet.total = { amount: "999.00", currency: "USD" }; // hard stop
  const run = walk(packet, recipe, []);
  const evaluation = evaluateRun({ packet, recipe, run });
  const envelope = buildContextEnvelope({ screen: "workflow", evaluation });

  assert.ok(!envelope.availableActions.some((action) => action.id === "submit"));
  assert.ok(!envelope.availableActions.some((action) => action.id === "generate_artifacts"));

  const { answer } = renderNoModelAnswer(envelope, "How do I submit the claim?");
  assert.match(answer, /does not cover that question/);
  assert.ok(!answer.includes("Submit claim"));
});

test("the no-model summary cites only supplied topics and actions", async () => {
  const recipe = await loadRecipe();
  const run = walk(syntheticPacket, recipe, [["validate_packet", {}]]);
  const evaluation = evaluateRun({ packet: syntheticPacket, recipe, run });
  const envelope = buildContextEnvelope({ screen: "workflow", evaluation });
  const { answer, citations } = renderNoModelAnswer(envelope);

  assert.match(answer, /Current state: PacketValidated/);
  assert.ok(citations.length > 0);
  for (const citation of citations) {
    assert.ok(envelope.helpTopics.includes(citation), `citation ${citation} must come from the envelope`);
  }
});

test("help topic search finds topics without a model", () => {
  const results = searchHelpTopics("totals");
  assert.ok(results.some((topic) => topic.id === "finding.total_mismatch"));
  assert.deepEqual(searchHelpTopics(""), []);
});

test("assistance regression fixtures hold", async () => {
  const dir = new URL("../fixtures/assistance/", import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  assert.ok(names.length >= 3);
  for (const name of names) {
    const fixture = JSON.parse(await readFile(new URL(name, dir), "utf8"));
    const bytes = new TextEncoder().encode(JSON.stringify(fixture.envelope)).length;
    assert.ok(bytes <= fixture.maxBytes, `${fixture.name}: envelope is ${bytes} bytes, over ${fixture.maxBytes}`);

    const { answer, citations } = renderNoModelAnswer(fixture.envelope, fixture.question);
    if (fixture.expectInsufficient) {
      assert.match(answer, /does not cover that question/, fixture.name);
    }
    for (const required of fixture.requiredCitations) {
      assert.ok(citations.includes(required), `${fixture.name}: missing citation ${required}`);
    }
    for (const phrase of fixture.prohibitedPhrases) {
      assert.ok(!answer.includes(phrase), `${fixture.name}: answer must not contain ${JSON.stringify(phrase)}`);
    }
    // Deterministic topic retrieval: every topic the fixture references resolves.
    for (const topicId of fixture.envelope.helpTopics) {
      assert.ok(getHelpTopic(topicId), `${fixture.name}: unresolvable topic ${topicId}`);
    }
  }
});

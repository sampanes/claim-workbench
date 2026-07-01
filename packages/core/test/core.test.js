import test from "node:test";
import assert from "node:assert/strict";
import { helpTopics, packetTotal, renderHelpTopic, syntheticPacket } from "../src/index.js";

test("calculates synthetic packet total with decimal strings", () => {
  assert.deepEqual(packetTotal(syntheticPacket), { amount: "250.00", currency: "USD" });
});

test("renders deterministic no-model help", () => {
  const rendered = renderHelpTopic(helpTopics[0]);
  assert.match(rendered, /Packet imported/);
  assert.match(rendered, /Validation findings decide/);
});

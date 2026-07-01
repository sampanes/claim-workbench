import test from "node:test";
import assert from "node:assert/strict";
import { syntheticPacket } from "@claim-workbench/core";

test("web skeleton uses synthetic data only", () => {
  assert.match(syntheticPacket.id, /^packet_synthetic_/);
  assert.equal(syntheticPacket.findings.length, 0);
});

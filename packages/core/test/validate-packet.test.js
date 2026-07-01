import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePacket, formatValidationReport } from "../src/validate-packet.js";
import { syntheticPacket } from "../src/synthetic.js";
import { findingDefinition, listFindingCodes } from "../src/findings.js";
import { findTopicForFinding, getHelpTopic } from "../src/assistance.js";

async function fixture(name) {
  const raw = await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
  return JSON.parse(raw);
}

function codes(result) {
  return result.findings.map((finding) => finding.code);
}

test("the synthetic packet fixture matches the in-memory fixture", async () => {
  assert.deepEqual(await fixture("valid-packet.json"), syntheticPacket);
});

test("a valid packet passes with no findings", () => {
  const result = validatePacket(syntheticPacket);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.computedTotal, { amount: "250.00", currency: "USD" });
});

test("missing client identifier is a hard stop with a stable code and path", async () => {
  const result = validatePacket(await fixture("invalid-missing-identifier.json"));
  assert.equal(result.ok, false);
  const finding = result.findings.find((item) => item.code === "MISSING_REQUIRED_FIELD");
  assert.ok(finding);
  assert.equal(finding.path, "client.id");
  assert.equal(finding.severity, "hard_stop");
});

test("an impossible calendar date is rejected", async () => {
  const result = validatePacket(await fixture("invalid-date.json"));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("INVALID_SERVICE_DATE"));
});

test("malformed money is rejected", async () => {
  const result = validatePacket(await fixture("invalid-money.json"));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("MALFORMED_MONEY"));
});

test("an inconsistent declared total is a hard stop with both values in data", async () => {
  const result = validatePacket(await fixture("invalid-total.json"));
  assert.equal(result.ok, false);
  const finding = result.findings.find((item) => item.code === "PACKET_TOTAL_INCONSISTENT");
  assert.ok(finding);
  assert.deepEqual(finding.data.declared, { amount: "240.00", currency: "USD" });
  assert.deepEqual(finding.data.computed, { amount: "250.00", currency: "USD" });
});

test("unknown future schema versions are rejected without further interpretation", () => {
  const result = validatePacket({ ...syntheticPacket, schemaVersion: "999" });
  assert.deepEqual(codes(result), ["PACKET_SCHEMA_UNSUPPORTED"]);
  assert.equal(result.ok, false);
});

test("non-object input is malformed, not a crash", () => {
  for (const bad of [null, undefined, 42, "packet", []]) {
    const result = validatePacket(bad);
    assert.deepEqual(codes(result), ["PACKET_MALFORMED"]);
  }
});

test("duplicate service line ids are reported", () => {
  const packet = structuredClone(syntheticPacket);
  packet.serviceLines[1].id = packet.serviceLines[0].id;
  const result = validatePacket(packet);
  assert.ok(codes(result).includes("DUPLICATE_SERVICE_LINE_ID"));
});

test("empty service lines are a hard stop", () => {
  const packet = { ...syntheticPacket, serviceLines: [] };
  const result = validatePacket(packet);
  assert.ok(codes(result).includes("EMPTY_SERVICE_LINES"));
});

test("mixed currencies are a hard stop", () => {
  const packet = structuredClone(syntheticPacket);
  packet.serviceLines[1].amount.currency = "EUR";
  const result = validatePacket(packet);
  assert.ok(codes(result).includes("CURRENCY_MISMATCH"));
});

test("a service date outside the period is a warning, not a hard stop", () => {
  const packet = structuredClone(syntheticPacket);
  packet.serviceLines[1].serviceDate = "2026-07-02";
  const result = validatePacket(packet);
  const finding = result.findings.find((item) => item.code === "SERVICE_DATE_OUT_OF_PERIOD");
  assert.ok(finding);
  assert.equal(finding.severity, "warning");
  assert.equal(result.ok, true);
});

test("missing source ids produce one aggregated notice", () => {
  const packet = structuredClone(syntheticPacket);
  delete packet.serviceLines[0].sourceId;
  delete packet.serviceLines[1].sourceId;
  const result = validatePacket(packet);
  const notices = result.findings.filter((item) => item.code === "MISSING_SOURCE_ID");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].severity, "notice");
  assert.deepEqual(notices[0].data.lineIds, ["service_1", "service_2"]);
  assert.equal(result.ok, true);
});

test("every registered finding code has a resolvable help topic", () => {
  for (const code of listFindingCodes()) {
    const definition = findingDefinition(code);
    const topic = getHelpTopic(definition.helpTopicId);
    assert.ok(topic, `finding ${code} points at missing help topic ${definition.helpTopicId}`);
    const applied = findTopicForFinding(code);
    // INVALID_CURRENCY intentionally shares the malformed-money topic.
    if (code !== "INVALID_CURRENCY") {
      assert.ok(applied, `no topic appliesWhen.findingCode for ${code}`);
    }
  }
});

test("the validation report is readable and mentions codes", async () => {
  const result = validatePacket(await fixture("invalid-total.json"));
  const report = formatValidationReport(result);
  assert.match(report, /PACKET_TOTAL_INCONSISTENT/);
  assert.match(report, /RESULT: HARD STOP/);
  const good = formatValidationReport(validatePacket(syntheticPacket));
  assert.match(good, /RESULT: PASS/);
});

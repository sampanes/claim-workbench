import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSequentialIdFactory } from "../src/ids.js";
import { importCsv, normalizeAmount, normalizeServiceDate } from "../src/import.js";
import { validatePacket } from "../src/validate-packet.js";

const exampleDir = new URL("../../../examples/synthetic-eap/", import.meta.url);
const IMPORTED_AT = "2026-07-01T12:00:00.000Z";

async function loadExample(name = "data/synthetic-eap-2026-06.csv") {
  const csvText = await readFile(new URL(name, exampleDir), "utf8");
  const mapping = JSON.parse(await readFile(new URL("mapping.json", exampleDir), "utf8"));
  return { csvText, mapping };
}

function importExample(csvText, mapping, sourceName = "synthetic-eap-2026-06.csv") {
  return importCsv({
    csvText,
    mapping,
    sourceName,
    importedAt: IMPORTED_AT,
    idFactory: createSequentialIdFactory()
  });
}

test("normalizes amounts from common report formats", () => {
  assert.equal(normalizeAmount("$125.00"), "125.00");
  assert.equal(normalizeAmount("125"), "125.00");
  assert.equal(normalizeAmount("125.5"), "125.50");
  assert.equal(normalizeAmount("1,250.00"), "1250.00");
  assert.equal(normalizeAmount("1,234,567.89"), "1234567.89");
  assert.equal(normalizeAmount("0125.00"), "125.00");
  assert.equal(normalizeAmount("125.005"), null);
  assert.equal(normalizeAmount("-5.00"), null);
  assert.equal(normalizeAmount(""), null);
  // A comma decimal or misgrouped amount must be rejected, never silently read
  // as a 10x/100x overstatement.
  assert.equal(normalizeAmount("1,50"), null);
  assert.equal(normalizeAmount("1,5"), null);
  assert.equal(normalizeAmount("1,5,0"), null);
  assert.equal(normalizeAmount("1,50,000"), null);
  // Cents that push the value past the safe integer range are rejected here,
  // not left to crash packetTotal mid-import.
  assert.equal(normalizeAmount("90071992547409.99"), null);
});

test("normalizes ISO and US-style service dates", () => {
  assert.equal(normalizeServiceDate("2026-06-03"), "2026-06-03");
  assert.equal(normalizeServiceDate("06/05/2026"), "2026-06-05");
  assert.equal(normalizeServiceDate("6/5/2026"), "2026-06-05");
  assert.equal(normalizeServiceDate("02/30/2026"), null);
  assert.equal(normalizeServiceDate("June 5"), null);
});

test("imports the synthetic example into one packet per client", async () => {
  const { csvText, mapping } = await loadExample();
  const { batch, packets, findings } = importExample(csvText, mapping);

  assert.deepEqual(findings, []);
  assert.equal(batch.rowCount, 4);
  assert.deepEqual(batch.dateRange, { start: "2026-06-03", end: "2026-06-19" });
  assert.match(batch.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(packets.length, 2);

  const [taylor, jordan] = packets;
  assert.equal(taylor.client.externalIds.sourceClientId, "SYN-000123");
  assert.deepEqual(taylor.total, { amount: "250.00", currency: "USD" });
  assert.deepEqual(taylor.period, { start: "2026-06-03", end: "2026-06-10" });
  assert.equal(jordan.client.externalIds.sourceClientId, "SYN-000456");
  assert.deepEqual(jordan.total, { amount: "360.00", currency: "USD" });
  // The US-style date and bare amount were normalized.
  assert.equal(jordan.serviceLines[0].serviceDate, "2026-06-05");
  assert.equal(jordan.serviceLines[0].amount.amount, "180.00");

  for (const packet of packets) {
    const result = validatePacket(packet);
    assert.deepEqual(result.findings, [], `imported packet ${packet.id} should validate cleanly`);
  }
});

test("row order does not change packet content", async () => {
  const { csvText, mapping } = await loadExample();
  const lines = csvText.trim().split("\n");
  const reordered = [lines[0], lines[4], lines[2], lines[1], lines[3]].join("\n");

  const original = importExample(csvText, mapping);
  const shuffled = importExample(reordered, mapping);

  const strip = (packets) => packets.map((packet) => ({
    client: packet.client,
    total: packet.total,
    period: packet.period,
    fingerprints: packet.serviceLines.map((line) => line.fingerprint)
  }));
  assert.deepEqual(strip(shuffled.packets), strip(original.packets));
});

test("a missing mapped column stops the import with a stable code", async () => {
  const { mapping } = await loadExample();
  const { packets, findings } = importExample("Row ID,Member Name\nSYN-ROW-1,Taylor\n", mapping);
  assert.equal(packets.length, 0);
  assert.ok(findings.some((finding) => finding.code === "IMPORT_MISSING_COLUMN"));
});

test("an invalid row becomes findings on the batch and the affected packet", async () => {
  const { csvText, mapping } = await loadExample();
  const bad = `${csvText.trim()}\nSYN-ROW-0009,SYN-000123,Taylor Example,not-a-date,SYN-90834,Bad row,1,125.00\n`;
  const { packets, findings } = importExample(bad, mapping);
  const batchFinding = findings.find((finding) => finding.code === "IMPORT_ROW_INVALID");
  assert.ok(batchFinding);
  assert.equal(batchFinding.data.rowNumber, 6);
  const taylor = packets.find((packet) => packet.client.externalIds.sourceClientId === "SYN-000123");
  assert.ok(taylor.findings.some((finding) => finding.code === "IMPORT_ROW_INVALID"));
  // The valid rows still imported.
  assert.equal(taylor.serviceLines.length, 2);
});

test("empty and unparseable reports produce stable codes", async () => {
  const { mapping } = await loadExample();
  const header = "Row ID,Member ID,Member Name,Service Date,Service Code,Description,Units,Amount\n";
  assert.ok(importExample(header, mapping).findings.some((finding) => finding.code === "IMPORT_EMPTY"));
  assert.ok(importExample('a,"b\n', mapping).findings.some((finding) => finding.code === "IMPORT_PARSE_ERROR"));
});

test("an unsupported mapping version is rejected", async () => {
  const { csvText, mapping } = await loadExample();
  const { findings, packets } = importExample(csvText, { ...mapping, mappingVersion: "99" });
  assert.equal(packets.length, 0);
  assert.ok(findings.some((finding) => finding.code === "IMPORT_MAPPING_INVALID"));
});

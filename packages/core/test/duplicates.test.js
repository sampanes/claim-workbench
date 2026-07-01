import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSequentialIdFactory } from "../src/ids.js";
import { importCsv } from "../src/import.js";
import { detectDuplicates, serviceLedgerFromPackets } from "../src/duplicates.js";

const exampleDir = new URL("../../../examples/synthetic-eap/", import.meta.url);

async function importFixture(name, mappingOverrides = {}) {
  const csvText = await readFile(new URL(`data/${name}`, exampleDir), "utf8");
  const mapping = { ...JSON.parse(await readFile(new URL("mapping.json", exampleDir), "utf8")), ...mappingOverrides };
  return { csvText, result: importCsv({
    csvText,
    mapping,
    sourceName: name,
    importedAt: "2026-07-01T12:00:00.000Z",
    idFactory: createSequentialIdFactory()
  }) };
}

test("re-importing the identical report creates no duplicate work", async () => {
  const first = (await importFixture("synthetic-eap-2026-06.csv")).result;
  const second = (await importFixture("synthetic-eap-2026-06.csv")).result;
  const ledger = serviceLedgerFromPackets(first.packets);
  const reviews = detectDuplicates(ledger, second.packets);

  assert.equal(reviews.length, 2);
  for (const review of reviews) {
    assert.equal(review.verdict, "duplicate");
    for (const line of review.lineReviews) {
      assert.equal(line.verdict, "duplicate");
      assert.equal(line.reason, "fingerprint_match");
      assert.ok(line.existing.packetId);
    }
  }
  // Warning findings landed on the incoming packets so the workflow cannot
  // proceed without a recorded override.
  for (const packet of second.packets) {
    const finding = packet.findings.find((item) => item.code === "DUPLICATE_SERVICE");
    assert.ok(finding);
    assert.equal(finding.severity, "warning");
  }
});

test("an overlapping revised report is classified line by line", async () => {
  const first = (await importFixture("synthetic-eap-2026-06.csv")).result;
  const revised = (await importFixture("synthetic-eap-2026-06-revised.csv")).result;
  const ledger = serviceLedgerFromPackets(first.packets);
  const reviews = detectDuplicates(ledger, revised.packets);

  const byClient = new Map(revised.packets.map((packet) => [packet.client.externalIds.sourceClientId, packet.id]));
  const jordan = reviews.find((review) => review.packetId === byClient.get("SYN-000456"));
  const taylor = reviews.find((review) => review.packetId === byClient.get("SYN-000123"));

  assert.equal(jordan.verdict, "duplicate");

  assert.equal(taylor.verdict, "needs_review");
  const reasons = taylor.lineReviews.map((line) => `${line.verdict}:${line.reason}`).sort();
  assert.deepEqual(reasons, [
    "duplicate:fingerprint_match",
    "fresh:null",
    "near_duplicate:source_row_changed"
  ]);
});

test("without source ids, fingerprints still catch exact duplicates", async () => {
  const noSourceIds = { columns: {
    clientId: "Member ID", clientName: "Member Name", serviceDate: "Service Date",
    code: "Service Code", description: "Description", units: "Units", amount: "Amount"
  } };
  const first = (await importFixture("synthetic-eap-2026-06.csv", noSourceIds)).result;
  const second = (await importFixture("synthetic-eap-2026-06.csv", noSourceIds)).result;
  const reviews = detectDuplicates(serviceLedgerFromPackets(first.packets), second.packets);
  for (const review of reviews) assert.equal(review.verdict, "duplicate");
});

test("without source ids, a changed amount is a near duplicate by service content", async () => {
  const noSourceIds = { columns: {
    clientId: "Member ID", clientName: "Member Name", serviceDate: "Service Date",
    code: "Service Code", description: "Description", units: "Units", amount: "Amount"
  } };
  const first = (await importFixture("synthetic-eap-2026-06.csv", noSourceIds)).result;
  const revised = (await importFixture("synthetic-eap-2026-06-revised.csv", noSourceIds)).result;
  const reviews = detectDuplicates(serviceLedgerFromPackets(first.packets), revised.packets);
  const taylor = reviews.find((review) =>
    revised.packets.find((packet) => packet.id === review.packetId).client.externalIds.sourceClientId === "SYN-000123");
  const nearDup = taylor.lineReviews.find((line) => line.verdict === "near_duplicate");
  assert.equal(nearDup.reason, "service_content_changed");
});

test("packets from different clients never match each other", async () => {
  const first = (await importFixture("synthetic-eap-2026-06.csv")).result;
  const ledger = serviceLedgerFromPackets(first.packets.filter(
    (packet) => packet.client.externalIds.sourceClientId === "SYN-000456"
  ));
  const second = (await importFixture("synthetic-eap-2026-06.csv")).result;
  const taylorPacket = second.packets.find((packet) => packet.client.externalIds.sourceClientId === "SYN-000123");
  const reviews = detectDuplicates(ledger, [taylorPacket]);
  assert.equal(reviews[0].verdict, "fresh");
});

// Duplicate and near-duplicate detection (Milestone 2). Protection combines
// content fingerprints, stable source identifiers, and packet associations.
// Potential duplicates are reviewable records, not silently discarded data.

import { makeFinding } from "./findings.js";

// Flatten known packets into a ledger of service-line facts that incoming
// imports are compared against. In the running application the service
// builds this from persisted packets and receipts.
export function serviceLedgerFromPackets(packets) {
  const ledger = [];
  for (const packet of packets) {
    const clientKey = packet.client?.externalIds?.sourceClientId ?? packet.client?.id ?? null;
    for (const line of packet.serviceLines ?? []) {
      ledger.push({
        packetId: packet.id,
        lineId: line.id,
        clientKey,
        fingerprint: line.fingerprint ?? null,
        sourceId: line.sourceId ?? null,
        serviceDate: line.serviceDate,
        code: line.code,
        units: line.units ?? 1,
        amount: line.amount
      });
    }
  }
  return ledger;
}

function classifyLine(line, clientKey, ledger) {
  const sameClient = ledger.filter((entry) => entry.clientKey === clientKey);

  const exact = sameClient.find((entry) => entry.fingerprint && entry.fingerprint === line.fingerprint);
  if (exact) return { verdict: "duplicate", reason: "fingerprint_match", existing: exact };

  if (line.sourceId) {
    const bySourceId = sameClient.find((entry) => entry.sourceId && entry.sourceId === line.sourceId);
    if (bySourceId) {
      // The stable source row already exists but its content changed —
      // for example a corrected amount. This needs review, not silent
      // re-import and not silent deduplication.
      return { verdict: "near_duplicate", reason: "source_row_changed", existing: bySourceId };
    }
  }

  const sameService = sameClient.find(
    (entry) => entry.serviceDate === line.serviceDate && entry.code === line.code
  );
  if (sameService) {
    return { verdict: "near_duplicate", reason: "service_content_changed", existing: sameService };
  }

  return { verdict: "fresh", reason: null, existing: null };
}

// Compare incoming packets against known work. Returns per-packet reviews:
//   verdict "duplicate"      — every line already exists; no new work.
//   verdict "needs_review"   — a mix of duplicate, changed, and fresh lines.
//   verdict "fresh"          — nothing matched known work.
// Warning findings are attached to the incoming packets so the workflow
// cannot proceed without an explicit recorded override.
export function detectDuplicates(ledger, incomingPackets) {
  const reviews = [];
  for (const packet of incomingPackets) {
    const clientKey = packet.client?.externalIds?.sourceClientId ?? packet.client?.id ?? null;
    const lineReviews = packet.serviceLines.map((line) => {
      const { verdict, reason, existing } = classifyLine(line, clientKey, ledger);
      return {
        lineId: line.id,
        verdict,
        reason,
        existing: existing ? { packetId: existing.packetId, lineId: existing.lineId } : null
      };
    });

    const duplicates = lineReviews.filter((review) => review.verdict === "duplicate");
    const nearDuplicates = lineReviews.filter((review) => review.verdict === "near_duplicate");
    let verdict = "fresh";
    if (duplicates.length === packet.serviceLines.length) verdict = "duplicate";
    else if (duplicates.length > 0 || nearDuplicates.length > 0) verdict = "needs_review";

    const findings = [];
    if (duplicates.length > 0) {
      findings.push(makeFinding("DUPLICATE_SERVICE", {
        message: `${duplicates.length} service line(s) already exist in previously imported work.`,
        path: "serviceLines",
        data: { lineReviews: duplicates }
      }));
    }
    if (nearDuplicates.length > 0) {
      findings.push(makeFinding("NEAR_DUPLICATE_SERVICE", {
        message: `${nearDuplicates.length} service line(s) closely match previously imported work with changed content.`,
        path: "serviceLines",
        data: { lineReviews: nearDuplicates }
      }));
    }
    packet.findings.push(...findings);

    reviews.push({ packetId: packet.id, verdict, lineReviews, findings });
  }
  return reviews;
}

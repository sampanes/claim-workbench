// Artifact pipeline (Milestone 4). Documents are generated from packet
// facts, hashed into a manifest with provenance, and verified for
// existence, integrity, and freshness before any workflow step relies on
// them. File I/O belongs to the service; this module is pure.

import { makeFinding } from "./findings.js";
import { formatMoney } from "./money.js";
import { packetFingerprint } from "./packet.js";
import { sha256Hex } from "./sha256.js";

export const MANIFEST_VERSION = "1";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// The one synthetic document template. Content is deterministic for a given
// packet: it embeds packet facts, never the wall clock, so regeneration of
// unchanged facts produces byte-identical output.
export function generateClaimSummaryHtml(packet) {
  const rows = packet.serviceLines.map((line) => `      <tr>
        <td>${escapeHtml(line.serviceDate)}</td>
        <td>${escapeHtml(line.code)}</td>
        <td>${escapeHtml(line.description ?? "")}</td>
        <td>${escapeHtml(line.units ?? 1)}</td>
        <td>${escapeHtml(formatMoney(line.amount))}</td>
      </tr>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Claim summary ${escapeHtml(packet.id)}</title>
</head>
<body>
  <h1>Claim summary</h1>
  <p>Synthetic document generated from packet facts. Not a real claim.</p>
  <dl>
    <dt>Packet</dt><dd>${escapeHtml(packet.id)}</dd>
    <dt>Client</dt><dd>${escapeHtml(packet.client.displayName)}</dd>
    <dt>Destination</dt><dd>${escapeHtml(packet.destination.label ?? packet.destination.id)}</dd>
    <dt>Period</dt><dd>${escapeHtml(packet.period ? `${packet.period.start} to ${packet.period.end}` : "(unspecified)")}</dd>
    <dt>Source</dt><dd>${escapeHtml(packet.provenance?.sourceName ?? "(unknown)")}</dd>
  </dl>
  <table>
    <thead><tr><th>Date</th><th>Code</th><th>Description</th><th>Units</th><th>Amount</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p><strong>Total: ${escapeHtml(formatMoney(packet.total))}</strong></p>
</body>
</html>
`;
}

export const ARTIFACT_GENERATORS = Object.freeze({
  "claim-summary": { generate: generateClaimSummaryHtml, mediaType: "text/html", extension: "html" }
});

// Deterministic filename and folder layout: one folder per packet, one file
// per artifact kind.
export function artifactFilename(packet, kind, extension) {
  return `${packet.id}/${kind}.${extension}`;
}

export function buildManifest({ packet, entries, generatedAt }) {
  return {
    manifestVersion: MANIFEST_VERSION,
    packetId: packet.id,
    // Freshness anchor: if the billing facts change after generation, the
    // fingerprint no longer matches and every artifact is stale.
    packetFingerprint: packetFingerprint(packet),
    generatedAt,
    entries
  };
}

export function makeManifestEntry({ artifactId, kind, filename, mediaType, content, generatedAt }) {
  return {
    artifactId,
    kind,
    filename,
    mediaType,
    bytes: new TextEncoder().encode(content).length,
    sha256: sha256Hex(content),
    generatedAt
  };
}

// Verify artifacts against the manifest and the recipe's requirements.
// `files` maps filename -> current content (or null/undefined when the file
// cannot be read). Every finding names generate_artifacts as its resolving
// action so regeneration stays available while everything else is blocked.
export function verifyArtifacts({ packet, recipe, manifest, files }) {
  const findings = [];
  const resolvedBy = "generate_artifacts";

  // A packet that never generated artifacts has no manifest (the initial
  // packet shape uses an empty array); recipe step order handles that case.
  if (!manifest || !Array.isArray(manifest.entries)) return findings;

  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    findings.push(makeFinding("ARTIFACT_STALE", {
      message: `The artifact manifest uses unsupported version ${JSON.stringify(manifest.manifestVersion)}.`,
      path: "artifacts",
      data: { resolvedBy }
    }));
    return findings;
  }

  if (manifest.packetFingerprint !== packetFingerprint(packet)) {
    findings.push(makeFinding("ARTIFACT_STALE", {
      message: "Packet facts changed after the artifacts were generated. Regenerate before using them.",
      path: "artifacts",
      data: { resolvedBy }
    }));
  }

  for (const entry of manifest.entries) {
    const content = files.get(entry.filename);
    if (content === null || content === undefined) {
      findings.push(makeFinding("ARTIFACT_MISSING", {
        message: `Artifact file ${entry.filename} is missing.`,
        path: `artifacts.${entry.kind}`,
        data: { resolvedBy, filename: entry.filename }
      }));
      continue;
    }
    if (sha256Hex(content) !== entry.sha256) {
      findings.push(makeFinding("ARTIFACT_TAMPERED", {
        message: `Artifact file ${entry.filename} does not match its recorded hash.`,
        path: `artifacts.${entry.kind}`,
        data: { resolvedBy, filename: entry.filename }
      }));
    }
  }

  for (const required of recipe?.requiredArtifacts ?? []) {
    if (!manifest.entries.some((entry) => entry.kind === required.kind)) {
      findings.push(makeFinding("ARTIFACT_MISSING", {
        message: `Recipe ${recipe.id} requires a ${required.kind} artifact that was never generated.`,
        path: `artifacts.${required.kind}`,
        data: { resolvedBy, kind: required.kind }
      }));
    }
  }

  return findings;
}

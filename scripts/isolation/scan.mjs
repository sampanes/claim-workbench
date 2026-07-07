// The scan engine behind the commit firewall. Given a set of staged files it
// classifies each by zone (see policy.mjs) and, where the zone calls for it,
// reads the *staged* blob content and runs the appropriate PHI/secret scan.
// Returns structured violations; it never prints the offending value.

import { execFileSync } from "node:child_process";
import {
  classifyPath,
  scanContent,
  isBinaryPath,
  STRICT_PATTERNS,
  BROAD_PATTERNS
} from "./policy.mjs";

const MAX_SCAN_BYTES = 2 * 1024 * 1024; // skip content scan on very large blobs

// Names of files staged for add/copy/modify (never deletions), NUL-delimited.
export function stagedFiles() {
  const out = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"],
    { encoding: "utf8" }
  );
  return out.split("\0").filter(Boolean);
}

// Exact bytes that WOULD be committed for a path (the staged version, which
// may differ from the working tree). Returns null for binary/oversized blobs.
function stagedContent(path) {
  if (isBinaryPath(path)) return null;
  let buf;
  try {
    buf = execFileSync("git", ["show", `:${path}`], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null; // not in the index (e.g. race) — nothing to scan
  }
  if (buf.length > MAX_SCAN_BYTES) return null;
  if (buf.includes(0)) return null; // looks binary
  return buf.toString("utf8");
}

// Classify + content-scan a list of staged files. Pure aside from `git show`.
export function scanStaged(files = stagedFiles()) {
  const violations = [];
  for (const path of files) {
    const { zone, reason, synthetic } = classifyPath(path);

    if (zone === "red") {
      violations.push({ path, kind: "red-zone", detail: reason });
      continue;
    }

    if (zone === "report") {
      const text = stagedContent(path);
      if (text === null) {
        violations.push({
          path,
          kind: "report-unscannable",
          detail: "binary or oversized file in the report channel cannot be verified clean"
        });
        continue;
      }
      const hits = scanContent(text, STRICT_PATTERNS);
      if (hits.length) violations.push({ path, kind: "report-phi", hits });
      continue;
    }

    // green
    if (synthetic) continue;
    const text = stagedContent(path);
    if (text === null) continue; // binary green file: path guard already cleared it
    const hits = scanContent(text, BROAD_PATTERNS);
    if (hits.length) violations.push({ path, kind: "green-phi", hits });
  }
  return violations;
}

// Render violations as a human-readable block (masked samples only).
export function formatViolations(violations) {
  const lines = [];
  for (const v of violations) {
    if (v.kind === "red-zone") {
      lines.push(`  ✗ ${v.path}`);
      lines.push(`      red-zone file — real data or secrets live here; it must never be committed.`);
    } else if (v.kind === "report-unscannable") {
      lines.push(`  ✗ ${v.path}`);
      lines.push(`      ${v.detail}.`);
    } else if (v.kind === "report-phi" || v.kind === "green-phi") {
      lines.push(`  ✗ ${v.path}`);
      for (const h of v.hits) lines.push(`      looks like ${h.name}: ${h.sample}`);
    }
  }
  return lines.join("\n");
}

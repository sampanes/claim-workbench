// The diagnostic scrubber — the controlled red->green channel. It takes raw
// diagnostic output that MAY contain PHI (produced on Mom's Mac from real data)
// and produces a version safe to commit into reports/from-mac/.
//
// Defense in depth, strongest first:
//   1. Exact-value redaction. We HAVE the real names/ids — they are sitting in
//      the client CSV — so we redact those exact strings by category token
//      ([name], [id], [ssn]...). This is far stronger than guessing what PHI
//      "looks like".
//   2. Pattern backstop. A second pass redacts anything that still matches a
//      PHI/secret shape, to catch strays the value list didn't know about.
//   3. Fail-closed self-check. The result is re-scanned with the SAME strict
//      patterns the commit firewall uses. If ANY match remains, the scrubber
//      refuses to write the file. It never emits something the firewall would
//      later reject — and never a partially-cleaned file.
//
// Usage (run on Mom's Mac, in the red zone):
//   node scripts/isolation/scrub.mjs --raw <rawFile> --keys <clientCsv> \
//        --out reports/from-mac/<name>.txt [--columns name,ssn,member_id]
// Omit --columns to treat EVERY column of the CSV as sensitive (safer default).

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../../packages/core/src/csv.js";
import { STRICT_PATTERNS, scanContent, REPORT_CHANNEL } from "./policy.mjs";

// Category token for a CSV column, by header name. Falls back to [redacted].
export function tokenForColumn(name) {
  const c = String(name).toLowerCase();
  if (/mail/.test(c)) return "[email]";
  if (/phone|tel|fax|mobile/.test(c)) return "[phone]";
  if (/ssn|social/.test(c)) return "[ssn]";
  if (/dob|birth/.test(c)) return "[dob]";
  if (/name/.test(c)) return "[name]";
  if (/mrn|member|subscriber|policy|account|claim|id\b|_id/.test(c)) return "[id]";
  if (/addr|street|city|zip|postal/.test(c)) return "[address]";
  if (/amount|charge|balance|paid|cost|price/.test(c)) return "[amount]";
  return "[redacted]";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build the exact-value denylist from the real client CSV. Over-redacts by
// default (every column) so a missed column mapping can't leak a value.
export function loadSensitiveValues(csvText, sensitiveColumns = null) {
  const { header, rows } = parseCsv(csvText);
  const cols = header.map((name, index) => ({
    index,
    token: tokenForColumn(name),
    sensitive: sensitiveColumns ? sensitiveColumns.includes(name) : true
  }));
  const byValue = new Map(); // value -> token (a specific token beats [redacted])
  for (const { cells } of rows) {
    for (const col of cols) {
      if (!col.sensitive) continue;
      const value = String(cells[col.index] ?? "").trim();
      if (value.length < 3) continue; // too short to redact without mangling text
      const existing = byValue.get(value);
      if (!existing || existing === "[redacted]") byValue.set(value, col.token);
    }
  }
  // Longest values first so a value that contains another is redacted whole.
  return [...byValue.entries()]
    .map(([value, token]) => ({ value, token }))
    .sort((a, b) => b.value.length - a.value.length);
}

// Pattern backstop — value-capturing so credentials don't leak their tail.
const REDACTION_PATTERNS = [
  { token: "[email]", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { token: "[ssn]", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { token: "[phone]", re: /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { token: "[dob]", re: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19|20)\d\d\b/g },
  { token: "[number]", re: /\b\d{6,}\b/g },
  {
    re: /\b(password|passwd|secret|api[_-]?key|token)\b(\s*[:=]\s*)(["']?)([^\s"',]+)/gi,
    replace: "$1$2$3[credential]"
  }
];

export function applyBackstop(text) {
  let out = text;
  for (const p of REDACTION_PATTERNS) {
    out = p.replace ? out.replace(p.re, p.replace) : out.replace(p.re, p.token);
  }
  return out;
}

export function redactByValues(text, entries) {
  let out = text;
  for (const { value, token } of entries) {
    const esc = escapeRegExp(value);
    // Word-boundary anchor for wordy values to limit accidental substring hits.
    const re = /^\w[\s\S]*\w$|^\w+$/.test(value)
      ? new RegExp(`\\b${esc}\\b`, "gi")
      : new RegExp(esc, "gi");
    out = out.replace(re, token);
  }
  return out;
}

// Full scrub: exact values first, then the pattern backstop.
export function scrub(text, entries) {
  return applyBackstop(redactByValues(text, entries));
}

// Fail-closed check: does anything the firewall considers PHI still remain?
export function residualFindings(text) {
  return scanContent(text, STRICT_PATTERNS);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("scrub.mjs")) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.raw || !args.out) {
    process.stderr.write("usage: scrub.mjs --raw <file> --out reports/from-mac/<name> [--keys <csv>] [--columns a,b]\n");
    process.exit(2);
  }
  if (!args.out.replace(/\\/g, "/").startsWith(REPORT_CHANNEL)) {
    process.stderr.write(`refusing to write outside the report channel (${REPORT_CHANNEL}).\n`);
    process.exit(2);
  }

  const raw = readFileSync(args.raw, "utf8");
  const entries = args.keys
    ? loadSensitiveValues(readFileSync(args.keys, "utf8"), args.columns ? args.columns.split(",").map((s) => s.trim()) : null)
    : [];
  const cleaned = scrub(raw, entries);
  const residual = residualFindings(cleaned);

  if (residual.length > 0) {
    process.stderr.write(
      [
        "",
        "  SCRUB FAILED — the cleaned output still contains something that",
        "  looks like PHI, so nothing was written (fail-closed):",
        ...residual.map((h) => `      ${h.name}: ${h.sample}`),
        "",
        "  Add the offending column to the client CSV / --keys, or widen the",
        "  patterns in scrub.mjs. The scrubber will not emit a partial clean.",
        ""
      ].join("\n")
    );
    process.exit(1);
  }

  writeFileSync(args.out, cleaned);
  process.stdout.write(
    `✓ Scrubbed ${raw.length} chars using ${entries.length} known value(s); wrote ${args.out}. No PHI residue.\n`
  );
}

// Shared data-isolation policy: the single source of truth for what may cross
// the "air gap" between the red zone (Mom's Mac, where real client data and
// portal passwords live) and the green zone (the laptop where Claude and the
// synthetic-only code live). Both the pre-commit firewall and the diagnostic
// scrubber import this module, so the two sides of the wall can never drift.
//
// Model:
//   - RED ZONE   : paths that hold real data or secrets. Never committable.
//   - REPORT     : reports/from-mac/ — the ONE controlled red->green channel.
//                  Content here must pass the strict PHI scan (the scrubber
//                  writes it; the firewall re-checks it at commit time).
//   - GREEN      : everything else (code, synthetic fixtures, docs). Scanned
//                  with a high-specificity net so a stray real file dropped in
//                  an unexpected place is still caught, without tripping on
//                  ordinary source or curated synthetic examples.

// Directory names that mean "real data or secrets live here" wherever they
// appear in the tree. These match .gitignore's local-data/artifacts/etc.
export const RED_ZONE_DIRS = [
  "local-data",
  "artifacts",
  "receipts",
  "auth-state",
  "playwright-report",
  "test-results"
];

// Individual files that are always red-zone regardless of directory.
export const RED_ZONE_FILE_PATTERNS = [
  /\.trace\.zip$/i,
  /(^|\/)\.env$/,
  /(^|\/)\.env\.[^/]+$/
];

// Explicit exceptions to the file patterns above (checked-in templates).
export const RED_ZONE_FILE_EXCEPTIONS = [/(^|\/)\.env\.example$/];

// The only path where sanitized, real-origin content may be committed.
export const REPORT_CHANNEL = "reports/from-mac/";

// Locations that hold curated, synthetic-only data by design. The green-zone
// broad scan skips these so fake-but-realistically-shaped fixture values
// (e.g. a made-up member id) don't block ordinary development commits.
export const SYNTHETIC_ALLOWLIST = [
  /^examples\//,
  /(^|\/)fixtures\//,
  /(^|\/)test\//,
  /(^|\/)tests\//,
  /^schemas\//
];

// File extensions we never scan byte content for (binary / not text).
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".gz", ".db", ".sqlite",
  ".woff", ".woff2", ".ttf", ".ico", ".mp4", ".mov", ".webp"
]);

// Strict PHI/secret patterns — applied to the report channel, where sanitized
// output is expected to be squeaky clean.
export const STRICT_PATTERNS = [
  { name: "US SSN", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "email address", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: "phone number", re: /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/ },
  { name: "long digit run (6+)", re: /\b\d{6,}\b/ },
  { name: "date of birth (MM/DD/YYYY)", re: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19|20)\d\d\b/ },
  { name: "credential literal", re: /\b(password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*["']?\S/i }
];

// Broad, high-specificity patterns — applied to unexpected green-zone files so
// a real spreadsheet dropped somewhere odd is still caught, while ordinary
// source and docs pass. Deliberately narrower than STRICT to avoid noise.
export const BROAD_PATTERNS = [
  { name: "US SSN", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "long digit run (9+)", re: /\b\d{9,}\b/ }
];

function normalize(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

// Classify a repo-relative path into a zone. Pure and dependency-free.
export function classifyPath(rawPath) {
  const path = normalize(rawPath);
  const segments = path.split("/");

  const isException = RED_ZONE_FILE_EXCEPTIONS.some((re) => re.test(path));
  if (!isException) {
    if (segments.some((seg) => RED_ZONE_DIRS.includes(seg))) {
      return { zone: "red", reason: "path is inside a red-zone directory" };
    }
    if (RED_ZONE_FILE_PATTERNS.some((re) => re.test(path))) {
      return { zone: "red", reason: "file is an always-secret file (.env / trace)" };
    }
  }

  if (path.startsWith(REPORT_CHANNEL)) {
    return { zone: "report", reason: "diagnostic report channel (strict scan applies)" };
  }

  const synthetic = SYNTHETIC_ALLOWLIST.some((re) => re.test(path));
  return { zone: "green", reason: synthetic ? "synthetic/source (broad scan skipped)" : "green", synthetic };
}

// Scan text against a pattern set; returns hits with a masked sample so the
// finding itself never echoes the secret it found.
export function scanContent(text, patterns) {
  const hits = [];
  for (const { name, re } of patterns) {
    const m = text.match(re);
    if (m) hits.push({ name, sample: maskSample(m[0]) });
  }
  return hits;
}

// Mask a matched value: keep length legible, reveal almost nothing.
export function maskSample(value) {
  const s = String(value);
  if (s.length <= 2) return "*".repeat(s.length);
  return `${s[0]}${"*".repeat(Math.max(1, s.length - 2))}${s[s.length - 1]} (${s.length} chars)`;
}

export function isBinaryPath(rawPath) {
  const path = normalize(rawPath);
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

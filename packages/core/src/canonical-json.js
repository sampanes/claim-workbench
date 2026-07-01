// Deterministic JSON serialization for fingerprints, evidence digests, and
// audit hashes. Object keys are sorted so logically equal values always
// produce the same bytes.

export function canonicalJson(value) {
  if (value === null) return "null";
  const kind = typeof value;
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot canonicalize a non-finite number");
    return JSON.stringify(value);
  }
  if (kind === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  }
  if (kind === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`Cannot canonicalize value of type ${kind}`);
}

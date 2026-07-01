// Identifier factory. Prefixes make identifiers self-describing in logs,
// audit events, and protocol payloads. Tests may inject a deterministic
// random source.

const DEFAULT_RANDOM = () => globalThis.crypto.randomUUID().replaceAll("-", "");

export const ID_PREFIXES = Object.freeze({
  packet: "packet",
  client: "client",
  batch: "batch",
  run: "run",
  command: "cmd",
  service: "service",
  artifact: "artifact",
  receipt: "receipt",
  approval: "approval",
  event: "event",
  finding: "finding"
});

export function newId(prefix, random = DEFAULT_RANDOM) {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new TypeError("Identifier prefix is required");
  }
  return `${prefix}_${random()}`;
}

export function createSequentialIdFactory() {
  const counters = new Map();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${String(next).padStart(4, "0")}`;
  };
}

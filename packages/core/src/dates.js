// Service dates are ISO 8601 date-only strings and never shift between time
// zones (ADR-0003). Events use UTC timestamps.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function compareIsoDates(a, b) {
  // Valid ISO dates compare correctly as strings.
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isValidUtcTimestamp(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

export function utcNow(clock = Date) {
  return new Date(clock.now()).toISOString();
}

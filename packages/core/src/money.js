// Domain money is a decimal string plus an ISO 4217 currency code (ADR-0003).
// Arithmetic happens on integer cents; binary floating-point never enters the
// domain representation.

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)\.\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_CENTS = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

export function isValidAmount(value) {
  return typeof value === "string" && AMOUNT_PATTERN.test(value);
}

export function isValidCurrency(value) {
  return typeof value === "string" && CURRENCY_PATTERN.test(value);
}

export function isMoney(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    isValidAmount(value.amount) &&
    isValidCurrency(value.currency)
  );
}

export function amountToCents(amount) {
  if (!isValidAmount(amount)) {
    throw new MoneyError("MALFORMED_MONEY", `Invalid decimal money amount: ${JSON.stringify(amount)}`);
  }
  const [units, cents] = amount.split(".");
  const total = Number(units) * 100 + Number(cents);
  if (!Number.isSafeInteger(total)) {
    throw new MoneyError("MALFORMED_MONEY", `Money amount exceeds the safe integer range: ${amount}`);
  }
  return total;
}

export function centsToAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new MoneyError("MALFORMED_MONEY", `Invalid cents value: ${String(cents)}`);
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function makeMoney(cents, currency) {
  if (!isValidCurrency(currency)) {
    throw new MoneyError("INVALID_CURRENCY", `Invalid ISO 4217 currency code: ${JSON.stringify(currency)}`);
  }
  return { amount: centsToAmount(cents), currency };
}

export function addMoney(a, b) {
  assertMoney(a);
  assertMoney(b);
  if (a.currency !== b.currency) {
    throw new MoneyError("CURRENCY_MISMATCH", `Cannot add ${a.currency} to ${b.currency}`);
  }
  return makeMoney(amountToCents(a.amount) + amountToCents(b.amount), a.currency);
}

export function sumMoney(values, emptyCurrency = "USD") {
  if (values.length === 0) return makeMoney(0, emptyCurrency);
  return values.reduce((total, value) => addMoney(total, value));
}

export function moneyEquals(a, b) {
  return isMoney(a) && isMoney(b) && a.currency === b.currency && amountToCents(a.amount) === amountToCents(b.amount);
}

export function formatMoney(money) {
  assertMoney(money);
  return `${money.currency} ${money.amount}`;
}

export function assertMoney(value) {
  if (typeof value !== "object" || value === null) {
    throw new MoneyError("MALFORMED_MONEY", `Money must be an object: ${JSON.stringify(value)}`);
  }
  if (!isValidAmount(value.amount)) {
    throw new MoneyError("MALFORMED_MONEY", `Invalid decimal money amount: ${JSON.stringify(value.amount)}`);
  }
  if (!isValidCurrency(value.currency)) {
    throw new MoneyError("INVALID_CURRENCY", `Invalid ISO 4217 currency code: ${JSON.stringify(value.currency)}`);
  }
  return value;
}

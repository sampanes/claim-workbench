import test from "node:test";
import assert from "node:assert/strict";
import {
  MoneyError,
  addMoney,
  amountToCents,
  centsToAmount,
  formatMoney,
  isMoney,
  isValidAmount,
  makeMoney,
  moneyEquals,
  sumMoney
} from "../src/money.js";

test("accepts canonical decimal amounts", () => {
  assert.equal(amountToCents("0.00"), 0);
  assert.equal(amountToCents("125.00"), 12500);
  assert.equal(amountToCents("0.05"), 5);
  assert.equal(amountToCents("1234567.89"), 123456789);
});

test("rejects malformed amounts with a stable error code", () => {
  for (const bad of ["125.5", "125", "125.005", "01.00", ".50", "-1.00", "1,00", "1e2", 125, null, undefined, "125.00 "]) {
    assert.equal(isValidAmount(bad), false, `expected invalid: ${JSON.stringify(bad)}`);
    assert.throws(() => amountToCents(bad), (error) => error instanceof MoneyError && error.code === "MALFORMED_MONEY");
  }
});

test("round-trips cents and decimal strings", () => {
  for (const cents of [0, 1, 99, 100, 101, 12500, 999999999]) {
    assert.equal(amountToCents(centsToAmount(cents)), cents);
  }
});

test("adds and sums money in one currency", () => {
  const total = sumMoney([
    makeMoney(12500, "USD"),
    makeMoney(12500, "USD"),
    makeMoney(50, "USD")
  ]);
  assert.deepEqual(total, { amount: "250.50", currency: "USD" });
  assert.deepEqual(sumMoney([]), { amount: "0.00", currency: "USD" });
});

test("refuses cross-currency arithmetic", () => {
  assert.throws(
    () => addMoney({ amount: "1.00", currency: "USD" }, { amount: "1.00", currency: "EUR" }),
    (error) => error instanceof MoneyError && error.code === "CURRENCY_MISMATCH"
  );
});

test("money equality compares value, not object identity", () => {
  assert.equal(moneyEquals({ amount: "250.00", currency: "USD" }, { amount: "250.00", currency: "USD" }), true);
  assert.equal(moneyEquals({ amount: "250.00", currency: "USD" }, { amount: "250.00", currency: "EUR" }), false);
  assert.equal(moneyEquals({ amount: "250.00", currency: "USD" }, { amount: "250.01", currency: "USD" }), false);
});

test("guards against invalid currency and formats for display", () => {
  assert.throws(() => makeMoney(100, "usd"), (error) => error.code === "INVALID_CURRENCY");
  assert.equal(formatMoney({ amount: "250.00", currency: "USD" }), "USD 250.00");
  assert.equal(isMoney({ amount: "250.00", currency: "USD" }), true);
  assert.equal(isMoney({ amount: 250, currency: "USD" }), false);
});

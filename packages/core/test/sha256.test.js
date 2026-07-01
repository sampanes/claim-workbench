import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { hmacSha256Hex, sha256Hex } from "../src/sha256.js";

const SAMPLES = [
  "",
  "abc",
  "The quick brown fox jumps over the lazy dog",
  "a".repeat(55),
  "a".repeat(56),
  "a".repeat(64),
  "a".repeat(65),
  "a".repeat(1000),
  "unicode: héllo wörld — 素早い茶色の狐 🦊",
  JSON.stringify({ nested: { values: [1, 2, 3], money: "125.00" } })
];

test("sha256Hex matches node:crypto for representative inputs", () => {
  for (const sample of SAMPLES) {
    const expected = createHash("sha256").update(sample, "utf8").digest("hex");
    assert.equal(sha256Hex(sample), expected, `sha256 mismatch for ${JSON.stringify(sample.slice(0, 30))}`);
  }
});

test("sha256Hex matches the published empty-string and abc vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hmacSha256Hex matches node:crypto including long keys", () => {
  const keys = ["k", "a-much-longer-key-material-string", "x".repeat(63), "x".repeat(64), "x".repeat(65), "x".repeat(200)];
  for (const key of keys) {
    for (const sample of SAMPLES) {
      const expected = createHmac("sha256", key).update(sample, "utf8").digest("hex");
      assert.equal(hmacSha256Hex(key, sample), expected, `hmac mismatch for key length ${key.length}`);
    }
  }
});

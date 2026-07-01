import test from "node:test";
import assert from "node:assert/strict";
import { CsvError, parseCsv } from "../src/csv.js";

test("parses plain rows with a header", () => {
  const { header, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
  assert.deepEqual(header, ["a", "b", "c"]);
  assert.deepEqual(rows.map((row) => row.cells), [["1", "2", "3"], ["4", "5", "6"]]);
  assert.deepEqual(rows.map((row) => row.rowNumber), [2, 3]);
});

test("handles quoted fields with commas, escaped quotes, and newlines", () => {
  const { rows } = parseCsv('name,note\nTaylor,"one, two"\nJordan,"says ""hi"""\nCasey,"line one\nline two"\n');
  assert.deepEqual(rows[0].cells, ["Taylor", "one, two"]);
  assert.deepEqual(rows[1].cells, ["Jordan", 'says "hi"']);
  assert.deepEqual(rows[2].cells, ["Casey", "line one\nline two"]);
});

test("handles CRLF endings and a UTF-8 byte-order mark", () => {
  const { header, rows } = parseCsv("﻿a,b\r\n1,2\r\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows[0].cells, ["1", "2"]);
});

test("a missing trailing newline still yields the last row", () => {
  const { rows } = parseCsv("a,b\n1,2");
  assert.deepEqual(rows[0].cells, ["1", "2"]);
});

test("empty input and header-only input yield no rows", () => {
  assert.deepEqual(parseCsv(""), { header: [], rows: [] });
  assert.deepEqual(parseCsv("a,b\n").rows, []);
});

test("an unterminated quote is a structural error", () => {
  assert.throws(() => parseCsv('a,b\n1,"unclosed\n'), CsvError);
});

test("ragged rows are passed through for the adapter to judge", () => {
  const { rows } = parseCsv("a,b,c\n1,2\n");
  assert.deepEqual(rows[0].cells, ["1", "2"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function runCli(...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test("cli passes a valid packet with exit code 0", async () => {
  const { code, stdout } = await runCli(fixturePath("valid-packet.json"));
  assert.equal(code, 0);
  assert.match(stdout, /RESULT: PASS/);
});

test("cli reports hard stops with exit code 1 and stable codes", async () => {
  const { code, stdout } = await runCli(fixturePath("invalid-total.json"), fixturePath("invalid-date.json"));
  assert.equal(code, 1);
  assert.match(stdout, /PACKET_TOTAL_INCONSISTENT/);
  assert.match(stdout, /INVALID_SERVICE_DATE/);
});

test("cli distinguishes usage and read errors with exit code 2", async () => {
  const missing = await runCli("no-such-file.json");
  assert.equal(missing.code, 2);
  const noArgs = await runCli();
  assert.equal(noArgs.code, 2);
});

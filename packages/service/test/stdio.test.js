import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const binPath = fileURLToPath(new URL("../bin/service.js", import.meta.url));
const recipePath = fileURLToPath(new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url));
const csvUrl = new URL("../../../examples/synthetic-eap/data/synthetic-eap-2026-06.csv", import.meta.url);
const mappingUrl = new URL("../../../examples/synthetic-eap/mapping.json", import.meta.url);

test("the stdio service answers one JSON message per line", async () => {
  const child = spawn(process.execPath, [binPath, "--db", ":memory:", "--recipe", recipePath], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = [];
  const waiting = [];
  lines.on("line", (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else pending.push(line);
  });
  const nextLine = () => pending.length > 0
    ? Promise.resolve(pending.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (message) => child.stdin.write(`${typeof message === "string" ? message : JSON.stringify(message)}\n`);
  const roundTrip = async (message) => {
    send(message);
    return JSON.parse(await nextLine());
  };

  try {
    const pong = await roundTrip({ requestId: "r1", op: "ping" });
    assert.deepEqual(pong, { requestId: "r1", ok: true, output: { service: "claim-workbench", ok: true } });

    // Malformed and unsupported messages are rejected, not crashed on.
    const malformed = await roundTrip("this is not json");
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error.code, "PROTOCOL_MALFORMED");
    const unknown = await roundTrip({ requestId: "r2", op: "dropTables" });
    assert.equal(unknown.error.code, "OP_UNKNOWN");
    const noId = await roundTrip({ op: "ping" });
    assert.equal(noId.error.code, "PROTOCOL_MALFORMED");

    const csvText = await readFile(csvUrl, "utf8");
    const mapping = JSON.parse(await readFile(mappingUrl, "utf8"));
    const imported = await roundTrip({ requestId: "r3", op: "importCsv", input: { csvText, mapping, sourceName: "stdio.csv" } });
    assert.equal(imported.ok, true);
    assert.equal(imported.output.packets.length, 2);

    const packetId = imported.output.packets[0].id;
    const started = await roundTrip({ requestId: "r4", op: "startRun", input: { packetId } });
    assert.equal(started.ok, true);
    const runId = started.output.run.id;

    const acted = await roundTrip({ requestId: "r5", op: "act", input: { runId, action: "validate_packet" } });
    assert.equal(acted.ok, true);
    assert.equal(acted.output.run.state, "PacketValidated");

    // Workflow errors surface as structured error payloads.
    const invalid = await roundTrip({ requestId: "r6", op: "act", input: { runId, action: "submit" } });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "TRANSITION_INVALID");
  } finally {
    child.kill();
    await once(child, "exit").catch(() => {});
  }
});

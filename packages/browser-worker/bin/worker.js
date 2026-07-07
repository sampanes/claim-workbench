#!/usr/bin/env node
// Browser worker process entry point. Speaks one JSON message per line on
// stdio, mirroring the service protocol (ADR-0002). The application sends
// an init message carrying the recipe and packet facts, then worker
// commands; pause, resume, and stop are control messages.

import readline from "node:readline";
import process from "node:process";
import { BrowserWorker } from "../src/worker.js";
import { HttpPageDriver } from "../src/drivers/http-driver.js";
import { createPlaywrightDriver } from "../src/drivers/playwright-driver.js";

let worker = null;

async function handle(message) {
  const requestId = typeof message.requestId === "string" ? message.requestId : null;
  if (requestId === null) {
    return { requestId: null, ok: false, error: { code: "PROTOCOL_MALFORMED", message: "requestId is required." } };
  }
  try {
    switch (message.op) {
      case "ping":
        return { requestId, ok: true, output: { worker: "claim-workbench", initialized: worker !== null } };
      case "init": {
        const { recipe, facts, driver = "http", diagnosticMode = false } = message.input ?? {};
        if (!recipe || !facts) {
          return { requestId, ok: false, error: { code: "INPUT_INVALID", message: "init requires recipe and facts." } };
        }
        const pageDriver = driver === "playwright" ? await createPlaywrightDriver() : new HttpPageDriver();
        worker = new BrowserWorker({ driver: pageDriver, recipe, facts, diagnosticMode });
        return { requestId, ok: true, output: { initialized: true, driver } };
      }
      case "command": {
        if (!worker) return { requestId, ok: false, error: { code: "NOT_INITIALIZED", message: "Send init first." } };
        const result = await worker.handleCommand(message.input);
        return { requestId, ok: true, output: result };
      }
      case "pause":
        worker?.pause();
        return { requestId, ok: true, output: { paused: true } };
      case "resume":
        worker?.resume();
        return { requestId, ok: true, output: { paused: false } };
      case "stop":
        worker?.emergencyStop();
        return { requestId, ok: true, output: { stopped: true } };
      default:
        return { requestId, ok: false, error: { code: "OP_UNKNOWN", message: `Unknown op ${JSON.stringify(message.op)}.` } };
    }
  } catch (error) {
    return { requestId, ok: false, error: { code: "INTERNAL", message: error.message } };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
rl.on("line", (line) => {
  if (line.trim() === "") return;
  queue = queue.then(async () => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ requestId: null, ok: false, error: { code: "PROTOCOL_MALFORMED", message: "Line is not valid JSON." } })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(await handle(message))}\n`);
  });
});
process.stderr.write("claim-worker ready\n");

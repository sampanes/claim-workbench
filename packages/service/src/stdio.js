// One JSON message per line over standard input and standard output;
// standard error is reserved for diagnostics (ADR-0002). Every message that
// crosses the boundary is validated; malformed or unsupported messages are
// rejected with stable error codes.

import readline from "node:readline";
import { toErrorPayload } from "./service.js";

export const PROTOCOL_VERSION = "1";

const OPS = new Set([
  "ping",
  "listRecipes",
  "importCsv",
  "listPackets",
  "getPacket",
  "startRun",
  "getRun",
  "getRunForPacket",
  "evaluate",
  "act",
  "listAuditEvents"
]);

export function handleRequest(service, message) {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { requestId: null, ok: false, error: { code: "PROTOCOL_MALFORMED", message: "Requests must be JSON objects." } };
  }
  const requestId = typeof message.requestId === "string" ? message.requestId : null;
  if (requestId === null) {
    return { requestId: null, ok: false, error: { code: "PROTOCOL_MALFORMED", message: "requestId is required." } };
  }
  if (!OPS.has(message.op)) {
    return { requestId, ok: false, error: { code: "OP_UNKNOWN", message: `Unknown op ${JSON.stringify(message.op)}.` } };
  }
  const input = message.input ?? {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { requestId, ok: false, error: { code: "INPUT_INVALID", message: "input must be an object." } };
  }
  try {
    const output = service[message.op](input) ?? null;
    return { requestId, ok: true, output };
  } catch (error) {
    return { requestId, ok: false, error: toErrorPayload(error) };
  }
}

export function startStdioServer(service, { input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (line.trim() === "") return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ requestId: null, ok: false, error: { code: "PROTOCOL_MALFORMED", message: "Line is not valid JSON." } })}\n`);
      return;
    }
    output.write(`${JSON.stringify(handleRequest(service, message))}\n`);
  });
  return rl;
}

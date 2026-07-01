#!/usr/bin/env node
// Command-line packet validator (Milestone 1). Node-only entry point; the
// browser bundle never imports this file.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { formatValidationReport, validatePacket } from "./validate-packet.js";

const USAGE = `Usage: claim-validate <packet.json> [more-packets.json...]

Validates normalized billing packets and prints a findings report.
Exit codes: 0 = no hard stops, 1 = hard stops found, 2 = usage or read error.`;

export async function runValidateCli(args, io = { log: console.log, error: console.error }) {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    io.log(USAGE);
    return args.length === 0 ? 2 : 0;
  }

  let sawHardStop = false;
  for (const path of args) {
    let raw;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      io.error(`Cannot read ${path}: ${error.message}`);
      return 2;
    }
    let packet;
    try {
      packet = JSON.parse(raw);
    } catch (error) {
      io.error(`Cannot parse ${path} as JSON: ${error.message}`);
      return 2;
    }
    const result = validatePacket(packet);
    io.log(`# ${path}`);
    io.log(formatValidationReport(result));
    io.log("");
    if (!result.ok) sawHardStop = true;
  }
  return sawHardStop ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runValidateCli(process.argv.slice(2));
  process.exitCode = code;
}

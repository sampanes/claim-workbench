#!/usr/bin/env node
// Local service entry point. Started as a child process by the native
// application or tests; speaks newline-delimited JSON on stdio.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { ClaimService } from "../src/service.js";
import { startStdioServer } from "../src/stdio.js";

function parseArgs(argv) {
  const args = { dbPath: ":memory:", artifactDir: null, recipePaths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--db") args.dbPath = argv[++i];
    else if (argv[i] === "--artifacts") args.artifactDir = argv[++i];
    else if (argv[i] === "--recipe") args.recipePaths.push(argv[++i]);
    else {
      process.stderr.write(`Unknown argument: ${argv[i]}\n`);
      process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const recipes = [];
for (const path of args.recipePaths) {
  recipes.push(JSON.parse(await readFile(path, "utf8")));
}

const service = new ClaimService({ dbPath: args.dbPath, artifactDir: args.artifactDir, recipes });
process.stderr.write(`claim-service ready (db: ${args.dbPath}, recipes: ${recipes.map((recipe) => recipe.id).join(", ") || "none"})\n`);
startStdioServer(service);

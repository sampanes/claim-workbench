// Generates docs/STDIO_TRANSCRIPT.md by driving the real stdio service
// through a representative session against the synthetic example data.
// Run from the repository root: node scripts/generate-stdio-transcript.mjs

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const binPath = fileURLToPath(new URL("packages/service/bin/service.js", root));
const recipePath = fileURLToPath(new URL("examples/synthetic-eap/recipe.json", root));
const csvText = await readFile(new URL("examples/synthetic-eap/data/synthetic-eap-2026-06.csv", root), "utf8");
const mapping = JSON.parse(await readFile(new URL("examples/synthetic-eap/mapping.json", root), "utf8"));

const child = spawn(process.execPath, [binPath, "--db", ":memory:", "--recipe", recipePath], {
  stdio: ["pipe", "pipe", "inherit"]
});
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const pending = [];
const waiting = [];
lines.on("line", (line) => {
  const resolve = waiting.shift();
  if (resolve) resolve(line);
  else pending.push(line);
});
const nextLine = () =>
  pending.length > 0 ? Promise.resolve(pending.shift()) : new Promise((resolve) => waiting.push(resolve));

const exchanges = [];
async function roundTrip(title, request) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
  const response = JSON.parse(await nextLine());
  exchanges.push({ title, request, response });
  return response;
}

try {
  await roundTrip("Health check", { requestId: "r1", op: "ping", input: {} });
  await roundTrip("List loaded recipes", { requestId: "r2", op: "listRecipes", input: {} });
  const imported = await roundTrip("Import a CSV report", {
    requestId: "r3",
    op: "importCsv",
    input: { csvText, mapping, sourceName: "synthetic-eap-2026-06.csv" }
  });
  const packetId = imported.output.packets[0].id;
  const started = await roundTrip("Start a workflow run", { requestId: "r4", op: "startRun", input: { packetId } });
  const runId = started.output.run.id;
  await roundTrip("Evaluate the run", { requestId: "r5", op: "evaluate", input: { runId } });
  await roundTrip("Act: validate the packet", { requestId: "r6", op: "act", input: { runId, action: "validate_packet" } });
  await roundTrip("List audit events", { requestId: "r7", op: "listAuditEvents", input: { runId } });
  await roundTrip("Error shape: unknown op", { requestId: "r8", op: "definitelyNotAnOp", input: {} });
  await roundTrip("Error shape: stable service codes", { requestId: "r9", op: "act", input: { runId, action: "not_a_real_action" } });
} finally {
  child.stdin.end();
  child.kill();
}

// Long payloads (the CSV text and full packet bodies) are elided so the
// transcript stays readable; shapes and field names are preserved.
function elide(value, depth = 0) {
  if (typeof value === "string" && value.length > 120) return `${value.slice(0, 117)}...`;
  if (Array.isArray(value)) {
    if (depth >= 3 && value.length > 2) return [...value.slice(0, 2).map((v) => elide(v, depth + 1)), `... ${value.length - 2} more`];
    return value.map((v) => elide(v, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, elide(v, depth + 1)]));
  }
  return value;
}

const sections = exchanges.map(({ title, request, response }) => {
  const req = JSON.stringify(elide(request), null, 2);
  const res = JSON.stringify(elide(response), null, 2);
  return `## ${title}\n\nRequest:\n\n\`\`\`json\n${req}\n\`\`\`\n\nResponse:\n\n\`\`\`json\n${res}\n\`\`\`\n`;
});

const doc = `# Sample stdio Transcript

A representative session with the local service over its one-JSON-message-per-
line stdio transport (ADR-0002, [Worker protocol](WORKER_PROTOCOL.md) is the
separate worker-facing contract). Regenerate with:

\`\`\`sh
node scripts/generate-stdio-transcript.mjs
\`\`\`

The service was started as:

\`\`\`sh
node packages/service/bin/service.js --db :memory: --recipe examples/synthetic-eap/recipe.json
\`\`\`

Requests go to stdin, one JSON object per line; each line on stdout is the
response carrying the same \`requestId\`. Long payloads below are elided with
\`...\` for readability; identifiers and hashes vary per session.

${sections.join("\n")}`;

await writeFile(new URL("docs/STDIO_TRANSCRIPT.md", root), doc);
console.log(`Wrote docs/STDIO_TRANSCRIPT.md with ${exchanges.length} exchanges.`);

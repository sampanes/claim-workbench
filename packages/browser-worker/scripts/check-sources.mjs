// Syntax-check every source module, including drivers the entry point does
// not import.
import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const roots = ["../src/", "../src/drivers/", "../bin/"];
let count = 0;
for (const root of roots) {
  const dir = fileURLToPath(new URL(root, import.meta.url));
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);
  for (const file of files) {
    execFileSync(process.execPath, ["--check", `${dir}${file}`], { stdio: "inherit" });
    count += 1;
  }
}
console.log(`Checked ${count} worker source files.`);

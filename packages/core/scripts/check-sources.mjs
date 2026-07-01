// Syntax-check every source module so a build failure is caught even for
// files the entry point does not import.
import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const files = (await readdir(srcDir)).filter((name) => name.endsWith(".js"));
for (const file of files) {
  execFileSync(process.execPath, ["--check", `${srcDir}${file}`], { stdio: "inherit" });
}
console.log(`Checked ${files.length} core source files.`);

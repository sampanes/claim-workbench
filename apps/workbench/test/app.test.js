import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { syntheticPacket } from "@claim-workbench/core";

test("web skeleton uses synthetic data only", () => {
  assert.match(syntheticPacket.id, /^packet_synthetic_/);
  assert.equal(syntheticPacket.findings.length, 0);
});

test("the build produces a self-contained browser bundle", async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build.mjs", import.meta.url))], { stdio: "pipe" });
  const dist = new URL("../dist/", import.meta.url);
  for (const artifact of ["index.html", "main.js", "styles.css", "recipe.json", "core/index.js", "core/workflow.js"]) {
    assert.ok(existsSync(fileURLToPath(new URL(artifact, dist))), `missing dist/${artifact}`);
  }
  const main = await readFile(new URL("main.js", dist), "utf8");
  assert.match(main, /from "\.\/core\/index\.js"/, "the core import is rewritten for the browser");
  assert.ok(!/from "@claim-workbench\/core"/.test(main), "no bare import specifiers reach the browser");
  // The Node-only CLI stays out of the browser bundle.
  assert.equal(existsSync(fileURLToPath(new URL("core/cli.js", dist))), false);
});

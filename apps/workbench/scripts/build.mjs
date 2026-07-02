import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const coreSrc = new URL("../../../packages/core/src/", import.meta.url);
await mkdir(new URL("core/", dist), { recursive: true });

// The workbench ships the portable core as plain ES modules. cli.js is the
// Node-only entry point and stays out of the browser bundle.
const coreFiles = (await readdir(coreSrc)).filter((name) => name.endsWith(".js") && name !== "cli.js");
for (const name of coreFiles) {
  await copyFile(new URL(name, coreSrc), new URL(`core/${name}`, dist));
}

await copyFile(
  new URL("../../../examples/synthetic-eap/recipe.json", import.meta.url),
  new URL("recipe.json", dist)
);

let main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
main = main
  .replace(/from "@claim-workbench\/core";/, 'from "./core/index.js";')
  .replace('import "./styles.css";\n', "");
await writeFile(new URL("main.js", dist), main);
await copyFile(new URL("../src/styles.css", import.meta.url), new URL("styles.css", dist));
await writeFile(new URL("index.html", dist), `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Claim Workbench</title><link rel="stylesheet" href="./styles.css"/></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>\n`);
console.log(`Built ${fileURLToPath(dist)}`);

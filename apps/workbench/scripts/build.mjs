import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const dist = new URL("../dist/", import.meta.url);
await mkdir(dist, { recursive: true });
let main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
main = main
  .replace('import { helpTopics, packetTotal, syntheticPacket } from "@claim-workbench/core";', 'import { helpTopics, packetTotal, syntheticPacket } from "./core.js";')
  .replace('import "./styles.css";\n', "");
await writeFile(new URL("../dist/main.js", import.meta.url), main);
await copyFile(new URL("../../../packages/core/src/index.js", import.meta.url), new URL("../dist/core.js", import.meta.url));
await copyFile(new URL("../src/styles.css", import.meta.url), new URL("../dist/styles.css", import.meta.url));
await writeFile(new URL("../dist/index.html", import.meta.url), `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Claim Workbench</title><link rel="stylesheet" href="./styles.css"/></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>\n`);
console.log(`Built ${dirname(join(dist.pathname, "index.html"))}`);

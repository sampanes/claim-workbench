import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  const pathname = req.url === "/" ? "/index.html" : req.url;
  try {
    const body = await readFile(join(root, pathname));
    res.writeHead(200, { "content-type": types[extname(pathname)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
server.listen(5173, "0.0.0.0", () => console.log("Claim Workbench: http://localhost:5173"));

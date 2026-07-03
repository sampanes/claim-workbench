import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
import { resolve } from "node:path";
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const target = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const full = resolve(root, target);
  // Local-first (ADR-0005): never serve files outside the built app.
  if (full !== resolve(root) && !full.startsWith(resolve(root) + sep)) {
    res.writeHead(404); res.end("Not found"); return;
  }
  try {
    const body = await readFile(full);
    res.writeHead(200, { "content-type": types[extname(full)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    // Idempotent: a repeat `pnpm dev` should not crash with a stack trace,
    // it just means the port is already spoken for (often this same server).
    console.log("Claim Workbench: port 5173 is already in use — it may already be running at http://localhost:5173");
    process.exit(0);
  }
  throw error;
});
server.listen(5173, "127.0.0.1", () => console.log("Claim Workbench: http://localhost:5173"));

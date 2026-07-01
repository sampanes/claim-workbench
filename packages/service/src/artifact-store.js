// Artifact file storage. The disk store keeps a deterministic folder layout
// under one root; the memory store backs tests and in-memory databases.
// Filenames are always relative, forward-slash paths owned by the service.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

function assertSafeFilename(filename) {
  if (typeof filename !== "string" || filename.length === 0 || filename.includes("..") || filename.startsWith("/") || filename.includes("\\")) {
    throw new Error(`Unsafe artifact filename: ${JSON.stringify(filename)}`);
  }
}

export class MemoryArtifactStore {
  #files = new Map();

  write(filename, content) {
    assertSafeFilename(filename);
    this.#files.set(filename, content);
  }

  read(filename) {
    return this.#files.get(filename) ?? null;
  }

  delete(filename) {
    this.#files.delete(filename);
  }
}

export class DiskArtifactStore {
  constructor(rootDir) {
    this.rootDir = resolve(rootDir);
  }

  #resolve(filename) {
    assertSafeFilename(filename);
    const full = resolve(join(this.rootDir, filename));
    if (!full.startsWith(this.rootDir + sep)) {
      throw new Error(`Artifact path escapes the artifact root: ${JSON.stringify(filename)}`);
    }
    return full;
  }

  write(filename, content) {
    const full = this.#resolve(filename);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }

  read(filename) {
    try {
      return readFileSync(this.#resolve(filename), "utf8");
    } catch {
      return null;
    }
  }
}

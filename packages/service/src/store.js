// SQLite persistence. The portable service is the sole owner of the
// database (ADR-0002); every other component reaches storage through the
// service's typed operations, never through tables.

import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // Version 1: initial schema.
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE batches (
    id TEXT PRIMARY KEY,
    imported_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE packets (
    id TEXT PRIMARY KEY,
    batch_id TEXT,
    client_key TEXT,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    packet_id TEXT NOT NULL UNIQUE,
    updated_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    packet_id TEXT,
    seq INTEGER NOT NULL,
    at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX idx_audit_run ON audit_events(run_id, seq);
  CREATE INDEX idx_packets_client ON packets(client_key);
  `
];

export class Store {
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.#migrate();
  }

  #migrate() {
    const hasMeta = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get();
    let version = 0;
    if (hasMeta) {
      const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
      version = row ? Number(row.value) : 0;
    }
    if (version > SCHEMA_VERSION) {
      throw new Error(`Database schema version ${version} is newer than this application supports (${SCHEMA_VERSION}).`);
    }
    while (version < SCHEMA_VERSION) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[version]);
        version += 1;
        this.db.exec(
          `INSERT INTO meta(key, value) VALUES ('schema_version', '${version}')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        );
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  close() {
    this.db.close();
  }

  putBatch(batch) {
    this.db.prepare("INSERT OR REPLACE INTO batches(id, imported_at, json) VALUES (?, ?, ?)")
      .run(batch.id, batch.importedAt, JSON.stringify(batch));
  }

  getBatch(id) {
    const row = this.db.prepare("SELECT json FROM batches WHERE id = ?").get(id);
    return row ? JSON.parse(row.json) : null;
  }

  putPacket(packet) {
    this.db.prepare(
      `INSERT INTO packets(id, batch_id, client_key, state, created_at, json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, json = excluded.json`
    ).run(
      packet.id,
      packet.provenance?.importBatchId ?? null,
      packet.client?.externalIds?.sourceClientId ?? packet.client?.id ?? null,
      packet.workflowState ?? "Imported",
      packet.createdAt ?? "",
      JSON.stringify(packet)
    );
  }

  getPacket(id) {
    const row = this.db.prepare("SELECT json FROM packets WHERE id = ?").get(id);
    return row ? JSON.parse(row.json) : null;
  }

  listPackets() {
    return this.db.prepare("SELECT json FROM packets ORDER BY created_at, id").all()
      .map((row) => JSON.parse(row.json));
  }

  putRun(run) {
    this.db.prepare(
      `INSERT INTO runs(id, packet_id, updated_at, json) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, json = excluded.json`
    ).run(run.id, run.packetId, run.updatedAt, JSON.stringify(run));
  }

  getRun(id) {
    const row = this.db.prepare("SELECT json FROM runs WHERE id = ?").get(id);
    return row ? JSON.parse(row.json) : null;
  }

  getRunForPacket(packetId) {
    const row = this.db.prepare("SELECT json FROM runs WHERE packet_id = ?").get(packetId);
    return row ? JSON.parse(row.json) : null;
  }

  appendAuditEvents(events) {
    const nextSeq = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS max FROM audit_events WHERE run_id = ?");
    const insert = this.db.prepare(
      "INSERT INTO audit_events(id, run_id, packet_id, seq, at, json) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const event of events) {
      const seq = Number(nextSeq.get(event.runId).max) + 1;
      insert.run(event.id, event.runId, event.packetId, seq, event.at, JSON.stringify({ ...event, seq }));
    }
  }

  listAuditEvents(runId) {
    return this.db.prepare("SELECT json FROM audit_events WHERE run_id = ? ORDER BY seq").all(runId)
      .map((row) => JSON.parse(row.json));
  }
}

// Generic CSV source adapter (Milestone 2). Turns a source report plus a
// versioned column mapping into normalized billing packets with import-batch
// provenance. Rows that cannot be normalized become findings on the batch
// and on the affected packet; they are never silently discarded.

import { CsvError, parseCsv } from "./csv.js";
import { compareIsoDates, isValidIsoDate, utcNow } from "./dates.js";
import { makeFinding } from "./findings.js";
import { isValidCurrency } from "./money.js";
import { newId } from "./ids.js";
import { PACKET_SCHEMA_VERSION, packetTotal, serviceLineFingerprint } from "./packet.js";
import { sha256Hex } from "./sha256.js";

export const MAPPING_VERSION = "1";

const REQUIRED_COLUMN_KEYS = ["clientId", "clientName", "serviceDate", "code", "amount"];
const OPTIONAL_COLUMN_KEYS = ["description", "units", "sourceId"];

export function validateMapping(mapping) {
  const findings = [];
  if (typeof mapping !== "object" || mapping === null) {
    findings.push(makeFinding("IMPORT_MAPPING_INVALID", { message: "The column mapping is not an object.", path: "" }));
    return findings;
  }
  if (mapping.mappingVersion !== MAPPING_VERSION) {
    findings.push(makeFinding("IMPORT_MAPPING_INVALID", {
      message: `Mapping version ${JSON.stringify(mapping.mappingVersion)} is not supported. This application supports version ${MAPPING_VERSION}.`,
      path: "mappingVersion"
    }));
  }
  for (const key of ["adapterId", "adapterVersion", "destinationId", "recipeId"]) {
    if (typeof mapping[key] !== "string" || mapping[key].length === 0) {
      findings.push(makeFinding("IMPORT_MAPPING_INVALID", { message: `Mapping field ${key} is required.`, path: key }));
    }
  }
  if (!isValidCurrency(mapping.currency)) {
    findings.push(makeFinding("IMPORT_MAPPING_INVALID", { message: "Mapping currency must be an ISO 4217 code.", path: "currency" }));
  }
  for (const key of REQUIRED_COLUMN_KEYS) {
    if (typeof mapping.columns?.[key] !== "string" || mapping.columns[key].length === 0) {
      findings.push(makeFinding("IMPORT_MAPPING_INVALID", { message: `Mapping column ${key} is required.`, path: `columns.${key}` }));
    }
  }
  return findings;
}

export function normalizeAmount(raw) {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (value.startsWith("$")) value = value.slice(1).trim();
  value = value.replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [units, cents = ""] = value.split(".");
  const normalizedUnits = String(Number(units));
  return `${normalizedUnits}.${cents.padEnd(2, "0")}`;
}

export function normalizeServiceDate(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (isValidIsoDate(value)) return value;
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (usMatch) {
    const candidate = `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
    if (isValidIsoDate(candidate)) return candidate;
  }
  return null;
}

function normalizeRow(row, header, columnIndexes, mapping) {
  const problems = [];
  const cell = (key) => {
    const index = columnIndexes[key];
    if (index === undefined) return undefined;
    return row.cells[index]?.trim();
  };

  if (row.cells.length !== header.length) {
    problems.push(`expected ${header.length} columns, found ${row.cells.length}`);
    return { problems };
  }

  const clientKey = cell("clientId");
  const clientName = cell("clientName");
  const serviceDate = normalizeServiceDate(cell("serviceDate"));
  const code = cell("code");
  const amount = normalizeAmount(cell("amount"));
  const description = cell("description") ?? "";
  const sourceId = cell("sourceId") || null;
  const rawUnits = cell("units");
  let units = 1;
  if (rawUnits !== undefined && rawUnits !== "") {
    units = /^\d+$/.test(rawUnits) ? Number(rawUnits) : NaN;
  }

  if (!clientKey) problems.push("missing client identifier");
  if (!clientName) problems.push("missing client name");
  if (!serviceDate) problems.push(`unreadable service date ${JSON.stringify(cell("serviceDate") ?? "")}`);
  if (!code) problems.push("missing service code");
  if (amount === null) problems.push(`unreadable amount ${JSON.stringify(cell("amount") ?? "")}`);
  if (!Number.isInteger(units) || units < 1) problems.push(`unreadable units ${JSON.stringify(rawUnits)}`);

  if (problems.length > 0) return { clientKey, problems };
  return {
    clientKey,
    clientName,
    normalized: {
      sourceId,
      sourceRow: row.rowNumber,
      serviceDate,
      code,
      description,
      units,
      amount: { amount, currency: mapping.currency }
    },
    problems: []
  };
}

export function clientIdFromKey(clientKey) {
  return `client_${sha256Hex(`client:${clientKey}`).slice(0, 16)}`;
}

// Import a CSV source report. Returns { batch, packets, findings }.
// Packet content is deterministic for a given report content and mapping:
// service lines are sorted by their normalized facts, not by row order.
export function importCsv({ csvText, mapping, sourceName, importedAt, idFactory }) {
  const stampedAt = importedAt ?? utcNow();
  const makeId = idFactory ?? newId;
  const findings = [...validateMapping(mapping)];
  const batch = {
    id: makeId("batch"),
    importedAt: stampedAt,
    sourceName: sourceName ?? "(unnamed source)",
    sourceSha256: typeof csvText === "string" ? sha256Hex(csvText) : null,
    adapterId: mapping?.adapterId ?? null,
    adapterVersion: mapping?.adapterVersion ?? null,
    rowCount: 0,
    dateRange: null
  };
  if (findings.length > 0) return { batch, packets: [], findings };

  let parsed;
  try {
    parsed = parseCsv(csvText);
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    findings.push(makeFinding("IMPORT_PARSE_ERROR", {
      message: `The source report could not be parsed as CSV: ${error.message}`,
      path: "csv"
    }));
    return { batch, packets: [], findings };
  }

  const columnIndexes = {};
  for (const key of [...REQUIRED_COLUMN_KEYS, ...OPTIONAL_COLUMN_KEYS]) {
    const columnName = mapping.columns[key];
    if (columnName === undefined) continue;
    const index = parsed.header.indexOf(columnName);
    if (index === -1) {
      if (REQUIRED_COLUMN_KEYS.includes(key)) {
        findings.push(makeFinding("IMPORT_MISSING_COLUMN", {
          message: `The source report has no column named ${JSON.stringify(columnName)} (mapped to ${key}). Found columns: ${parsed.header.join(", ")}.`,
          path: `columns.${key}`,
          data: { column: columnName, header: parsed.header }
        }));
      }
    } else {
      columnIndexes[key] = index;
    }
  }
  if (findings.length > 0) return { batch, packets: [], findings };

  batch.rowCount = parsed.rows.length;
  if (parsed.rows.length === 0) {
    findings.push(makeFinding("IMPORT_EMPTY", { path: "csv" }));
    return { batch, packets: [], findings };
  }

  const byClient = new Map();
  const rowProblems = [];
  for (const row of parsed.rows) {
    const result = normalizeRow(row, parsed.header, columnIndexes, mapping);
    if (result.problems.length > 0) {
      rowProblems.push({ rowNumber: row.rowNumber, clientKey: result.clientKey ?? null, problems: result.problems });
      continue;
    }
    if (!byClient.has(result.clientKey)) {
      byClient.set(result.clientKey, { clientKey: result.clientKey, clientName: result.clientName, lines: [] });
    }
    byClient.get(result.clientKey).lines.push(result.normalized);
  }

  for (const problem of rowProblems) {
    findings.push(makeFinding("IMPORT_ROW_INVALID", {
      message: `Row ${problem.rowNumber} could not be normalized: ${problem.problems.join("; ")}.`,
      path: `rows[${problem.rowNumber}]`,
      data: problem
    }));
  }

  const packets = [];
  const sortedClients = [...byClient.values()].sort((a, b) => (a.clientKey < b.clientKey ? -1 : 1));
  let batchStart = null;
  let batchEnd = null;
  for (const group of sortedClients) {
    group.lines.sort((a, b) =>
      compareIsoDates(a.serviceDate, b.serviceDate) ||
      a.code.localeCompare(b.code) ||
      a.amount.amount.localeCompare(b.amount.amount) ||
      (a.sourceId ?? "").localeCompare(b.sourceId ?? "")
    );
    const serviceLines = group.lines.map((line, index) => ({
      id: `service_${index + 1}`,
      ...line,
      fingerprint: serviceLineFingerprint(group.clientKey, line)
    }));
    const start = serviceLines[0].serviceDate;
    const end = serviceLines.at(-1).serviceDate;
    if (batchStart === null || compareIsoDates(start, batchStart) < 0) batchStart = start;
    if (batchEnd === null || compareIsoDates(end, batchEnd) > 0) batchEnd = end;

    const packet = {
      schemaVersion: PACKET_SCHEMA_VERSION,
      id: makeId("packet"),
      createdAt: stampedAt,
      client: {
        id: clientIdFromKey(group.clientKey),
        displayName: group.clientName,
        externalIds: { sourceClientId: group.clientKey }
      },
      destination: { id: mapping.destinationId, label: mapping.destinationLabel ?? mapping.destinationId },
      recipeId: mapping.recipeId,
      period: { start, end },
      provenance: {
        importBatchId: batch.id,
        sourceName: batch.sourceName,
        sourceSha256: batch.sourceSha256,
        adapterId: mapping.adapterId,
        adapterVersion: mapping.adapterVersion,
        importedAt: stampedAt
      },
      serviceLines,
      total: null,
      workflowState: "Imported",
      findings: [],
      artifacts: [],
      receipts: []
    };
    packet.total = packetTotal(packet);
    for (const problem of rowProblems) {
      if (problem.clientKey === group.clientKey) {
        packet.findings.push(makeFinding("IMPORT_ROW_INVALID", {
          message: `Row ${problem.rowNumber} for this client could not be normalized: ${problem.problems.join("; ")}. The packet may be incomplete.`,
          path: `rows[${problem.rowNumber}]`,
          data: problem
        }));
      }
    }
    packets.push(packet);
  }

  batch.dateRange = batchStart ? { start: batchStart, end: batchEnd } : null;
  return { batch, packets, findings };
}

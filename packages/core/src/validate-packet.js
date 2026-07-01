// Deterministic packet validation. Every problem is reported as a finding
// with a stable code; explanatory prose never converts a failure into a
// success (see docs/ARCHITECTURE.md).

import { compareIsoDates, isValidIsoDate } from "./dates.js";
import { countBySeverity, hasHardStop, makeFinding } from "./findings.js";
import { isMoney, isValidAmount, isValidCurrency, moneyEquals } from "./money.js";
import { isWorkflowState, packetTotal, PACKET_SCHEMA_VERSION } from "./packet.js";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireField(findings, container, field, path) {
  if (!isNonEmptyString(container?.[field])) {
    findings.push(makeFinding("MISSING_REQUIRED_FIELD", {
      message: `Required field is missing: ${path}`,
      path
    }));
    return false;
  }
  return true;
}

function validateServiceLine(findings, line, index) {
  const path = `serviceLines[${index}]`;
  if (typeof line !== "object" || line === null) {
    findings.push(makeFinding("PACKET_MALFORMED", {
      message: `Service line at ${path} is not an object.`,
      path
    }));
    return;
  }
  requireField(findings, line, "id", `${path}.id`);
  requireField(findings, line, "code", `${path}.code`);
  if (!isValidIsoDate(line.serviceDate)) {
    findings.push(makeFinding("INVALID_SERVICE_DATE", {
      message: `Service date ${JSON.stringify(line.serviceDate)} at ${path}.serviceDate is not a valid ISO 8601 date.`,
      path: `${path}.serviceDate`
    }));
  }
  if (line.units !== undefined && (!Number.isInteger(line.units) || line.units < 1)) {
    findings.push(makeFinding("INVALID_UNITS", {
      message: `Units at ${path}.units must be a positive whole number.`,
      path: `${path}.units`
    }));
  }
  validateMoneyField(findings, line.amount, `${path}.amount`);
}

function validateMoneyField(findings, value, path) {
  if (typeof value !== "object" || value === null || !isValidAmount(value.amount)) {
    findings.push(makeFinding("MALFORMED_MONEY", {
      message: `Money value at ${path} must be a decimal string with two fraction digits.`,
      path
    }));
    return false;
  }
  if (!isValidCurrency(value.currency)) {
    findings.push(makeFinding("INVALID_CURRENCY", {
      message: `Currency at ${path}.currency must be a three-letter ISO 4217 code.`,
      path: `${path}.currency`
    }));
    return false;
  }
  return true;
}

export function validatePacket(packet) {
  const findings = [];

  if (typeof packet !== "object" || packet === null || Array.isArray(packet)) {
    findings.push(makeFinding("PACKET_MALFORMED", { path: "" }));
    return buildResult(null, findings);
  }

  if (packet.schemaVersion !== PACKET_SCHEMA_VERSION) {
    findings.push(makeFinding("PACKET_SCHEMA_UNSUPPORTED", {
      message: `Packet schema version ${JSON.stringify(packet.schemaVersion)} is not supported. This application supports version ${PACKET_SCHEMA_VERSION}.`,
      path: "schemaVersion"
    }));
    // Unknown future formats fail clearly instead of being interpreted
    // heuristically (ADR-0003), so no further checks run.
    return buildResult(packet, findings);
  }

  requireField(findings, packet, "id", "id");
  requireField(findings, packet.client, "id", "client.id");
  requireField(findings, packet.client, "displayName", "client.displayName");
  requireField(findings, packet.destination, "id", "destination.id");
  requireField(findings, packet, "recipeId", "recipeId");

  if (packet.workflowState !== undefined && !isWorkflowState(packet.workflowState)) {
    findings.push(makeFinding("INVALID_WORKFLOW_STATE", {
      message: `Workflow state ${JSON.stringify(packet.workflowState)} is not recognized.`,
      path: "workflowState"
    }));
  }

  if (typeof packet.provenance !== "object" || packet.provenance === null ||
      !isNonEmptyString(packet.provenance.sourceName) || !isNonEmptyString(packet.provenance.importBatchId)) {
    findings.push(makeFinding("MISSING_PROVENANCE", { path: "provenance" }));
  }

  if (packet.period !== undefined) {
    const { start, end } = packet.period ?? {};
    if (!isValidIsoDate(start) || !isValidIsoDate(end) || compareIsoDates(start, end) > 0) {
      findings.push(makeFinding("INVALID_SERVICE_DATE", {
        message: "The billing period must be two valid ISO 8601 dates with start on or before end.",
        path: "period"
      }));
    }
  }

  if (!Array.isArray(packet.serviceLines) || packet.serviceLines.length === 0) {
    findings.push(makeFinding("EMPTY_SERVICE_LINES", { path: "serviceLines" }));
    return buildResult(packet, findings);
  }

  const seenLineIds = new Map();
  const missingSourceIds = [];
  for (const [index, line] of packet.serviceLines.entries()) {
    validateServiceLine(findings, line, index);
    if (isNonEmptyString(line?.id)) {
      if (seenLineIds.has(line.id)) {
        findings.push(makeFinding("DUPLICATE_SERVICE_LINE_ID", {
          message: `Service line id ${JSON.stringify(line.id)} appears more than once.`,
          path: `serviceLines[${index}].id`,
          data: { firstIndex: seenLineIds.get(line.id), duplicateIndex: index }
        }));
      } else {
        seenLineIds.set(line.id, index);
      }
    }
    if (!isNonEmptyString(line?.sourceId)) missingSourceIds.push(line?.id ?? `serviceLines[${index}]`);
    if (packet.period && isValidIsoDate(line?.serviceDate) &&
        isValidIsoDate(packet.period.start) && isValidIsoDate(packet.period.end) &&
        (compareIsoDates(line.serviceDate, packet.period.start) < 0 ||
         compareIsoDates(line.serviceDate, packet.period.end) > 0)) {
      findings.push(makeFinding("SERVICE_DATE_OUT_OF_PERIOD", {
        message: `Service date ${line.serviceDate} is outside the billing period ${packet.period.start} to ${packet.period.end}.`,
        path: `serviceLines[${index}].serviceDate`
      }));
    }
  }

  if (missingSourceIds.length > 0) {
    findings.push(makeFinding("MISSING_SOURCE_ID", {
      message: `${missingSourceIds.length} service line(s) have no stable source identifier. Duplicate detection will rely on content fingerprints.`,
      path: "serviceLines",
      data: { lineIds: missingSourceIds }
    }));
  }

  const currencies = new Set(
    packet.serviceLines
      .filter((line) => isMoney(line?.amount))
      .map((line) => line.amount.currency)
  );
  if (isMoney(packet.total)) currencies.add(packet.total.currency);
  if (currencies.size > 1) {
    findings.push(makeFinding("CURRENCY_MISMATCH", {
      message: `The packet mixes currencies: ${[...currencies].sort().join(", ")}.`,
      path: "serviceLines",
      data: { currencies: [...currencies].sort() }
    }));
  }

  let computedTotal = null;
  const allMoneyValid = packet.serviceLines.every((line) => isMoney(line?.amount));
  if (allMoneyValid && currencies.size <= 1) {
    computedTotal = packetTotal(packet);
    if (!validateMoneyField(findings, packet.total, "total")) {
      // Finding already recorded.
    } else if (!moneyEquals(packet.total, computedTotal)) {
      findings.push(makeFinding("PACKET_TOTAL_INCONSISTENT", {
        message: `Declared total ${packet.total.currency} ${packet.total.amount} does not equal the computed service-line total ${computedTotal.currency} ${computedTotal.amount}.`,
        path: "total",
        data: { declared: packet.total, computed: computedTotal }
      }));
    }
  }

  return buildResult(packet, findings, computedTotal);
}

function buildResult(packet, findings, computedTotal = null) {
  return {
    packetId: packet?.id ?? null,
    schemaVersion: packet?.schemaVersion ?? null,
    computedTotal,
    findings,
    counts: countBySeverity(findings),
    ok: !hasHardStop(findings)
  };
}

export function formatValidationReport(result) {
  const lines = [];
  lines.push(`Packet: ${result.packetId ?? "(unknown)"}`);
  lines.push(`Schema version: ${result.schemaVersion ?? "(missing)"}`);
  if (result.computedTotal) {
    lines.push(`Computed total: ${result.computedTotal.currency} ${result.computedTotal.amount}`);
  }
  lines.push(`Findings: ${result.counts.hard_stop} hard stop(s), ${result.counts.warning} warning(s), ${result.counts.notice} notice(s)`);
  for (const finding of result.findings) {
    const location = finding.path ? ` at ${finding.path}` : "";
    lines.push(`  [${finding.severity}] ${finding.code}${location}: ${finding.message}`);
  }
  lines.push(result.ok ? "RESULT: PASS" : "RESULT: HARD STOP");
  return lines.join("\n");
}

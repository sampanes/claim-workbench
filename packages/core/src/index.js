// @claim-workbench/core public surface. Every module here is portable:
// no Node-only imports, so the same code runs in the service process, the
// browser workbench, and tests. The command-line validator lives in cli.js.

export {
  MoneyError,
  addMoney,
  amountToCents,
  assertMoney,
  centsToAmount,
  formatMoney,
  isMoney,
  isValidAmount,
  isValidCurrency,
  makeMoney,
  moneyEquals,
  sumMoney
} from "./money.js";

export { canonicalJson } from "./canonical-json.js";
export { bytesToHex, hmacSha256Hex, sha256Bytes, sha256Hex } from "./sha256.js";
export { ID_PREFIXES, createSequentialIdFactory, newId } from "./ids.js";
export { compareIsoDates, isValidIsoDate, isValidUtcTimestamp, utcNow } from "./dates.js";

export {
  SEVERITIES,
  countBySeverity,
  findingDefinition,
  hasHardStop,
  isKnownFindingCode,
  listFindingCodes,
  makeFinding
} from "./findings.js";

export {
  PACKET_SCHEMA_VERSION,
  WORKFLOW_STATES,
  isWorkflowState,
  packetFingerprint,
  packetTotal,
  serviceLineFingerprint
} from "./packet.js";

export { formatValidationReport, validatePacket } from "./validate-packet.js";

export { CsvError, parseCsv } from "./csv.js";
export {
  MAPPING_VERSION,
  clientIdFromKey,
  importCsv,
  normalizeAmount,
  normalizeServiceDate,
  validateMapping
} from "./import.js";
export { detectDuplicates, serviceLedgerFromPackets } from "./duplicates.js";

export { ACTIONS, ASSISTANCE_MODES, getAction, isKnownAction, listActions, modeAtLeast } from "./actions.js";
export {
  RECIPE_SCHEMA_VERSION,
  evaluateRequiredFields,
  getPacketPath,
  parseRecipe,
  validateRecipe
} from "./recipe.js";
export {
  RUN_SCHEMA_VERSION,
  WorkflowError,
  applyAction,
  collectFindings,
  createRun,
  evaluateRun
} from "./workflow.js";
export { AUDIT_EVENT_SCHEMA_VERSION, formatAuditEvent, makeAuditEvent } from "./audit.js";

export {
  RESULT_STATUSES,
  WORKER_COMMANDS,
  WORKER_PROTOCOL_VERSION,
  makeWorkerResult,
  validateWorkerCommand
} from "./protocol.js";

export {
  ARTIFACT_GENERATORS,
  MANIFEST_VERSION,
  artifactFilename,
  buildManifest,
  generateClaimSummaryHtml,
  makeManifestEntry,
  verifyArtifacts
} from "./artifacts.js";

export {
  CONTEXT_ENVELOPE_VERSION,
  DEFAULT_CONTEXT_BUDGET_BYTES,
  buildContextEnvelope,
  findTopicForFinding,
  findTopicForState,
  getHelpTopic,
  helpTopics,
  renderHelpTopic,
  renderNoModelAnswer,
  searchHelpTopics
} from "./assistance.js";

export {
  APPROVAL_TOKEN_VERSION,
  DEFAULT_APPROVAL_TTL_MS,
  evidenceDigest,
  issueApprovalToken,
  verifyApprovalToken
} from "./approval.js";

export { syntheticPacket } from "./synthetic.js";

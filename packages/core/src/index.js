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

export {
  findTopicForFinding,
  findTopicForState,
  getHelpTopic,
  helpTopics,
  renderHelpTopic,
  searchHelpTopics
} from "./assistance.js";

export { syntheticPacket } from "./synthetic.js";

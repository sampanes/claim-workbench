// Portable workbench shell: drives the real portable-core state machine on
// the synthetic packet and recipe. The destination workspace is simulated
// with canned evidence — the real browser worker runs as its own process —
// but every state transition, finding, override, approval gate, and audit
// event below comes from @claim-workbench/core, not from interface code.

import {
  applyAction,
  buildContextEnvelope,
  createRun,
  createSequentialIdFactory,
  evaluateRun,
  findTopicForState,
  formatAuditEvent,
  getHelpTopic,
  packetTotal,
  renderHelpTopic,
  renderNoModelAnswer,
  syntheticPacket
} from "@claim-workbench/core";
import "./styles.css";

const recipe = await (await fetch("./recipe.json")).json();

const idFactory = createSequentialIdFactory();
let packet = structuredClone(syntheticPacket);
let run = createRun({ packet, recipe, mode: "SubmitWithExplicitApproval", idFactory });
let events = [];
let statusMessage = "Ready. Synthetic data only; approval required before irreversible actions.";
let helpTopicId = null;
let assistantAnswer = null;
let approvalGranted = false;

// Canned worker evidence for the simulated destination workspace.
const DEMO_PAYLOADS = {
  match_record: { evidence: { recordMatched: true, memberId: "SYN-000123" } },
  fill_service_rows: { evidence: { serviceRowsExpected: 2, serviceRowsObserved: 2 } },
  compare_totals: { evidence: { expectedTotal: "250.00", observedTotal: "250.00" } },
  capture_receipt: { evidence: { receiptId: "SYN-RCPT-DEMO", capturedAt: "2026-07-01T12:00:00.000Z" } },
  request_approval: { evidence: { evidenceDigest: "(simulated)", destinationClass: "review" } }
};

function act(action, payload = {}) {
  try {
    if (action === "submit") payload = { ...payload, approvalVerified: approvalGranted };
    const result = applyAction({ packet, recipe, run, action, payload: { ...DEMO_PAYLOADS[action], ...payload }, idFactory });
    run = result.run;
    events = [...events, ...result.events];
    if (action === "request_approval") approvalGranted = true;
    if (action === "submit") approvalGranted = false;
    statusMessage = result.events.at(-1)?.summary ?? `${action} applied.`;
    assistantAnswer = null;
  } catch (error) {
    statusMessage = `${error.code ?? "ERROR"}: ${error.message}`;
  }
  render();
}

function overrideFinding(code) {
  const reason = window.prompt(`Reason for overriding ${code} (recorded in the audit history):`, "");
  if (!reason) return;
  act("record_override", { findingCode: code, reason });
}

function markManual() {
  const reason = window.prompt("Reason for manual handling (recorded in the audit history):", "");
  if (!reason) return;
  act("mark_manual", { reason });
}

function toggleTotal() {
  packet.total = packet.total.amount === "999.00" ? packetTotal(packet) : { amount: "999.00", currency: "USD" };
  statusMessage = packet.total.amount === "999.00"
    ? "Demo: the declared packet total was broken. Validate to see the hard stop."
    : "Demo: the declared packet total was repaired. Validate to continue.";
  assistantAnswer = null;
  render();
}

function askAssistant() {
  const evaluation = evaluateRun({ packet, recipe, run });
  const envelope = buildContextEnvelope({ screen: "workflow", evaluation });
  assistantAnswer = renderNoModelAnswer(envelope);
  render();
}

function showTopic(id) {
  helpTopicId = id;
  render();
}

const esc = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function render() {
  const evaluation = evaluateRun({ packet, recipe, run });
  const total = packet.total;
  const completed = new Set(run.completedSteps.map((step) => step.stepId));
  const currentTopic = (helpTopicId && getHelpTopic(helpTopicId)) || findTopicForState(run.state) || getHelpTopic("state.imported");

  const stepsHtml = recipe.steps.map((step) => {
    const state = completed.has(step.id) ? "done" : evaluation.nextStep?.id === step.id ? "active" : "";
    return `<li class="${state}"><button class="linklike" data-topic="${esc(step.helpTopicId ?? "")}">${esc(step.label)}</button></li>`;
  }).join("");

  const actionButtons = evaluation.availableActions.map((action) => {
    // Manual handling, overrides, and mode changes have dedicated controls.
    if (["mark_manual", "record_override", "resolve_missing_field", "set_assistance_mode"].includes(action.id)) return "";
    return `<button data-action="${esc(action.id)}">${esc(action.label)}</button>`;
  }).join("");

  const findingsHtml = evaluation.findings.length === 0
    ? "<p class=\"muted\">No findings. Deterministic checks are clean.</p>"
    : evaluation.findings.map((finding) => {
      const overridable = finding.severity === "warning" &&
        (recipe.overridableWarnings ?? []).includes(finding.code) &&
        !run.overrides.some((override) => override.findingCode === finding.code);
      return `<article class="finding ${esc(finding.severity)}">
        <strong>${esc(finding.code)}</strong>
        <span>${esc(finding.message)}</span>
        <span class="finding-meta">
          <button class="linklike" data-topic="${esc(finding.helpTopicId ?? "")}">Why?</button>
          ${overridable ? `<button class="linklike" data-override="${esc(finding.code)}">Record override</button>` : ""}
        </span>
      </article>`;
    }).join("");

  const auditHtml = events.length === 0
    ? "<p class=\"muted\">No actions recorded yet.</p>"
    : [...events].reverse().map((event) => `<p class="audit-line">${esc(formatAuditEvent(event))}</p>`).join("");

  const modeOptions = recipe.allowedModes.map((mode) =>
    `<option value="${esc(mode)}" ${mode === run.mode ? "selected" : ""}>${esc(mode)}</option>`).join("");

  document.querySelector("#root").innerHTML = `
  <main class="desktop-shell">
    <section class="window" aria-label="Claim Workbench prototype">
      <header class="titlebar"><div class="traffic" aria-hidden="true"><span></span><span></span><span></span></div><div class="titlecopy"><strong>Claim Workbench</strong><span>Local synthetic run — portable core demo</span></div><select id="mode" class="pill">${modeOptions}</select></header>
      <div class="toolbar">
        <div><span class="eyebrow">Packet</span><strong>${esc(packet.id)}</strong></div>
        <div><span class="eyebrow">Destination</span><strong>${esc(packet.destination.label)}</strong></div>
        <div><span class="eyebrow">State</span><strong>${esc(run.state)}</strong></div>
        <div><span class="eyebrow">Next safe action</span><strong>${esc(evaluation.nextStep?.label ?? "—")}</strong></div>
      </div>
      <div class="content-grid">
        <aside class="sidebar">
          <h2>Workflow</h2>
          <ol>${stepsHtml}</ol>
          <h3>Available actions</h3>
          ${actionButtons || "<p class=\"muted\">No actions in this state.</p>"}
          ${evaluation.terminal ? "" : `<button class="secondary" data-action-special="mark_manual">Handle manually</button>`}
          <h3>Demo controls</h3>
          <button class="secondary" id="toggle-total">${packet.total.amount === "999.00" ? "Repair the total" : "Break the total"}</button>
        </aside>
        <section class="browser-card">
          <div class="browser-chrome"><span></span>synthetic destination workspace (simulated)</div>
          <div class="portal-preview">
            <p class="eyebrow">Read-only packet facts</p>
            <h1>${esc(packet.client.displayName)}</h1>
            <div class="row"><span>Member ID</span><strong>${esc(packet.client.externalIds.sourceClientId)}</strong></div>
            ${packet.serviceLines.map((line) => `<div class="row"><span>${esc(line.serviceDate)} · ${esc(line.code)}</span><strong>${esc(line.amount.currency)} ${esc(line.amount.amount)}</strong></div>`).join("")}
            <div class="row"><span>Declared total</span><strong>${esc(total.currency)} ${esc(total.amount)}</strong></div>
            <h2>Findings</h2>
            ${findingsHtml}
          </div>
        </section>
        <aside class="inspector">
          <h2>Contextual help</h2>
          <div class="help">
            <strong>${esc(currentTopic.title)}</strong>
            <p>${esc(currentTopic.summary)}</p>
            ${currentTopic.explanation.map((line) => `<p class="muted">• ${esc(line)}</p>`).join("")}
            <small>Topic: ${esc(currentTopic.id)}</small>
          </div>
          <button class="secondary" id="ask">Explain this screen (no model)</button>
          ${assistantAnswer ? `<div class="help assistant"><pre>${esc(assistantAnswer.answer)}</pre><small>Citations: ${esc(assistantAnswer.citations.join(", "))}</small></div>` : ""}
          <h2>Audit history</h2>
          <div class="audit">${auditHtml}</div>
        </aside>
      </div>
      <footer class="status">${esc(statusMessage)}</footer>
    </section>
  </main>`;

  for (const button of document.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => act(button.dataset.action));
  }
  document.querySelector("[data-action-special='mark_manual']")?.addEventListener("click", markManual);
  for (const button of document.querySelectorAll("[data-override]")) {
    button.addEventListener("click", () => overrideFinding(button.dataset.override));
  }
  for (const button of document.querySelectorAll("[data-topic]")) {
    if (button.dataset.topic) button.addEventListener("click", () => showTopic(button.dataset.topic));
  }
  document.querySelector("#toggle-total").addEventListener("click", toggleTotal);
  document.querySelector("#ask").addEventListener("click", askAssistant);
  document.querySelector("#mode").addEventListener("change", (event) => act("set_assistance_mode", { mode: event.target.value }));
}

render();

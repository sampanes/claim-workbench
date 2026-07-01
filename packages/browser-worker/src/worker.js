// The browser worker (Milestones 5-7). Receives named, versioned commands
// and returns structured results with evidence. It never decides workflow
// truth: unknown pages disable mutation, identity mismatches block, and
// nothing here can bypass an approval gate.

import {
  makeFinding,
  makeWorkerResult,
  modeAtLeast,
  sha256Hex,
  utcNow,
  validateWorkerCommand,
  WORKER_COMMANDS
} from "@claim-workbench/core";
import { classifyPage } from "./classify.js";
import { controlByName } from "./page-model.js";

// The page each command must be looking at before it may run. Commands not
// listed observe whatever page is current.
const REQUIRED_PAGE = {
  matchRecord: "claim-form",
  fillServiceRows: "claim-form",
  verifyTotal: "claim-form",
  uploadArtifact: "claim-form",
  undoFill: "claim-form",
  submit: "review",
  captureReceipt: "receipt"
};

export class BrowserWorker {
  #driver;
  #recipe;
  #facts;
  #clock;
  #diagnosticMode;
  #paused = false;
  #stopped = false;
  #resultsByCommandId = new Map();

  constructor({ driver, recipe, facts, diagnosticMode = false, clock = Date }) {
    this.#driver = driver;
    this.#recipe = recipe;
    this.#facts = facts;
    this.#clock = clock;
    this.#diagnosticMode = diagnosticMode;
  }

  pause() { this.#paused = true; }
  resume() { this.#paused = false; }
  emergencyStop() { this.#stopped = true; }
  get paused() { return this.#paused; }
  get stopped() { return this.#stopped; }

  #diagnostics() {
    // Sensitive page captures are off by default (ADR-0005); the explicit
    // diagnostic mode attaches the observed page for troubleshooting.
    if (!this.#diagnosticMode) return null;
    const html = this.#driver.currentHtml();
    return html === null ? null : {
      url: this.#driver.currentPage()?.url ?? null,
      htmlSha256: sha256Hex(html),
      html,
      capturedAt: utcNow(this.#clock)
    };
  }

  #classify() {
    const page = this.#driver.currentPage();
    if (!page) return { page: null, classification: { pageId: null, ambiguous: false, evaluations: [] } };
    return { page, classification: classifyPage(page, this.#recipe.destination?.classification ?? {}) };
  }

  #result(command, status, summary, extras = {}) {
    const failureLike = status === "failed" || status === "blocked";
    return makeWorkerResult({
      command,
      status,
      summary,
      diagnostics: failureLike ? this.#diagnostics() : null,
      ...extras
    });
  }

  async handleCommand(command) {
    if (this.#stopped) {
      return this.#result(command, "cancelled", "Emergency stop is active; the command was not executed.", {
        findings: [makeFinding("WORKER_STOPPED")]
      });
    }
    if (this.#paused) {
      return this.#result(command, "cancelled", "The worker is paused; resume before sending commands.", {
        findings: [makeFinding("WORKER_PAUSED")]
      });
    }

    const problems = validateWorkerCommand(command);
    if (problems.length > 0) {
      return this.#result(command, "failed", `The command is not valid: ${problems.join(" ")}`, {
        evidence: { problems }
      });
    }

    if (command.packetId !== this.#facts.packetId) {
      return this.#result(command, "failed",
        `This worker session holds facts for ${this.#facts.packetId}, not ${command.packetId}.`, {
          evidence: { expectedPacketId: this.#facts.packetId }
        });
    }

    const definition = WORKER_COMMANDS[command.action];
    if (!modeAtLeast(command.mode, definition.minimumMode)) {
      return this.#result(command, "blocked",
        `Assistance mode ${command.mode} does not permit ${command.action}; ${definition.minimumMode} or higher is required.`, {
          nextActions: ["set_assistance_mode"]
        });
    }

    // A mutating command with a commandId the worker already executed must
    // not act twice; the original result is returned for review.
    if (definition.mutates && this.#resultsByCommandId.has(command.commandId)) {
      return this.#resultsByCommandId.get(command.commandId);
    }

    const result = await this.#dispatch(command);
    if (definition.mutates) {
      this.#resultsByCommandId.set(command.commandId, result);
    }
    return result;
  }

  async #dispatch(command) {
    const input = command.input ?? {};

    if (command.action === "readPage") {
      if (typeof input.url === "string") await this.#driver.open(input.url);
      const { page, classification } = this.#classify();
      if (!page) {
        return this.#result(command, "failed", "No page is open in the destination workspace.");
      }
      const findings = classification.pageId === null
        ? [makeFinding("PAGE_UNKNOWN", {
            message: classification.ambiguous
              ? "More than one page classification matched; treating the page as unknown."
              : "The current page did not match any classification for this recipe.",
            data: { url: page.url, title: page.title }
          })]
        : [];
      return this.#result(command, "succeeded",
        classification.pageId
          ? `Recognized page ${classification.pageId}: ${page.title}.`
          : `The current page is not recognized; mutating actions are disabled.`, {
          evidence: {
            url: page.url,
            title: page.title,
            pageId: classification.pageId,
            ambiguous: classification.ambiguous,
            classification: classification.evidence,
            controls: page.controls.map((control) => control.name)
          },
          findings,
          nextActions: classification.pageId ? ["match_record", "show_target"] : ["report_unexpected_page"]
        });
    }

    // Every other command requires an open page.
    const { page, classification } = this.#classify();
    if (!page) {
      return this.#result(command, "failed", "No page is open in the destination workspace.");
    }

    const requiredPage = REQUIRED_PAGE[command.action];
    if (requiredPage !== undefined && classification.pageId !== requiredPage) {
      return this.#result(command, "blocked",
        `${command.action} requires the ${requiredPage} page; the current page is ${classification.pageId ?? "not recognized"}.`, {
          evidence: { url: page.url, title: page.title, pageId: classification.pageId },
          findings: [makeFinding("PAGE_UNKNOWN", {
            message: `Expected the ${requiredPage} page; observed ${classification.pageId ?? "an unrecognized page"}.`,
            data: { url: page.url, expected: requiredPage, observed: classification.pageId }
          })],
          nextActions: ["read_page", "report_unexpected_page"]
        });
    }

    if (command.action === "showTarget") {
      if (classification.pageId === null) {
        return this.#result(command, "blocked", "Cannot highlight controls on an unrecognized page.", {
          findings: [makeFinding("PAGE_UNKNOWN", { data: { url: page.url } })]
        });
      }
      const target = input.target;
      const control = typeof target === "string" ? controlByName(page, target) : null;
      if (!control) {
        return this.#result(command, "failed", `The control ${JSON.stringify(target ?? "")} was not found on this page.`, {
          evidence: { target: target ?? null, controls: page.controls.map((item) => item.name) },
          findings: [makeFinding("TARGET_NOT_FOUND", { data: { target: target ?? null } })]
        });
      }
      await this.#driver.highlight(control.name);
      return this.#result(command, "succeeded", `Highlighted ${control.name} without changing any data.`, {
        evidence: { target: control.name, found: true, disabled: control.disabled }
      });
    }

    if (command.action === "matchRecord") {
      const observed = {
        memberId: controlByName(page, "memberId")?.value ?? null,
        memberName: controlByName(page, "memberName")?.value ?? null
      };
      const expected = { memberId: this.#facts.memberId, memberName: this.#facts.memberName };
      const matched = observed.memberId === expected.memberId;
      if (!matched) {
        return this.#result(command, "blocked",
          "The destination shows a different member than this packet bills for.", {
            evidence: { recordMatched: false, expected, observed },
            findings: [makeFinding("RECORD_MISMATCH", { data: { expected, observed } })],
            nextActions: ["read_page", "mark_manual"]
          });
      }
      return this.#result(command, "succeeded", `Matched member ${expected.memberId} on the destination.`, {
        evidence: { recordMatched: true, expected, observed },
        nextActions: ["fill_service_rows"]
      });
    }

    return this.#dispatchMutating(command, page, classification);
  }

  // Reversible and irreversible commands land in later milestones; keeping
  // the seam explicit makes the boundary auditable.
  async #dispatchMutating(command) {
    return this.#result(command, "failed", `The action ${command.action} is not implemented yet.`);
  }
}

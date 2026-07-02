// The browser worker (Milestones 5-7). Receives named, versioned commands
// and returns structured results with evidence. It never decides workflow
// truth: unknown pages disable mutation, identity mismatches block, and
// nothing here can bypass an approval gate.

import {
  evidenceDigest,
  makeFinding,
  makeWorkerResult,
  modeAtLeast,
  sha256Hex,
  utcNow,
  validateWorkerCommand,
  verifyApprovalToken,
  WORKER_COMMANDS
} from "@claim-workbench/core";
import { classifyPage } from "./classify.js";
import { controlByName, observedRows } from "./page-model.js";

function rowSignature(row) {
  return `${row.serviceDate}|${row.code}|${row.units ?? 1}|${row.amount}`;
}

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
  // Row signatures this worker added, so undo removes exactly what this
  // session filled and nothing an operator entered by hand.
  #addedRowSignatures = new Map();

  #approvalSecret;
  #usedApprovalTokenIds = new Set();

  constructor({ driver, recipe, facts, approvalSecret = null, diagnosticMode = false, clock = Date }) {
    this.#driver = driver;
    this.#recipe = recipe;
    this.#facts = facts;
    this.#approvalSecret = approvalSecret;
    this.#clock = clock;
    this.#diagnosticMode = diagnosticMode;
  }

  // The exact facts an approval must be bound to before submission: the
  // recognized page, the observed identity, every observed row, and the
  // observed total. Any change to these changes the digest.
  submitEvidence() {
    const { page, classification } = this.#classify();
    if (!page || classification.pageId !== "review") return null;
    const evidence = {
      pageId: classification.pageId,
      memberId: controlByName(page, "memberId")?.value ?? null,
      rows: observedRows(page).map(rowSignature),
      observedTotal: controlByName(page, "portalTotal")?.value ?? null
    };
    return { evidence, digest: evidenceDigest(evidence) };
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

  #fillEvidence(expectedRows) {
    const page = this.#driver.currentPage();
    const observed = observedRows(page);
    const observedSignatures = observed.map(rowSignature);
    const rows = expectedRows.map((row) => ({
      lineId: row.lineId,
      expected: rowSignature(row),
      observed: observedSignatures.includes(rowSignature(row))
    }));
    return {
      serviceRowsExpected: expectedRows.length,
      serviceRowsObserved: observed.length,
      rows,
      expectedTotal: this.#facts.expectedTotal,
      observedTotal: controlByName(page, "portalTotal")?.value ?? null
    };
  }

  #addFormFields(page, action) {
    const form = page.forms.find((candidate) => candidate.action === action);
    return form ? { ...form.fields } : null;
  }

  // Reversible commands (Milestone 6). Every mutation is observed-first:
  // rows that already exist are never added twice, and the result compares
  // expected against observed values instead of trusting the post.
  async #dispatchMutating(command, page, classification) {
    const input = command.input ?? {};

    if (command.action === "fillServiceRows") {
      const wanted = input.serviceLineIds ?? this.#facts.serviceRows.map((row) => row.lineId);
      const expectedRows = [];
      for (const lineId of wanted) {
        const row = this.#facts.serviceRows.find((candidate) => candidate.lineId === lineId);
        if (!row) {
          return this.#result(command, "failed", `The packet has no service line ${JSON.stringify(lineId)}.`, {
            evidence: { unknownLineId: lineId }
          });
        }
        expectedRows.push(row);
      }

      const baseFields = this.#addFormFields(page, "/portal/claim/add");
      if (!baseFields) {
        return this.#result(command, "failed", "The claim form has no add-row form to fill.", {
          findings: [makeFinding("TARGET_NOT_FOUND", { data: { target: "add-row form" } })]
        });
      }

      let added = 0;
      for (const row of expectedRows) {
        if (this.#stopped) {
          return this.#result(command, "cancelled",
            `Emergency stop interrupted the fill after ${added} row(s).`, {
              evidence: this.#fillEvidence(expectedRows),
              findings: [makeFinding("WORKER_STOPPED")]
            });
        }
        const current = observedRows(this.#driver.currentPage()).map(rowSignature);
        const signature = rowSignature(row);
        // Observed-first idempotency: an identical row on the page is
        // evidence of prior work, not something to repeat.
        if (current.includes(signature)) continue;
        await this.#driver.submitForm("/portal/claim/add", {
          ...baseFields,
          serviceDate: row.serviceDate,
          code: row.code,
          units: String(row.units ?? 1),
          amount: row.amount
        });
        if (this.#driver.currentStatus() >= 400) {
          return this.#result(command, "failed",
            `The destination rejected row ${row.lineId} (${signature}).`, {
              evidence: this.#fillEvidence(expectedRows)
            });
        }
        this.#addedRowSignatures.set(signature, (this.#addedRowSignatures.get(signature) ?? 0) + 1);
        added += 1;
      }

      const evidence = this.#fillEvidence(expectedRows);
      const allObserved = evidence.rows.every((row) => row.observed);
      const totalsMatch = evidence.observedTotal === evidence.expectedTotal &&
        evidence.serviceRowsObserved === evidence.serviceRowsExpected;
      if (!allObserved) {
        return this.#result(command, "failed", "Some rows are not observed on the page after filling.", {
          evidence
        });
      }
      return this.#result(command, "succeeded",
        `Filled ${added} row(s); ${evidence.serviceRowsObserved} row(s) observed. ` +
        (totalsMatch
          ? "Observed total matches the packet."
          : "Observed total does not yet match the packet; compare totals before review."), {
          evidence,
          findings: totalsMatch ? [] : [makeFinding("TOTAL_MISMATCH", {
            data: { expectedTotal: evidence.expectedTotal, observedTotal: evidence.observedTotal }
          })],
          nextActions: totalsMatch ? ["compare_totals", "undo_fill"] : ["undo_fill", "mark_manual"]
        });
    }

    if (command.action === "verifyTotal") {
      const evidence = this.#fillEvidence(this.#facts.serviceRows);
      const matched = evidence.observedTotal === evidence.expectedTotal &&
        evidence.serviceRowsObserved === evidence.serviceRowsExpected;
      if (!matched) {
        return this.#result(command, "blocked",
          `Observed total ${evidence.observedTotal ?? "(none)"} over ${evidence.serviceRowsObserved} row(s) does not match the packet total ${evidence.expectedTotal} over ${evidence.serviceRowsExpected} row(s).`, {
            evidence,
            findings: [makeFinding("TOTAL_MISMATCH", {
              data: { expectedTotal: evidence.expectedTotal, observedTotal: evidence.observedTotal }
            })],
            nextActions: ["show_service_rows", "undo_fill", "mark_manual"]
          });
      }
      return this.#result(command, "succeeded",
        `Observed total ${evidence.observedTotal} matches the packet total over ${evidence.serviceRowsObserved} row(s).`, {
          evidence,
          nextActions: ["user_review"]
        });
    }

    if (command.action === "uploadArtifact") {
      const artifact = this.#facts.artifacts.find((candidate) => candidate.kind === input.kind);
      if (!artifact) {
        return this.#result(command, "failed", `No artifact of kind ${JSON.stringify(input.kind)} is available for this packet.`, {
          evidence: { kind: input.kind ?? null }
        });
      }
      // Integrity check against the manifest hash before anything leaves
      // the workbench.
      if (sha256Hex(artifact.content) !== artifact.sha256) {
        return this.#result(command, "blocked",
          `Artifact ${artifact.filename} does not match its manifest hash and will not be uploaded.`, {
            evidence: { filename: artifact.filename, kind: artifact.kind },
            findings: [makeFinding("ARTIFACT_TAMPERED", {
              data: { resolvedBy: "generate_artifacts", filename: artifact.filename }
            })]
          });
      }
      const attachmentName = artifact.filename.split("/").at(-1);
      const alreadyObserved = page.controls.some(
        (control) => control.name === "attachment" && control.value === attachmentName
      );
      if (!alreadyObserved) {
        const baseFields = this.#addFormFields(page, "/portal/claim/attach");
        if (!baseFields) {
          return this.#result(command, "failed", "The claim form has no attachment form.", {
            findings: [makeFinding("TARGET_NOT_FOUND", { data: { target: "attachment form" } })]
          });
        }
        await this.#driver.submitForm("/portal/claim/attach", {
          ...baseFields,
          filename: attachmentName,
          content: artifact.content
        });
        if (this.#driver.currentStatus() >= 400) {
          return this.#result(command, "failed", `The destination rejected the attachment ${attachmentName}.`);
        }
      }
      const observed = this.#driver.currentPage().controls.some(
        (control) => control.name === "attachment" && control.value === attachmentName
      );
      if (!observed) {
        return this.#result(command, "failed", `The attachment ${attachmentName} is not observed on the page after upload.`);
      }
      return this.#result(command, "succeeded", `Attached ${attachmentName} (${artifact.sha256.slice(0, 12)}…).`, {
        evidence: { filename: attachmentName, sha256: artifact.sha256, observedAttachment: true }
      });
    }

    if (command.action === "undoFill") {
      let removed = 0;
      while (true) {
        const pending = [...this.#addedRowSignatures.entries()].filter(([, count]) => count > 0);
        if (pending.length === 0) break;
        const current = observedRows(this.#driver.currentPage());
        const target = current.find((row) => (this.#addedRowSignatures.get(rowSignature(row)) ?? 0) > 0);
        if (!target) break;
        const baseFields = this.#addFormFields(this.#driver.currentPage(), "/portal/claim/remove");
        await this.#driver.submitForm("/portal/claim/remove", {
          ...(baseFields ?? {}),
          row: target.rowName
        });
        if (this.#driver.currentStatus() >= 400) {
          return this.#result(command, "failed", `The destination refused to remove ${target.rowName}.`, {
            evidence: { removedRows: removed }
          });
        }
        const signature = rowSignature(target);
        this.#addedRowSignatures.set(signature, this.#addedRowSignatures.get(signature) - 1);
        removed += 1;
      }
      const evidence = this.#fillEvidence(this.#facts.serviceRows);
      return this.#result(command, "succeeded",
        `Removed ${removed} row(s) this session had filled; ${evidence.serviceRowsObserved} row(s) remain.`, {
          evidence: { ...evidence, removedRows: removed },
          nextActions: ["fill_service_rows", "read_page"]
        });
    }

    if (command.action === "submit") {
      // Verification happens before any portal interaction: a missing,
      // expired, reused, rescoped, or evidence-mismatched approval means
      // nothing is sent.
      const current = this.submitEvidence();
      if (!current) {
        return this.#result(command, "blocked", "Submission requires the review page.", {
          findings: [makeFinding("PAGE_UNKNOWN", { data: { expected: "review" } })]
        });
      }
      if (this.#approvalSecret === null) {
        return this.#result(command, "blocked", "This worker session has no approval verifier configured; submission is disabled.", {
          findings: [makeFinding("APPROVAL_REQUIRED")]
        });
      }
      const verdict = verifyApprovalToken({
        token: command.approvalToken,
        secret: this.#approvalSecret,
        expected: {
          action: "submit",
          packetId: command.packetId,
          runId: command.runId,
          stepId: command.stepId,
          destinationClass: "review",
          evidenceDigest: current.digest
        },
        clock: this.#clock,
        usedTokenIds: this.#usedApprovalTokenIds
      });
      if (!verdict.ok) {
        return this.#result(command, "blocked", `Submission did not run: ${verdict.message}`, {
          evidence: { evidenceDigest: current.digest, submitted: false },
          findings: [makeFinding(verdict.code)],
          nextActions: ["request_approval", "read_page"]
        });
      }

      const baseFields = this.#addFormFields(page, "/portal/claim/submit");
      if (!baseFields) {
        return this.#result(command, "failed", "The review page has no submit form.", {
          findings: [makeFinding("TARGET_NOT_FOUND", { data: { target: "submit form" } })]
        });
      }
      await this.#driver.submitForm("/portal/claim/submit", { ...baseFields, confirm: "yes" });
      const status = this.#driver.currentStatus();
      if (status === 409) {
        return this.#result(command, "failed",
          "The destination rejected the submission as a duplicate. Capture the existing receipt instead of retrying.", {
            evidence: { submitted: false, evidenceDigest: current.digest },
            findings: [makeFinding("DUPLICATE_SUBMISSION")],
            nextActions: ["capture_receipt", "mark_manual"]
          });
      }
      if (status >= 400) {
        return this.#result(command, "failed", `The destination rejected the submission (HTTP ${status}).`, {
          evidence: { submitted: false, evidenceDigest: current.digest }
        });
      }
      const after = this.#classify();
      const receiptId = controlByName(after.page, "confirmationNumber")?.value ?? null;
      if (after.classification.pageId !== "receipt" || !receiptId) {
        return this.#result(command, "failed",
          "Submission was sent but no receipt page was observed; treat this packet as manual until the receipt is located.", {
            evidence: { submitted: true, receiptObserved: false },
            findings: [makeFinding("RECEIPT_MISSING")],
            nextActions: ["mark_manual"]
          });
      }
      return this.#result(command, "succeeded",
        `Submitted with approval ${verdict.tokenId}; the destination issued confirmation ${receiptId}.`, {
          evidence: {
            submitted: true,
            approvalTokenId: verdict.tokenId,
            evidenceDigest: current.digest,
            receiptId,
            observedTotal: controlByName(after.page, "portalTotal")?.value ?? null
          },
          nextActions: ["capture_receipt"]
        });
    }

    if (command.action === "captureReceipt") {
      const receiptId = controlByName(page, "confirmationNumber")?.value ?? null;
      if (!receiptId) {
        return this.#result(command, "failed", "No confirmation number is observed on this page.", {
          findings: [makeFinding("RECEIPT_MISSING")]
        });
      }
      const html = this.#driver.currentHtml() ?? "";
      return this.#result(command, "succeeded", `Captured receipt ${receiptId}.`, {
        evidence: {
          receiptId,
          memberId: controlByName(page, "memberId")?.value ?? null,
          observedTotal: controlByName(page, "portalTotal")?.value ?? null,
          contentSha256: sha256Hex(html),
          capturedAt: utcNow(this.#clock),
          url: page.url
        },
        nextActions: ["complete"]
      });
    }

    return this.#result(command, "failed", `The action ${command.action} is not implemented yet.`);
  }
}

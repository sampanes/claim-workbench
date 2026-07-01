// Deterministic page classification. A page is recognized only when every
// piece of declared evidence agrees: URL pattern, title pattern, required
// visible text, and required controls. URL alone is never sufficient
// (docs/INTERACTION_MODEL.md): generic routes and lookalike pages must fail.

export function classifyPage(page, classificationSpecs) {
  const evaluations = [];
  for (const [pageId, spec] of Object.entries(classificationSpecs ?? {})) {
    const evidence = {
      urlMatched: spec.urlPattern ? new RegExp(spec.urlPattern).test(page.url) : true,
      titleMatched: spec.titlePattern ? new RegExp(spec.titlePattern).test(page.title) : true,
      textMatched: [],
      textMissing: [],
      controlsMatched: [],
      controlsMissing: []
    };
    for (const required of spec.requiredText ?? []) {
      (page.text.includes(required) ? evidence.textMatched : evidence.textMissing).push(required);
    }
    const controlNames = new Set(page.controls.map((control) => control.name));
    for (const required of spec.requiredControls ?? []) {
      (controlNames.has(required) ? evidence.controlsMatched : evidence.controlsMissing).push(required);
    }
    const recognized =
      evidence.urlMatched &&
      evidence.titleMatched &&
      evidence.textMissing.length === 0 &&
      evidence.controlsMissing.length === 0;
    evaluations.push({ pageId, recognized, evidence });
  }

  const recognized = evaluations.filter((evaluation) => evaluation.recognized);
  if (recognized.length === 1) {
    return { pageId: recognized[0].pageId, ambiguous: false, evidence: recognized[0].evidence, evaluations };
  }
  // Zero matches is unknown; more than one match is ambiguous, which is
  // treated exactly like unknown: mutating actions stay disabled.
  return { pageId: null, ambiguous: recognized.length > 1, evidence: null, evaluations };
}

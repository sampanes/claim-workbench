// Workflow recipes (Milestone 3). A recipe describes procedure: required
// fields, required artifacts, destination classification, permitted
// assistance modes, overridable warnings, and ordered steps. Recipes are
// data, versioned like every other shared contract (ADR-0002, ADR-0003).

import { isKnownAction, ASSISTANCE_MODES } from "./actions.js";
import { findingDefinition, isKnownFindingCode, makeFinding, SEVERITIES } from "./findings.js";

export const RECIPE_SCHEMA_VERSION = "1";

export function validateRecipe(recipe) {
  const findings = [];
  const problem = (message, path) => findings.push(makeFinding("RECIPE_INVALID", { message, path }));

  if (typeof recipe !== "object" || recipe === null) {
    problem("The recipe is not an object.", "");
    return findings;
  }
  if (recipe.recipeVersion !== RECIPE_SCHEMA_VERSION) {
    findings.push(makeFinding("RECIPE_SCHEMA_UNSUPPORTED", {
      message: `Recipe schema version ${JSON.stringify(recipe.recipeVersion)} is not supported. This application supports version ${RECIPE_SCHEMA_VERSION}.`,
      path: "recipeVersion"
    }));
    return findings;
  }

  for (const key of ["id", "revision", "title", "destinationId"]) {
    if (typeof recipe[key] !== "string" || recipe[key].length === 0) {
      problem(`Recipe field ${key} is required.`, key);
    }
  }

  if (!Array.isArray(recipe.allowedModes) || recipe.allowedModes.length === 0) {
    problem("Recipe must list at least one allowed assistance mode.", "allowedModes");
  } else {
    for (const mode of recipe.allowedModes) {
      if (!ASSISTANCE_MODES.includes(mode)) problem(`Unknown assistance mode ${JSON.stringify(mode)}.`, "allowedModes");
    }
  }

  for (const [index, field] of (recipe.requiredFields ?? []).entries()) {
    if (typeof field?.path !== "string" || field.path.length === 0) {
      problem("Required field entries need a packet path.", `requiredFields[${index}].path`);
    }
    if (typeof field?.label !== "string" || field.label.length === 0) {
      problem("Required field entries need a plain-language label.", `requiredFields[${index}].label`);
    }
  }

  for (const [index, artifact] of (recipe.requiredArtifacts ?? []).entries()) {
    if (typeof artifact?.kind !== "string" || artifact.kind.length === 0) {
      problem("Required artifact entries need a kind.", `requiredArtifacts[${index}].kind`);
    }
  }

  for (const code of recipe.overridableWarnings ?? []) {
    if (!isKnownFindingCode(code)) {
      problem(`Overridable warning ${JSON.stringify(code)} is not a known finding code.`, "overridableWarnings");
    } else if (findingDefinition(code).severity !== SEVERITIES.WARNING) {
      // A recipe may never make a hard stop (or a notice) overridable.
      problem(`Finding ${code} is ${findingDefinition(code).severity}, not a warning, and cannot be listed as overridable.`, "overridableWarnings");
    }
  }

  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    problem("Recipe must define at least one step.", "steps");
    return findings;
  }
  const seenSteps = new Set();
  for (const [index, step] of recipe.steps.entries()) {
    const path = `steps[${index}]`;
    if (typeof step?.id !== "string" || step.id.length === 0) {
      problem("Step id is required.", `${path}.id`);
      continue;
    }
    if (seenSteps.has(step.id)) problem(`Duplicate step id ${JSON.stringify(step.id)}.`, `${path}.id`);
    seenSteps.add(step.id);
    if (typeof step.label !== "string" || step.label.length === 0) {
      problem(`Step ${step.id} needs a plain-language label.`, `${path}.label`);
    }
    if (!isKnownAction(step.action)) {
      problem(`Step ${step.id} names unknown action ${JSON.stringify(step.action)}.`, `${path}.action`);
    }
    if (step.irreversible === true && step.approvalGate !== true) {
      findings.push(makeFinding("RECIPE_GATE_MISSING", {
        message: `Step ${step.id} is irreversible but declares no approval gate.`,
        path: `${path}.approvalGate`
      }));
    }
  }

  return findings;
}

export function parseRecipe(json) {
  let recipe;
  try {
    recipe = typeof json === "string" ? JSON.parse(json) : json;
  } catch (error) {
    return { recipe: null, findings: [makeFinding("RECIPE_INVALID", { message: `Recipe is not valid JSON: ${error.message}`, path: "" })] };
  }
  const findings = validateRecipe(recipe);
  return { recipe: findings.some((finding) => finding.severity === SEVERITIES.HARD_STOP) ? null : recipe, findings };
}

// Resolve a dotted path such as "client.externalIds.memberId" against a
// packet. Arrays are not traversed; required fields address scalar facts.
export function getPacketPath(packet, path) {
  let value = packet;
  for (const segment of path.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = value[segment];
  }
  return value;
}

// Evaluate recipe-required fields against a packet. Missing values reuse the
// MISSING_REQUIRED_FIELD code so the interface and assistance treat them
// exactly like schema-required fields.
export function evaluateRequiredFields(recipe, packet) {
  const findings = [];
  for (const field of recipe.requiredFields ?? []) {
    const value = getPacketPath(packet, field.path);
    const missing = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (missing) {
      findings.push(makeFinding("MISSING_REQUIRED_FIELD", {
        message: `${field.label} is required by recipe ${recipe.id} and is missing.`,
        path: field.path,
        data: { recipeId: recipe.id, label: field.label, helpTopicId: field.helpTopicId ?? null }
      }));
    }
  }
  return findings;
}

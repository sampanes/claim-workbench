# Contextual Assistance

## Goal

Claim Workbench should explain the current workflow effectively without
requiring a large or remote model. Assistance quality comes primarily from
structured application context, concise source material, deterministic action
boundaries, and regression tests.

The design target is:

```text
deterministic help first -> small local model improves wording -> workflow rules remain authoritative
```

## Canonical Help Topics

Help content uses stable topic IDs and small independently retrievable records.
A topic should answer one operational question.

```yaml
id: finding.total_mismatch
title: Why do the totals not match?
summary: The packet total and destination total are different.
applies_when:
  finding_code: TOTAL_MISMATCH
explanation:
  - Compare the number of service rows.
  - Compare each amount against the packet.
  - Do not continue until the difference is resolved.
allowed_actions:
  - show_service_rows
  - compare_totals
  - mark_manual
never_suggest:
  - ignore_hard_stop
  - submit
related:
  - action.compare_totals
```

The exact schema will be versioned with the other shared contracts.

Topics may describe:

- actions and their outcomes
- fields and accepted values
- workflow states
- notices, warnings, and hard stops
- artifacts and freshness requirements
- common recovery procedures
- privacy and diagnostic controls

Developer architecture explanations remain in normal documentation and are not
automatically included in operator assistance.

## Assistance Metadata

Every user-visible domain element carries stable assistance references:

```text
action.helpTopicId
field.helpTopicId
finding.helpTopicId
state.helpTopicId
recipeStep.helpTopicId
```

Actions also expose:

- plain-language label
- short description
- required preconditions
- expected evidence
- reversible or irreversible classification
- likely failure codes

This metadata drives buttons, tooltips, direct help, and model context from one
source.

## Context Envelope

The assistant never receives an unbounded database dump or repository snapshot.
The application builds a small context envelope:

```json
{
  "contextVersion": "1",
  "screen": "workflow",
  "state": "FieldsFilled",
  "step": {
    "id": "verify-total",
    "label": "Compare totals"
  },
  "findings": [
    {
      "code": "TOTAL_MISMATCH",
      "severity": "hard_stop",
      "helpTopicId": "finding.total_mismatch"
    }
  ],
  "availableActions": [
    {
      "id": "compare_totals",
      "label": "Compare totals",
      "helpTopicId": "action.compare_totals"
    },
    {
      "id": "mark_manual",
      "label": "Handle manually",
      "helpTopicId": "action.mark_manual"
    }
  ],
  "helpTopics": [
    "finding.total_mismatch",
    "action.compare_totals",
    "action.mark_manual"
  ]
}
```

The envelope uses identifiers or redacted display values by default. Protected
fields require an explicit task-specific inclusion policy.

## Model Contract

A local model may:

- explain the current step
- explain a finding in simpler language
- summarize missing information
- describe available actions
- help locate a control
- draft text from explicitly supplied non-sensitive facts

A local model may not:

- decide whether a claim is valid
- invent a field value
- clear or downgrade a finding
- expose an unavailable action
- issue arbitrary browser or database commands
- authorize an irreversible operation

Responses cite the help-topic and finding IDs used. Unsupported questions fall
back to direct help or a clear statement that the supplied context is
insufficient.

## No-Model Mode

Every assistance feature must work without a model:

- contextual help opens the relevant topic
- findings show their explanation and recovery actions
- tooltips come from assistance metadata
- search operates over topic titles, summaries, and aliases
- the current-step panel lists preconditions and expected outcomes

The model is a language layer over this system, not its foundation.

## Evaluation

Assistance regression fixtures contain:

- a synthetic context envelope
- an operator question
- required topic or finding citations
- allowed action references
- prohibited claims or actions
- a maximum context budget

CI evaluates:

- deterministic topic retrieval
- no-model rendering
- context redaction
- response grounding
- refusal to invent unavailable actions
- performance with the smallest supported local model when model tests are
  enabled

Evaluation uses only synthetic data.

## Authoring Rule

A user-visible feature is not complete until it provides:

1. Stable domain and finding codes
2. Plain-language labels
3. Relevant help topics
4. Explicit available and prohibited actions
5. Synthetic assistance tests

This keeps helpfulness aligned with behavior as the application grows.

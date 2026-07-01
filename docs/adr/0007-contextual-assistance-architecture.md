# ADR-0007: Contextual Assistance Architecture

## Status

Accepted

## Context

Claim Workbench should remain understandable to nontechnical operators and
useful with small local language models. Small models perform poorly when they
must infer application state, search long developer documentation, invent tool
calls, or distinguish authoritative workflow rules from descriptive prose.

Adding an informal Markdown companion beside every source file would duplicate
knowledge, drift away from behavior, and expose implementation detail instead
of operational guidance.

## Decision

- Treat contextual assistance as a product interface, not as a chatbot feature.
- Maintain concise, versioned help topics keyed by stable IDs.
- Attach help-topic IDs, plain-language labels, preconditions, outcomes, and
  failure explanations to recipes, actions, fields, findings, and workflow
  states.
- Generate human-readable help pages and retrieval indexes from the same
  canonical content.
- Give the assistant a compact, structured context envelope containing only the
  current workflow state, relevant findings, available actions, and retrieved
  help topics.
- Require answers to cite supplied help-topic and finding IDs.
- Let deterministic application logic choose available actions and resolve
  workflow truth. A model may explain or rephrase but cannot create permissions,
  clear findings, or execute arbitrary commands.
- Keep protected data out of assistance context unless a specific local task
  requires the minimum necessary fields.
- Support a no-model mode that presents the same help topics directly.
- Evaluate assistance with small-model and no-model test suites from the first
  executable release.

## Consequences

Operational help is authored near the domain contract it explains without being
duplicated beside every implementation file. Tiny models receive a narrow,
high-signal prompt instead of the repository or an entire record. A model
failure degrades to deterministic help rather than blocking the workflow.

Feature work is incomplete until new user-visible actions, fields, findings,
and states include assistance metadata and evaluation fixtures.

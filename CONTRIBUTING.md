# Contributing

Claim Workbench welcomes contributions that make claim workflows safer, more
portable, easier to test, or easier to configure.

## Ground Rules

- Use synthetic data in examples, tests, screenshots, and bug reports.
- Do not commit credentials, authentication state, private contracts, or live
  claim data.
- Do not submit integrations that depend on bypassing authentication or hiding
  automated browser activity.
- Preserve explicit approval gates for irreversible actions.
- Keep billing correctness in deterministic rules and validators.
- Add tests for new schemas, recipe behavior, and workflow transitions.

## Good First Contribution Areas

- JSON schemas and validation fixtures
- synthetic source-report adapters
- fake-portal behavior and accessibility
- recipe authoring and validation
- duplicate-detection test cases
- receipt and audit-log formats
- cross-platform bootstrap and verification
- SwiftUI packet and workflow views
- documentation

## Development Workflow

The initial development commands will be documented once the executable
prototype and package layout are committed. Until then, architecture changes
should include a concise design note or issue describing:

- the workflow problem
- the proposed interface or schema change
- safety and approval implications
- synthetic test coverage

## Reporting Security Or Privacy Problems

Do not open a public issue containing sensitive data. See
[Security](SECURITY.md) for private reporting guidance.

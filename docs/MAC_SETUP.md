# macOS Development Setup

Claim Workbench includes its native macOS source and cross-platform components
in the same repository. GitHub Actions provides continuous macOS compilation
and test coverage, while a physical Mac is used for final native integration
and user-experience checks.

## Target Experience

A fresh checkout should eventually support:

```sh
git clone https://github.com/sampanes/claim-workbench.git
cd claim-workbench
./scripts/bootstrap-macos.sh
./scripts/verify-macos.sh
```

These scripts will be added with the first executable prototype.

## Bootstrap Contract

`bootstrap-macos.sh` should:

- verify the macOS version and CPU architecture
- verify Xcode Command Line Tools and the required Swift version
- install or verify JavaScript dependencies and Playwright browsers
- create local development directories and synthetic configuration
- avoid requiring credentials or access to a real billing system
- be safe to run repeatedly

## Verification Contract

`verify-macos.sh` should:

- run schema, recipe, validation, and duplicate-detection tests
- build and test Swift packages and the SwiftUI application
- test the browser worker against the fake portal
- execute a synthetic end-to-end billing packet workflow
- verify generated artifacts and receipt fixtures
- run supported macOS integration and UI tests
- report each capability as passed, failed, or skipped

Local development verification must not require Apple signing credentials.
Developer ID signing, notarization, and release packaging are separate release
workflows.

## Checks Requiring A Physical Mac

GitHub-hosted macOS runners can compile Swift and run most automated tests. A
physical Mac remains important for final checks involving:

- Finder and Quick Look behavior
- PDFKit presentation
- AppleScript or JXA integrations
- accessibility permission prompts
- installed browser behavior
- the complete visible workflow and interaction quality

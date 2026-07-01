# ADR-0005: Local Security and Data Lifecycle

## Status

Accepted

## Context

Claim workflows may involve credentials, authenticated browser state,
diagnostic captures, and locally retained billing data. Convenience must not
require the application to own website passwords or silently move data to a
remote service.

## Decision

- Never store website passwords in Claim Workbench.
- Use Apple Passwords/Keychain or the equivalent operating-system credential
  store for credentials and secrets.
- Support operating-system authentication, including Touch ID on macOS, for
  autofill and sensitive application actions, with password fallback.
- Treat website login as a manual browser step before automation continues.
- Isolate browser authentication state from packets, logs, backups, and
  exports.
- Disable screenshots, traces, and sensitive page captures by default.
- Require an explicit visible diagnostic mode with redaction hooks, short
  retention, and permanent deletion.
- Provide encrypted export and tested restore.
- Provide clear retention controls and verified deletion of all local
  application data.
- Never initiate cloud backup, upload, or synchronization.
- Permit a user to deliberately export an encrypted backup to storage they
  select.

## Consequences

The application does not receive website passwords. Browser automation must
pause for authentication and prototype compatibility with operating-system
autofill. Normal runs retain minimum structured evidence. Sensitive diagnostics
have a separate lifecycle. Backup destinations are explicit user choices, and
tests verify restore, retention, deletion, and absence of background cloud
transfer.

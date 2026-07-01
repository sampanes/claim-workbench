# ADR-0003: Domain Representation and Compatibility

## Status

Accepted

## Context

Billing data is vulnerable to rounding errors, ambiguous dates, and silent
schema drift. Persisted packets and recipes must remain understandable after
the application evolves.

## Decision

- Represent money as a decimal string plus an ISO 4217 currency code.
- Never represent domain money as binary floating-point.
- Represent service dates as ISO 8601 date-only strings.
- Represent events as UTC timestamps and retain the relevant IANA time-zone
  identifier when local interpretation matters.
- Give every persisted packet, recipe, protocol message, and database schema an
  explicit version.
- Provide forward migrations for every released format within the same major
  application version.
- Reject unknown future versions without modifying their source data.
- Permit documented breaking format changes only in a new major version.

## Consequences

Calculations require decimal arithmetic. Service dates do not shift between
time zones, while audit events remain globally ordered. Migration fixtures stay
in the test suite for the lifetime of a major version. Unsupported data fails
clearly instead of being interpreted heuristically.

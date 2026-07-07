# Diagnostic report channel (red → green)

This is the **only** path by which real-origin information may cross from the
red zone (Mom's Mac) back to the green zone (the laptop where Claude and the
code live).

Files here are written by the diagnostic scrubber, not by hand. Everything in
this folder is:

1. **structured** — it carries finding codes, counts, shapes, timings, and
   error types, never raw field values;
2. **scrubbed** — real names and identifiers are redacted by exact value, with
   a pattern scan on top;
3. **re-checked at commit time** — the commit firewall
   (`scripts/isolation/`) rescans every file here for anything that looks like
   a name, id, or credential and blocks the commit if it finds one.

Screenshots and trace files never cross. They stay red-zone; only the
structured evidence derived from them travels.

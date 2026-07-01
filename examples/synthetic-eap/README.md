# Synthetic EAP Example

Synthetic fixtures for a behavioral-health EAP style monthly billing
workflow. Every client, identifier, service code, and amount is invented;
nothing here corresponds to a real person, provider, payer, or claim.

## Files

- `mapping.json` — column mapping for the generic CSV source adapter.
- `data/synthetic-eap-2026-06.csv` — a June source report covering two
  synthetic clients. It deliberately mixes formats the adapter must
  normalize: `$` prefixes, missing decimals, US-style dates, and quoted
  descriptions containing commas.
- `data/synthetic-eap-2026-06-revised.csv` — a revised export of the same
  month with reordered rows, one changed amount (`SYN-ROW-0002`), and one
  new service (`SYN-ROW-0005`). Importing it after the original exercises
  duplicate and near-duplicate review.

## Expected behavior

Importing the first report produces one packet per client. Re-importing the
revised report against the existing work produces:

- Jordan Example: every line already exists — the packet is a full
  duplicate and creates no new work.
- Taylor Example: one exact duplicate, one changed row that needs review,
  and one genuinely new service.

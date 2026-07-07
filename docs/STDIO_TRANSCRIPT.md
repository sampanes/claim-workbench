# Sample stdio Transcript

A representative session with the local service over its one-JSON-message-per-
line stdio transport (ADR-0002, [Worker protocol](WORKER_PROTOCOL.md) is the
separate worker-facing contract). Regenerate with:

```sh
node scripts/generate-stdio-transcript.mjs
```

The service was started as:

```sh
node packages/service/bin/service.js --db :memory: --recipe examples/synthetic-eap/recipe.json
```

Requests go to stdin, one JSON object per line; each line on stdout is the
response carrying the same `requestId`. Long payloads below are elided with
`...` for readability; identifiers and hashes vary per session.

## Health check

Request:

```json
{
  "requestId": "r1",
  "op": "ping",
  "input": {}
}
```

Response:

```json
{
  "requestId": "r1",
  "ok": true,
  "output": {
    "service": "claim-workbench",
    "ok": true
  }
}
```

## List loaded recipes

Request:

```json
{
  "requestId": "r2",
  "op": "listRecipes",
  "input": {}
}
```

Response:

```json
{
  "requestId": "r2",
  "ok": true,
  "output": [
    {
      "id": "synthetic-eap-monthly",
      "revision": "1",
      "title": "Synthetic EAP monthly claims",
      "destinationId": "synthetic-eap-portal"
    }
  ]
}
```

## Import a CSV report

Request:

```json
{
  "requestId": "r3",
  "op": "importCsv",
  "input": {
    "csvText": "Row ID,Member ID,Member Name,Service Date,Service Code,Description,Units,Amount\r\nSYN-ROW-0001,SYN-000123,Taylor Examp...",
    "mapping": {
      "mappingVersion": "1",
      "adapterId": "csv-generic",
      "adapterVersion": "1",
      "destinationId": "synthetic-eap-portal",
      "destinationLabel": "Synthetic EAP Portal",
      "recipeId": "synthetic-eap-monthly",
      "currency": "USD",
      "columns": {
        "sourceId": "Row ID",
        "clientId": "Member ID",
        "clientName": "Member Name",
        "serviceDate": "Service Date",
        "code": "Service Code",
        "description": "Description",
        "units": "Units",
        "amount": "Amount"
      }
    },
    "sourceName": "synthetic-eap-2026-06.csv"
  }
}
```

Response:

```json
{
  "requestId": "r3",
  "ok": true,
  "output": {
    "batchId": "batch_304515a92fc74e0ab973a1220bde2b61",
    "batch": {
      "id": "batch_304515a92fc74e0ab973a1220bde2b61",
      "importedAt": "2026-07-07T03:43:41.188Z",
      "sourceName": "synthetic-eap-2026-06.csv",
      "sourceSha256": "3730c7418e54dc41074b5f1bd10e72b6149cdd234ffff7aa426fe282751d8c88",
      "adapterId": "csv-generic",
      "adapterVersion": "1",
      "rowCount": 4,
      "dateRange": {
        "start": "2026-06-03",
        "end": "2026-06-19"
      }
    },
    "findings": [],
    "reviews": [
      {
        "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
        "verdict": "fresh",
        "lineReviews": [
          {
            "lineId": "service_1",
            "verdict": "fresh",
            "reason": null,
            "existing": null
          },
          {
            "lineId": "service_2",
            "verdict": "fresh",
            "reason": null,
            "existing": null
          }
        ],
        "findings": []
      },
      {
        "packetId": "packet_5a9174fe0903486386f46327dca356e8",
        "verdict": "fresh",
        "lineReviews": [
          {
            "lineId": "service_1",
            "verdict": "fresh",
            "reason": null,
            "existing": null
          },
          {
            "lineId": "service_2",
            "verdict": "fresh",
            "reason": null,
            "existing": null
          }
        ],
        "findings": []
      }
    ],
    "packets": [
      {
        "id": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
        "clientDisplayName": "Taylor Example",
        "destinationId": "synthetic-eap-portal",
        "recipeId": "synthetic-eap-monthly",
        "period": {
          "start": "2026-06-03",
          "end": "2026-06-10"
        },
        "total": {
          "amount": "250.00",
          "currency": "USD"
        },
        "workflowState": "Imported",
        "findingCounts": {}
      },
      {
        "id": "packet_5a9174fe0903486386f46327dca356e8",
        "clientDisplayName": "Jordan Example",
        "destinationId": "synthetic-eap-portal",
        "recipeId": "synthetic-eap-monthly",
        "period": {
          "start": "2026-06-05",
          "end": "2026-06-19"
        },
        "total": {
          "amount": "360.00",
          "currency": "USD"
        },
        "workflowState": "Imported",
        "findingCounts": {}
      }
    ]
  }
}
```

## Start a workflow run

Request:

```json
{
  "requestId": "r4",
  "op": "startRun",
  "input": {
    "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90"
  }
}
```

Response:

```json
{
  "requestId": "r4",
  "ok": true,
  "output": {
    "run": {
      "runVersion": "1",
      "id": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
      "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
      "recipeId": "synthetic-eap-monthly",
      "recipeRevision": "1",
      "state": "Imported",
      "mode": "Observe",
      "completedSteps": [],
      "overrides": [],
      "evidence": {},
      "startedAt": "2026-07-07T03:43:41.269Z",
      "updatedAt": "2026-07-07T03:43:41.269Z"
    },
    "resumed": false
  }
}
```

## Evaluate the run

Request:

```json
{
  "requestId": "r5",
  "op": "evaluate",
  "input": {
    "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65"
  }
}
```

Response:

```json
{
  "requestId": "r5",
  "ok": true,
  "output": {
    "state": "Imported",
    "mode": "Observe",
    "terminal": false,
    "findings": [],
    "blocking": [],
    "nextStep": {
      "id": "validate-packet",
      "label": "Validate packet",
      "action": "validate_packet",
      "helpTopicId": "action.validate_packet"
    },
    "availableActions": [
      {
        "id": "validate_packet",
        "label": "Validate packet",
        "classification": "read_only",
        "helpTopicId": "action.validate_packet"
      },
      {
        "id": "mark_manual",
        "label": "Handle manually",
        "classification": "human",
        "helpTopicId": "action.mark_manual"
      },
      {
        "id": "record_override",
        "label": "Record override",
        "classification": "human",
        "helpTopicId": "action.record_override"
      },
      {
        "id": "set_assistance_mode",
        "label": "Change assistance mode",
        "classification": "human",
        "helpTopicId": "action.set_assistance_mode"
      },
      {
        "id": "resolve_missing_field",
        "label": "Resolve missing information",
        "classification": "human",
        "helpTopicId": "action.resolve_missing_field"
      }
    ]
  }
}
```

## Act: validate the packet

Request:

```json
{
  "requestId": "r6",
  "op": "act",
  "input": {
    "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
    "action": "validate_packet"
  }
}
```

Response:

```json
{
  "requestId": "r6",
  "ok": true,
  "output": {
    "run": {
      "runVersion": "1",
      "id": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
      "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
      "recipeId": "synthetic-eap-monthly",
      "recipeRevision": "1",
      "state": "PacketValidated",
      "mode": "Observe",
      "completedSteps": [
        {
          "stepId": "validate-packet",
          "action": "validate_packet",
          "at": "2026-07-07T03:43:41.277Z",
          "commandId": null,
          "evidenceDigest": null
        }
      ],
      "overrides": [],
      "evidence": {},
      "startedAt": "2026-07-07T03:43:41.269Z",
      "updatedAt": "2026-07-07T03:43:41.277Z"
    },
    "events": [
      {
        "eventVersion": "1",
        "id": "event_c11d7d87747044189dcc67692f9a2290",
        "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
        "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
        "action": "validate_packet",
        "actor": "operator",
        "at": "2026-07-07T03:43:41.277Z",
        "summary": "Validate packet completed.",
        "details": {
          "target": "PacketValidated",
          "evidence": null
        }
      }
    ],
    "evaluation": {
      "state": "PacketValidated",
      "mode": "Observe",
      "terminal": false,
      "findings": [],
      "blocking": [],
      "nextStep": {
        "id": "generate-artifacts",
        "label": "Generate claim summary",
        "action": "generate_artifacts",
        "helpTopicId": "action.generate_artifacts"
      },
      "availableActions": [
        {
          "id": "generate_artifacts",
          "label": "Generate artifacts",
          "classification": "reversible",
          "helpTopicId": "action.generate_artifacts"
        },
        {
          "id": "validate_packet",
          "label": "Validate packet",
          "classification": "read_only",
          "helpTopicId": "action.validate_packet"
        },
        "... 4 more"
      ]
    }
  }
}
```

## List audit events

Request:

```json
{
  "requestId": "r7",
  "op": "listAuditEvents",
  "input": {
    "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65"
  }
}
```

Response:

```json
{
  "requestId": "r7",
  "ok": true,
  "output": [
    {
      "eventVersion": "1",
      "id": "event_c11d7d87747044189dcc67692f9a2290",
      "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
      "packetId": "packet_b696e1f68d1f4303bfea0ff746aa4c90",
      "action": "validate_packet",
      "actor": "operator",
      "at": "2026-07-07T03:43:41.277Z",
      "summary": "Validate packet completed.",
      "details": {
        "target": "PacketValidated",
        "evidence": null
      },
      "seq": 1
    }
  ]
}
```

## Error shape: unknown op

Request:

```json
{
  "requestId": "r8",
  "op": "definitelyNotAnOp",
  "input": {}
}
```

Response:

```json
{
  "requestId": "r8",
  "ok": false,
  "error": {
    "code": "OP_UNKNOWN",
    "message": "Unknown op \"definitelyNotAnOp\"."
  }
}
```

## Error shape: stable service codes

Request:

```json
{
  "requestId": "r9",
  "op": "act",
  "input": {
    "runId": "run_c0bf4e81e51d4711b87aaa90b8c50a65",
    "action": "not_a_real_action"
  }
}
```

Response:

```json
{
  "requestId": "r9",
  "ok": false,
  "error": {
    "code": "UNKNOWN_ACTION",
    "message": "Unknown action \"not_a_real_action\"."
  }
}
```

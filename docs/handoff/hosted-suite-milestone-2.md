---
title: Hosted Suite Milestone 2 Handoff
created: 2026-05-31
status: draft-template
scope: Vercel, Privy, Gordo/Aeon, Hermes, and x402 work after local contracts pass
tags: [handoff, vercel, privy, x402, aeon, hermes]
---

# Hosted Suite Milestone 2 Handoff

This document is the required bridge from Milestone 1 local CLI contracts to the
hosted suite. It must be refreshed with real smoke outputs before Vercel,
Privy, wallet gating, Gordo/Aeon control-plane work, Hermes writeback, or x402
enforcement starts.

## Entry Gate

Milestone 2 may start only after these Milestone 1 gates pass:

- `HOME="$(mktemp -d)" npm test`
- `npm run build`
- `npm run release:check`
- isolated `FT_DATA_DIR` / `FT_LIBRARY_DIR` CLI smoke for capture, recall,
  packet, soul, Aeon export, Hermes export, and soul export
- Raycast scaffold agreement plus Raycast lint/build on a machine with Raycast
  tooling
- no Milestone 1 commit added `.github/workflows`, `vercel.json`, Next.js app
  files, Privy config, wallet secrets, or x402 enforcement

## Contract Version

- Capture: `fieldtheory.capture.v1`
- Agent brief pack: `agent-brief-pack.v1`
- Export bundle: `fieldtheory.export-bundle.v1`

## Sample AgentBriefPack

This is the expected smoke-fixture shape. Replace it with the actual
`ft recall agent --json` output before M2 implementation.

```json
{
  "id": "pack_smoke",
  "version": "agent-brief-pack.v1",
  "kind": "recall_pack",
  "generatedAt": "2026-05-31T00:00:00.000Z",
  "input": { "query": "agent" },
  "limits": { "captures": 5, "library": 5, "commands": 3, "bookmarks": 8 },
  "storeStatus": [
    { "store": "captures", "status": "available" },
    { "store": "library", "status": "available" },
    { "store": "commands", "status": "available" },
    { "store": "bookmarks", "status": "available" }
  ],
  "summary": "Smoke fixture pack generated from local Field Theory sources.",
  "summaryClaims": [],
  "evidence": [],
  "typedSlots": [],
  "suggestedCommands": [],
  "boundaries": [
    {
      "id": "boundary_local_only",
      "authority": "local-only",
      "gate": "operator-review",
      "rule": "No hosted writes before Milestone 2.",
      "reason": "Milestone 1 proves local contracts only.",
      "forbiddenActions": ["vercel_deploy", "privy_config_write", "x402_enforce"],
      "evidenceIds": []
    }
  ],
  "promotionCandidates": [],
  "resultEnvelope": {
    "status": "partial",
    "resultCount": 0,
    "warnings": ["Template sample, not runtime output. M2 entry requires real smoke output."],
    "generatedBy": "fieldtheory"
  }
}
```

## Sample Export Manifest

This is the expected manifest shape. Replace it with the actual
`fieldtheory/exports/<run-id>/manifest.json` from Aeon and Hermes smoke before
M2 implementation.

```json
{
  "version": "fieldtheory.export-bundle.v1",
  "target": "aeon",
  "createdAt": "2026-05-31T00:00:00.000Z",
  "contractVersions": {
    "capture": "fieldtheory.capture.v1",
    "agentBriefPack": "agent-brief-pack.v1"
  },
  "files": [
    "fieldtheory/exports/run-smoke/brief.json",
    "fieldtheory/exports/run-smoke/brief.md",
    "fieldtheory/exports/run-smoke/reports/export-report.json"
  ],
  "forbiddenActions": [
    "create_repo",
    "write_github_secret",
    "dispatch_workflow",
    "vercel_deploy"
  ],
  "resultEnvelope": {
    "status": "partial",
    "warnings": ["Template sample, not runtime output. M2 entry requires real export smoke output."]
  }
}
```

## Forbidden Writes

Milestone 2 workers must not assume Milestone 1 produced any of these:

- deployed Vercel project
- `.github/workflows` production deploy workflow
- Privy app config
- GitHub OAuth app credentials
- Base EVM or Solana wallet secrets
- x402 payment enforcement
- live Hermes Kanban mutation
- GBrain or wiki canon writes from Field Theory commands

## Privy Assumptions

The hosted suite may plan for:

- GitHub login
- Base EVM wallet login
- Solana wallet login
- account linking between GitHub and wallet identities

No Privy SDK code, app IDs, secrets, webhook URLs, or production auth policies
exist in Milestone 1.

## x402 Status

x402 is architecture-only at this handoff stage. The later x402 swarm should
design payment-gated endpoints around stable Field Theory contracts and must
not add enforcement until the hosted app, auth model, endpoint inventory, and
replay/audit strategy are approved.

## First Hosted Work Items

1. Read the real `agent-brief-pack.v1` JSON from the M1 smoke output.
2. Read the real Aeon/Hermes export manifests.
3. Design the Vercel API as a thin consumer of those contracts.
4. Add Privy auth only after endpoint boundaries are mapped.
5. Draft x402 endpoint architecture before writing payment enforcement code.

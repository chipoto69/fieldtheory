---
title: Hosted Suite Milestone 2 Handoff
created: 2026-05-31
status: milestone-1-smoke-ready
scope: Vercel, Privy, Gordo/Aeon, Hermes, and x402 work after local contracts pass
tags: [handoff, vercel, privy, x402, aeon, hermes]
---

# Hosted Suite Milestone 2 Handoff

This document is the required bridge from Milestone 1 local CLI contracts to the
hosted suite. The examples below come from the isolated Milestone 1 smoke path:
capture, recall, bookmark packet, soul draft, Aeon export, Hermes export, and
soul export.

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
- Export bundle: `fieldtheory.agent-export.v1`

## Sample AgentBriefPack

Compact output from `ft recall agent --json` after seeding one soul capture and
one bookmark fixture:

```json
{
  "id": "recall_3781d7834051a8e1",
  "version": "agent-brief-pack.v1",
  "kind": "recall_pack",
  "input": { "query": "agent" },
  "storeStatus": [
    { "store": "captures", "status": "available" },
    { "store": "library", "status": "empty" },
    { "store": "commands", "status": "empty" },
    { "store": "bookmarks", "status": "available" }
  ],
  "evidence": [
    {
      "id": "capture:cap_20260531_201512_prefer_source_backed_agent_work",
      "sourceType": "capture",
      "locator": "Captures/2026-05-31-201512-prefer-source-backed-agent-work.md",
      "rank": 1
    },
    {
      "id": "bookmark:bm_test",
      "sourceType": "bookmark",
      "locator": "https://x.com/test/status/1",
      "rank": 2
    }
  ],
  "boundaries": [
    {
      "authority": "local-only",
      "gate": "Milestone 1 local contract",
      "forbiddenActions": ["write_wiki", "write_gbrain", "network_export", "create_repo"]
    }
  ],
  "resultEnvelope": {
    "status": "complete",
    "resultCount": 2,
    "warnings": [],
    "generatedBy": "fieldtheory"
  }
}
```

## Sample Export Manifest

Compact output from the Aeon smoke export manifest:

```json
{
  "version": "fieldtheory.agent-export.v1",
  "target": "aeon",
  "runId": "aeon-20260531T201513Z",
  "contracts": { "brief": "agent-brief-pack.v1", "capture": "fieldtheory.capture.v1" },
  "files": [
    "fieldtheory/exports/aeon-20260531T201513Z/brief.json",
    "fieldtheory/exports/aeon-20260531T201513Z/brief.md",
    "fieldtheory/exports/aeon-20260531T201513Z/packets/aeon-bookmark-07db95563579.json",
    "fieldtheory/exports/aeon-20260531T201513Z/packets/aeon-bookmark-07db95563579.md",
    "fieldtheory/exports/aeon-20260531T201513Z/sources/source-index.json",
    "fieldtheory/exports/aeon-20260531T201513Z/reports/export-report.json",
    "fieldtheory/exports/aeon-20260531T201513Z/aeon/aeon.yml.draft",
    "soul/SOUL.md",
    "soul/STYLE.md",
    "soul/MEMORY.md",
    "soul/examples/good-outputs.md",
    "soul/data/source-index.json",
    "fieldtheory/exports/aeon-20260531T201513Z/manifest.json"
  ],
  "forbiddenWrites": [
    "create_repo",
    "push_remote",
    "write_github_secret",
    "dispatch_workflow",
    "write_root_aeon_yml",
    "write_github_workflow",
    "network_call"
  ],
  "resultEnvelope": {
    "status": "complete",
    "resultCount": 4,
    "warnings": ["whySavedStatus remains unknown because no explicit saved-intent evidence was found."],
    "generatedBy": "fieldtheory"
  }
}
```

Hermes smoke uses the same export contract and writes only under
`fieldtheory/exports/<run-id>/`, including `hermes/task-payload.dry-run.json`,
`hermes/profile-handoff.md`, and `hermes/result-envelope.json`.

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
- Vercel deploy calls, Privy config writes, and x402 enforcement from Milestone
  1 commands

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

## M2 Entry Gate

Hosted work starts only after Milestone 1 release checks stay green on the final
release branch: isolated `npm test`, `npm run build`, `npm run release:check`,
full CLI smoke, Raycast scaffold agreement, and Raycast lint/build where the
Raycast toolchain is available.

---
title: Hosted Suite Milestone 2 Handoff
created: 2026-05-31
status: milestone-2-scaffold-started
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
- Raycast scaffold agreement plus Raycast lint/build
- no Milestone 1 commit added `.github/workflows`, `vercel.json`, Next.js app
  files, Privy config, wallet secrets, or x402 enforcement

## Contract Version

- Capture: `fieldtheory.capture.v1`
- Agent brief pack: `agent-brief-pack.v1`
- Export bundle: `fieldtheory.agent-export.v1`

## Reproducible Smoke Outputs

Run the full script in `docs/setup/capture-first-environment.md` before handing
this repo to hosted-suite agents. It writes these files under `$tmp`:

```text
capture.json
recall.json
packet-aeon.json
packet-hermes.md
packet-content-os.json
soul-draft.json
export-aeon.json
export-hermes.json
export-soul.json
aeon-repo/fieldtheory/exports/<run-id>/manifest.json
hermes-export/fieldtheory/exports/<run-id>/manifest.json
soul-export/manifest.json
```

Hosted agents should use the JSON files from that smoke run as contract
fixtures. This PR does not commit local smoke outputs because they are generated
from operator-local stores.

## Hosted Scaffold Status

The first Milestone 2 scaffold now exists under `apps/portal`:

- Next.js App Router dashboard shell.
- Public `/api/health`, `/api/contracts`, and `/api/x402/discovery` routes.
- Fail-closed protected routes for brief/export validation, agent target list,
  dry-run run creation/status, Gordo/Aeon import plans, and Hermes import plans.
- In-memory local/test adapter plus `DATABASE_URL` Postgres adapter for imports,
  runs, and audit events.
- `npm --prefix apps/portal run db:migrate` creates schema version `1`; production
  checks that marker and fails closed instead of auto-creating tables.
- Preview and production GitHub Actions workflow skeletons that deploy only when
  Vercel secrets are configured.
- Server-side Privy access-token verification through `@privy-io/node`; unsigned
  development tokens are local/test only and disabled in production.
- Browser-side Privy provider/login controls through `@privy-io/react-auth`, plus
  an authenticated workbench for paste-to-validate imports and dry-run creation.
- Sanitized export import summaries that preserve target, run id, run-scoped
  relative paths, hashes, forbidden writes, and result-envelope status/counts
  without storing absolute source paths, warning text, or raw details.
- Owner-scoped artifact import IDs prevent two users importing the same contract
  payload from overwriting each other's ownership.

The scaffold intentionally keeps linked GitHub/Base/Solana identity policy
deferred. The current server boundary fails closed when `PRIVY_APP_SECRET` is
absent and only accepts unsigned `Bearer dev:<id>` tokens when
`PRIVY_DEV_ALLOW_UNSIGNED=true`, for tests and local smoke only.

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
    {
      "relPath": "fieldtheory/exports/aeon-20260531T201513Z/brief.json",
      "sha256": "..."
    },
    {
      "relPath": "fieldtheory/exports/aeon-20260531T201513Z/aeon/aeon.yml.draft",
      "sha256": "..."
    },
    {
      "relPath": "fieldtheory/exports/aeon-20260531T201513Z/soul/SOUL.md",
      "sha256": "..."
    }
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

The returned CLI result includes `manifest.json` in `files`; the persisted
manifest's own `files` array lists payload files and deliberately excludes the
manifest file itself so the manifest hash does not become self-referential.

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

Browser-side Privy SDK code and an env-gated server-side linked identity policy
now exist in the Milestone 2 scaffold. Production Privy app IDs, secrets,
webhook URLs, dashboard policy, and operator-owned GitHub/Base/Solana values
are still not committed.

## x402 Status

x402 is architecture-only at this handoff stage. The later x402 swarm should
design payment-gated endpoints around stable Field Theory contracts and must
not add enforcement until the hosted app, auth model, endpoint inventory, and
replay/audit strategy are approved.

## Next Hosted Work Items

1. Read the real `agent-brief-pack.v1` JSON from the M1 smoke output.
2. Read the real Aeon/Hermes export manifests.
3. Extend the current portal as a thin consumer of those contracts.
4. Add server-side linked GitHub/Base/Solana identity policies after the browser
   Privy login and server verification boundaries stay green.
5. Add backup/restore and migration-version gates before declaring the durable
   store production-complete.
6. Draft x402 endpoint architecture before writing payment enforcement code.

## M2 Entry Gate

Hosted work starts only after Milestone 1 release checks stay green on the final
release branch: isolated `npm test`, `npm run build`, `npm run release:check`,
full CLI smoke, Raycast scaffold agreement, and Raycast lint/build where the
Raycast toolchain is available.

## Hosted Planning Artifacts

Before extending the hosted implementation, use these M2 implementation
contracts:

- PRD: `docs/prd/hosted-agentic-suite.md`
- Architecture: `docs/architecture/hosted-agentic-suite.md`
- Environment runbook: `docs/setup/hosted-suite-environment.md`
- Engineering review: `docs/reviews/2026-05-31-hosted-suite-eng-review.md`
- Endpoint contract: `docs/api/hosted-suite-endpoints.md`
- Data model: `docs/data/hosted-suite-data-model.md`
- Threat model: `docs/security/hosted-suite-threat-model.md`
- Deployment plan: `docs/deploy/vercel-github-actions.md`
- Release readiness: `docs/release/milestone-2-hosted-readiness.md`

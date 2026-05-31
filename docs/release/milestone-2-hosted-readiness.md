---
title: Milestone 2 Hosted Readiness Checklist
created: 2026-05-31
status: draft-implementation-contract
scope: readiness gate before Vercel, Privy, agents, and x402 implementation
tags: [release, readiness, vercel, privy, agents]
---

# Milestone 2 Hosted Readiness Checklist

## Start Conditions

- Branch is not `main`.
- Milestone 1 local gates remain green.
- PR is draft until hosted implementation has its own gates.
- Hosted PRD, architecture, endpoint contract, data model, threat model, and
  environment runbook are present.

## Required Artifacts

| Artifact | Status |
|---|---|
| `docs/prd/hosted-agentic-suite.md` | required before portal code |
| `docs/architecture/hosted-agentic-suite.md` | required before portal code |
| `docs/api/hosted-suite-endpoints.md` | required before route handlers |
| `docs/data/hosted-suite-data-model.md` | required before persistence |
| `docs/security/hosted-suite-threat-model.md` | required before auth/x402 |
| `docs/setup/hosted-suite-environment.md` | required before env/secrets |
| `docs/deploy/vercel-github-actions.md` | required before workflows |
| `apps/portal` | initial scaffold present |
| `.github/workflows/vercel-preview.yml` | initial scaffold present |
| `.github/workflows/vercel-production.yml` | guarded production workflow present; protected-main only, fails without Vercel secrets, and runs a Postgres schema gate |

## Implementation Order

1. Add `apps/portal` as a Next.js App Router app with health/contracts routes. Done.
2. Add shared contract validators for brief/export inputs. Done in portal scaffold.
3. Add local fixture smoke for M1 generated artifacts. Done with portal route fixtures; generated CLI smoke fixtures still pending.
4. Add read-only dashboard and import validation UI. Dashboard shell done; upload UI pending.
5. Add Privy auth boundary and fail-closed authenticated route checks. Server access-token verification done; browser SDK login deferred to wallet-linking gate.
6. Add dry-run agent run creation and audit records. Done with local memory adapter and `DATABASE_URL` Postgres adapter using sanitized export metadata.
7. Add Gordo/Aeon import-plan adapter. Done as dry-run plan with target/file checks.
8. Add Hermes import-plan adapter. Done as dry-run plan with target/file checks.
9. Add preview GitHub Action. Done; deploy step skips without secrets.
10. Add production GitHub Action after preview and portal gates pass. Done as protected-main workflow; deploy fails fast without secrets.
11. Add durable store migration gate. Done with `db:migrate` and GitHub Actions Postgres service.
12. Draft x402 endpoint handoff and fixtures.
13. Enable x402 enforcement in a later gate only.

## Validation Matrix

| Surface | Gate |
|---|---|
| CLI contracts | `HOME="$(mktemp -d)" npm test` |
| CLI build | `npm run build` |
| Package | `npm run release:check` |
| Raycast | `npm --prefix raycast/fieldtheory run lint && npm --prefix raycast/fieldtheory run build` |
| Portal | `npm run verify:hosted` |
| Portal DB schema | `DATABASE_URL=postgres://... npm --prefix apps/portal run db:migrate` |
| E2E | Playwright or route smoke for health/contracts/auth failure/import validation |
| Deploy | Vercel preview and production workflows with post-deploy smoke |

## Stop Conditions

- Any endpoint lacks an auth class.
- Any adapter can write to GitHub, Hermes, GBrain, wiki, Vercel, or payment
  settlement state without an apply gate.
- Privy secrets or wallet material are stored in captures, briefs, logs, or
  export files.
- x402 enforcement code appears before the x402 handoff is approved.
- Production deploy workflow targets a non-protected branch.
- Production mutation routes can use in-memory storage when `DATABASE_URL` is
  absent.
- Production durable store schema is missing the `fieldtheory_schema_version`
  marker.

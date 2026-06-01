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
| `.github/workflows/vercel-production.yml` | guarded production workflow present; protected-main only, fails without Vercel/Privy/DB secrets, keeps x402 disabled, runs CI plus target Postgres schema gates, and smokes public production endpoints after deploy |

## Implementation Order

1. Add `apps/portal` as a Next.js App Router app with health/contracts routes. Done.
2. Add shared contract validators for brief/export inputs. Done in portal scaffold.
3. Add local fixture smoke for M1 generated artifacts. Done with portal route fixtures; generated CLI smoke fixtures still pending.
4. Add read-only dashboard and import validation UI. Dashboard shell done; upload UI pending.
5. Add Privy auth boundary and fail-closed authenticated route checks. Server access-token verification done; browser SDK login deferred to wallet-linking gate.
6. Add dry-run agent run creation and audit records. Done with local memory adapter and `DATABASE_URL` Postgres adapter using sanitized export metadata.
7. Add Gordo/Aeon import-plan adapter. Done as dry-run plan with target/file checks.
8. Add Hermes import-plan adapter. Done as dry-run plan with target/file checks.
9. Add preview GitHub Action. Done; deploy step skips without secrets and emits an explicit skipped-deploy notice.
10. Add production GitHub Action after preview and portal gates pass. Done as protected-main workflow; deploy fails fast without Vercel, Privy, database, and x402-disable configuration.
11. Add durable store migration gate. Done with `db:migrate`, GitHub Actions Postgres service, DB route smoke, target production `DATABASE_URL` migration, and public post-deploy smoke.
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

## Release Candidate Evidence

Do not move this PR out of draft until the release candidate has current
evidence for each item below:

| Evidence | Command |
|---|---|
| Live PR checks are green | `gh pr checks 1` |
| Failed workflow diagnosis, if any check is red | `gh run view <run-id> --log-failed` |
| Local root test under runner-compatible shell | `bash -lc 'HOME="$(mktemp -d)" npm test'` |
| Root build | `npm run build` |
| Release package | `npm run release:check` |
| Raycast | `npm --prefix raycast/fieldtheory ci && npm --prefix raycast/fieldtheory run lint && npm --prefix raycast/fieldtheory run build` |
| Portal dependency install | `npm --prefix apps/portal ci` |
| Portal DB schema | `DATABASE_URL="postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory_portal_ci" npm --prefix apps/portal run db:migrate` |
| Portal DB route smoke | `DATABASE_URL="postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory_portal_ci" npm run portal:test:db` |
| Portal tests/build | `npm run verify:hosted` |
| Diff hygiene | `git diff --check` |
| Production secret preflight | `gh secret list --env production --repo chipoto69/fieldtheory` must include Vercel, Privy, and `DATABASE_URL`; `X402_ENABLED` must be unset or `false` |
| Target production DB migration | protected `vercel-production` workflow step `Migrate target production database` |
| Vercel production public smoke | protected `vercel-production` workflow step `Smoke production public endpoints` |
| Vercel preview smoke | `curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/health" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/contracts" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/x402/discovery"` |
| Durable DB proof | `psql "$DATABASE_URL" -c "select * from fieldtheory_schema_version;"` |

Fill this ledger before undrafting or promoting a production deployment:

| Field | Evidence |
|---|---|
| PR check run URL |  |
| Preview URL |  |
| Production URL |  |
| Vercel project id |  |
| GitHub production environment exists |  |
| Required GitHub production secrets present |  |
| Privy app id and redirect URLs |  |
| Base EVM policy owner |  |
| Solana policy owner |  |
| Target database provider and owner |  |
| `fieldtheory_schema_version` output |  |
| Post-deploy `/api/health` output |  |
| Post-deploy `/api/contracts` output |  |
| Post-deploy `/api/x402/discovery` output |  |
| Post-deploy authenticated mutation failure/success evidence |  |
| Rollback deployment id |  |
| Wiki log entry |  |
| GBrain timeline entry, if project page exists |  |

Rollback remains a release gate: the operator must identify the Vercel
deployment to promote or roll back before production deploy is considered
ready.

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

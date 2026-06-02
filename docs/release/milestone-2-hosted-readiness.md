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
4. Add read-only dashboard and import validation UI. Done with an authenticated workbench, built-in valid example payloads, live readiness/identity status, dry-run create action, recent run history, selected run detail, and dev-only local operator mode for no-secret browser smoke.
5. Add Privy auth boundary and fail-closed authenticated route checks. Server access-token verification, browser Privy provider/login controls, dev-only local browser operator mode, and env-gated linked GitHub/Base/Solana policy checks are scaffolded; production policy ownership remains incomplete.
6. Add dry-run agent run creation, owner-scoped run index/detail audit readback, and audit records. Done with local memory adapter and `DATABASE_URL` Postgres adapter using sanitized export metadata.
7. Add Gordo/Aeon import-plan adapter. Done as dry-run plan with target/file checks.
8. Add Hermes import-plan adapter. Done as dry-run plan with target/file checks.
9. Add preview GitHub Action. Done; deploy step skips without secrets and emits an explicit skipped-deploy notice.
10. Add production GitHub Action after preview and portal gates pass. Done as protected-main workflow; deploy fails fast without Vercel, Privy, database, and x402-disable configuration.
11. Add durable store migration gate. Done with `db:migrate`, GitHub Actions Postgres service, DB route smoke, target production `DATABASE_URL` migration, and public post-deploy smoke.
12. Draft x402 endpoint handoff and fixtures. Done with
    `docs/handoff/x402-milestone-3.md`,
    `apps/portal/src/lib/x402-discovery.v1.json`,
    `apps/portal/tests/fixtures/x402-discovery.v1.json`, and
    `apps/portal/tests/fixtures/x402-audit-events.v1.json`.
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
| x402 handoff fixtures | `npm --prefix apps/portal test -- --test-name-pattern "x402"` |
| Local browser workbench smoke | Run the portal with `NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR=true` plus server-side `PRIVY_DEV_ALLOW_UNSIGNED=true`, then refresh status, load a built-in example, validate it, create a dry-run run, refresh recent runs, and inspect the selected run from the browser |
| Diff hygiene | `git diff --check` |
| Hosted deploy readiness auditor | `npm run hosted:check-readiness -- --remote --strict --json` |
| GitHub production environment bootstrap | `npm run hosted:setup-github-env -- --repo chipoto69/fieldtheory --apply --allow-missing-secrets --protect-main` |
| Production secret preflight | `gh secret list --env production --repo chipoto69/fieldtheory` must include Vercel, Privy, and `DATABASE_URL`; GitHub production variable `X402_ENABLED` must be explicitly `false` |
| Main branch protection | `gh api repos/chipoto69/fieldtheory/branches/main --jq '{name, protected}'` and branch protection detail must show required `preview`, no force pushes/deletions, linear history, conversation resolution, and admin enforcement |
| Target production DB migration | protected `vercel-production` workflow step `Migrate target production database` |
| Vercel production public smoke | protected `vercel-production` workflow step `Smoke production public endpoints` must require `configuration_ready`, auth/store readiness, disabled x402, and unauthenticated `/api/agents` returning `401` |
| Vercel preview smoke | `curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/health" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/contracts" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/x402/discovery"` |
| Durable DB proof | `psql "$DATABASE_URL" -c "select * from fieldtheory_schema_version;"` |

Fill this ledger before undrafting or promoting a production deployment:

| Field | Evidence |
|---|---|
| PR check run URL | verified 2026-06-01: `preview` passed at `https://github.com/chipoto69/fieldtheory/actions/runs/26736315929/job/78790187366`; Vercel preview deploy step skipped because `VERCEL_*` secrets are absent |
| Preview URL | blocked 2026-06-01: no Vercel preview URL because `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are absent |
| Production URL | blocked 2026-06-01: production deploy remains disabled until Vercel, Privy, and `DATABASE_URL` secrets plus target DB proof exist |
| Vercel project id | missing 2026-06-01: no linked `.vercel` project metadata or GitHub `VERCEL_PROJECT_ID` secret |
| GitHub production environment exists | verified 2026-06-01 with `environment_exists=true` |
| GitHub production deployment branch policy | verified 2026-06-01: custom branch policy `main` |
| GitHub production `X402_ENABLED` variable | drift detected 2026-06-02: readiness auditor reports `X402_ENABLED` unset; `gh` token is invalid, so non-secret bootstrap could not be reapplied in this run |
| Main branch protection | drift detected 2026-06-02: branch is protected, but readiness auditor reports required `preview` status check missing |
| Required GitHub production secrets present | missing 2026-06-01: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DATABASE_URL`, `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`; optional `PRIVY_JWT_VERIFICATION_KEY` missing |
| Privy app id and redirect URLs | blocked 2026-06-01: production Privy app and redirect URL evidence are not populated |
| Linked identity policy mode | scaffolded 2026-06-01: `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true` requires GitHub OAuth, configured Base EVM chain id, and Solana identity before protected write routes; production env var not set yet |
| Base EVM policy owner | missing 2026-06-01: owner must choose `FIELD_THEORY_BASE_CHAIN_ID` / `NEXT_PUBLIC_BASE_CHAIN_ID` before production |
| Solana policy owner | missing 2026-06-01: owner must choose `FIELD_THEORY_SOLANA_CLUSTER` / `NEXT_PUBLIC_SOLANA_CLUSTER` before production |
| x402 handoff fixtures | recorded 2026-06-01: non-enforcing discovery and audit fixtures added; `/api/x402/discovery` mirrors the fixture and `X402_ENABLED=false` remains required |
| Hosted deploy readiness auditor | checked 2026-06-02: local artifacts/scripts, GitHub production environment, main deployment branch policy, and branch protection pass; blocked on missing `apps/portal/.vercel/project.json`, missing required `preview` status check, missing required GitHub production secret names, and unset `X402_ENABLED` |
| Target database provider and owner | blocked 2026-06-01: provider not selected and `DATABASE_URL` secret absent |
| `fieldtheory_schema_version` output | blocked 2026-06-01: target production database not configured |
| Post-deploy `/api/health` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy `/api/contracts` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy `/api/x402/discovery` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy unauthenticated `/api/agents` status | blocked 2026-06-01: no production deployment URL |
| Post-deploy authenticated mutation failure/success evidence | blocked 2026-06-01: no production deployment URL, Privy app config, or target database |
| Backup/restore drill | blocked 2026-06-02: target database provider is not selected, so backup and restore evidence cannot exist yet |
| Migration version policy | blocked 2026-06-02: schema v1 exists; migration-forward and rollback policy beyond v1 is not approved |
| Audit retention policy | blocked 2026-06-02: append-only audit storage exists; retention period is not approved |
| Rollback deployment reference | blocked 2026-06-01: no Vercel deployment has been created; production workflow will capture the deployment URL as rollback reference |
| Wiki log entry | recorded 2026-06-01 in `/Users/rudlord/wiki/log.md` for commit `e2330be`; later product increments require their own closeout lines |
| GBrain timeline entry, if project page exists | attempted 2026-06-01: `fieldtheory` timeline write returned `status: ok`; subsequent query returned no page results |

Rollback remains a release gate: the operator must identify the Vercel
deployment to promote or roll back before production deploy is considered
ready.

The readiness auditor output contract is
`fieldtheory.hosted-deploy-readiness.v1`. It reports `status`, `checks`,
`blockers`, and `warnings` and must list secret names only, never secret values.
It treats missing or true `X402_ENABLED` as blocked; production readiness
requires the explicit `false` policy.

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

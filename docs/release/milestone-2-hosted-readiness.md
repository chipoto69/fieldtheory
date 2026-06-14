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
4. Add read-only dashboard and import validation UI. Done with an authenticated workbench, built-in valid example payloads, live readiness/identity status, sanitized import readback, dry-run create action, recent run history, selected run detail, and dev-only local operator mode for no-secret browser smoke.
5. Add Privy auth boundary and fail-closed authenticated route checks. Server access-token verification, browser Privy provider/login controls, dev-only local browser operator mode, and env-gated linked GitHub/Base/Solana policy checks are scaffolded; production policy ownership remains incomplete.
6. Add dry-run agent run creation, owner-scoped import/run audit readback, and audit records. Done with local memory adapter and `DATABASE_URL` Postgres adapter using sanitized export metadata.
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
| Production secret and variable preflight | `gh secret list --env production --repo chipoto69/fieldtheory` must include Vercel, Privy, and `DATABASE_URL`; GitHub production variables must include `X402_ENABLED=false`, `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`, Base mainnet `8453`, and Solana `mainnet-beta` plus browser mirrors |
| Main branch protection | `gh api repos/chipoto69/fieldtheory/branches/main --jq '{name, protected}'` and branch protection detail must show required `preview`, no force pushes/deletions, linear history, conversation resolution, and admin enforcement |
| Target production DB migration | protected `vercel-production` workflow step `Migrate target production database` |
| Vercel production public smoke | protected `vercel-production` workflow step `Smoke production public endpoints` must require `configuration_ready`, auth/store readiness, disabled x402, and unauthenticated `/api/agents` returning `401` |
| Vercel preview smoke | `curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/health" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/contracts" && curl -fsS "$FIELD_THEORY_PREVIEW_URL/api/x402/discovery"` |
| Durable DB proof | `psql "$DATABASE_URL" -c "select * from fieldtheory_schema_version;"` |

Fill this ledger before undrafting or promoting a production deployment:

| Field | Evidence |
|---|---|
| PR check run URL | verified 2026-06-14: `preview` passed at `https://github.com/chipoto69/fieldtheory/actions/runs/26915107441/job/79402801233`; CodeRabbit reports `pass` / review skipped |
| Preview URL | blocked 2026-06-14: preview workflow passed, but production-owned Vercel token and runtime secrets are still absent, so no release preview URL is recorded in this ledger |
| Production URL | blocked 2026-06-14: production deploy remains disabled until Vercel token, Privy, `DATABASE_URL`, target DB proof, and production smoke evidence exist |
| Vercel project id | verified 2026-06-14: `apps/portal/.vercel/project.json` is present locally after linking to `grrrrrrrrs-projects/fieldtheory`; `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are set as GitHub production secrets |
| GitHub production environment exists | verified 2026-06-14 with readiness auditor: production environment exists |
| GitHub production deployment branch policy | verified 2026-06-14 with readiness auditor: deployment branch policy is `main` |
| GitHub production `X402_ENABLED` variable | verified 2026-06-14 with readiness auditor: `X402_ENABLED=false` |
| Main branch protection | verified 2026-06-14 with readiness auditor: main is protected and required status checks include `preview` |
| Required GitHub production secrets present | missing 2026-06-14: `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`; optional `PRIVY_JWT_VERIFICATION_KEY` missing |
| Privy app id and redirect URLs | blocked 2026-06-01: production Privy app and redirect URL evidence are not populated |
| Linked identity policy mode | verified 2026-06-14 with setup script and readiness auditor: `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true` so protected hosted writes require linked GitHub, Base EVM, and Solana identities |
| Base EVM policy owner | verified 2026-06-14 with setup script and readiness auditor: `FIELD_THEORY_BASE_CHAIN_ID=8453` and `NEXT_PUBLIC_BASE_CHAIN_ID=8453` for production Base mainnet policy |
| Solana policy owner | verified 2026-06-14 with setup script and readiness auditor: `FIELD_THEORY_SOLANA_CLUSTER=mainnet-beta` and `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` for production Solana policy |
| x402 handoff fixtures | recorded 2026-06-01: non-enforcing discovery and audit fixtures added; `/api/x402/discovery` mirrors the fixture and `X402_ENABLED=false` remains required |
| Hosted deploy readiness auditor | checked 2026-06-14: local artifacts/scripts, Vercel project metadata, GitHub production environment, main deployment branch policy, branch protection, required `preview` check, `X402_ENABLED=false`, and linked GitHub/Base/Solana production variables pass; blocked on missing required production secret names `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, and `PRIVY_APP_SECRET` |
| Target database provider and owner | blocked 2026-06-01: provider not selected and `DATABASE_URL` secret absent |
| `fieldtheory_schema_version` output | blocked 2026-06-01: target production database not configured |
| Post-deploy `/api/health` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy `/api/contracts` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy `/api/x402/discovery` output | blocked 2026-06-01: no production deployment URL |
| Post-deploy unauthenticated `/api/agents` status | blocked 2026-06-01: no production deployment URL |
| Post-deploy authenticated mutation failure/success evidence | blocked 2026-06-01: no production deployment URL, Privy app config, or target database |
| Backup/restore drill | blocked 2026-06-02: target database provider is not selected, so backup and restore evidence cannot exist yet |
| Migration version policy | partial 2026-06-14: schema v2 adds owner-scoped run idempotency; migration-forward script exists, but rollback and backup/restore policy are not approved |
| Audit retention policy | blocked 2026-06-02: append-only audit storage exists; retention period is not approved |
| Rollback deployment reference | blocked 2026-06-01: no Vercel deployment has been created; production workflow will capture the deployment URL as rollback reference |
| Wiki log entry | recorded 2026-06-01 in `/Users/rudlord/wiki/log.md` for commit `e2330be`; later product increments require their own closeout lines |
| GBrain timeline entry, if project page exists | attempted 2026-06-01: `fieldtheory` timeline write returned `status: ok`; subsequent query returned no page results |

Rollback remains a release gate: the operator must identify the Vercel
deployment to promote or roll back before production deploy is considered
ready.

The readiness auditor output contract is
`fieldtheory.hosted-deploy-readiness.v1`. It reports `status`, `checks`,
`blockers`, `warnings`, and `operatorActions` and must list secret names only,
never secret values. `operatorActions[]` is the operator handoff plan for the
next authenticated run: link Vercel, apply non-secret GitHub environment state,
set missing GitHub production secrets, restore required status checks, set
`X402_ENABLED=false`, and set the linked GitHub/Base/Solana identity policy
variables. It treats missing or true `X402_ENABLED` as blocked; production
readiness requires the explicit `false` policy. It also treats missing,
deferred, or mismatched linked-identity policy variables as blocked.

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

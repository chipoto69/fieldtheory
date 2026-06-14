---
title: Vercel GitHub Actions Deployment Plan
created: 2026-05-31
status: draft-implementation-contract
scope: preview and production workflows for hosted Field Theory suite
tags: [deploy, vercel, github-actions, ci]
---

# Vercel GitHub Actions Deployment Plan

## Rule

Production deployment automation may exist only as a protected `main` workflow.
Production must deploy from protected `main`, never directly from `codex/*`
branches. Preview deploy steps may skip safely when Vercel secrets are absent.
Production deploy must fail fast when required Vercel, Privy, and database
secrets are absent.

## Required Secrets

Create the non-secret environment scaffold first:

```bash
npm run hosted:setup-github-env -- --repo chipoto69/fieldtheory --apply --allow-missing-secrets --protect-main
npm run hosted:check-readiness -- --remote --strict
```

The command creates the GitHub `production` environment, restricts deployments
to `main`, protects `main` with the required `preview` check, sets
`X402_ENABLED=false`, sets the non-secret linked GitHub/Base/Solana production
policy variables, and reports missing secrets without storing any secret values.
The readiness auditor also emits secret-safe `operatorActions[]` with the exact
follow-up commands for the authenticated operator; those actions name required
secret keys but never include secret values.

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | Authenticates Vercel CLI in GitHub Actions. |
| `VERCEL_ORG_ID` | Selects Vercel account/team. |
| `VERCEL_PROJECT_ID` | Selects hosted Field Theory project. |
| `PRIVY_APP_ID` | Server Privy app id used by route handlers. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Browser Privy app id. |
| `PRIVY_APP_SECRET` | Server-side Privy verification. |
| `PRIVY_JWT_VERIFICATION_KEY` | Optional Privy verification key to avoid a runtime key fetch. |
| `DATABASE_URL` | Postgres durable store used by hosted mutation routes. |
| `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN` | Optional Privy bearer token for authenticated production import/run/readback smoke. When absent, the smoke step emits a skip notice instead of failing deployment. |

| Variable | Purpose |
|---|---|
| `X402_ENABLED` | GitHub environment variable. Must be explicitly `false` until x402 enforcement is implemented. |
| `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES` | GitHub environment variable. Must be `true` for production so protected writes require linked GitHub, Base EVM, and Solana identities. |
| `FIELD_THEORY_BASE_CHAIN_ID` | GitHub environment variable. Must be `8453` for production Base mainnet policy. |
| `NEXT_PUBLIC_BASE_CHAIN_ID` | GitHub environment variable. Browser mirror; must match `FIELD_THEORY_BASE_CHAIN_ID`. |
| `FIELD_THEORY_SOLANA_CLUSTER` | GitHub environment variable. Must be `mainnet-beta` for production Solana policy. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | GitHub environment variable. Browser mirror; must match `FIELD_THEORY_SOLANA_CLUSTER`. |

## Preview Workflow Shape

```yaml
name: vercel-preview
on:
  pull_request:
  workflow_dispatch:
jobs:
  preview:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: fieldtheory
          POSTGRES_PASSWORD: fieldtheory
          POSTGRES_DB: fieldtheory_portal_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U fieldtheory -d fieldtheory_portal_ci"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      VERCEL_CLI_VERSION: 54.6.1
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: |
            package-lock.json
            raycast/fieldtheory/package-lock.json
            apps/portal/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: HOME="$(mktemp -d)" npm test
      - run: npm run release:check
      - run: git diff --check
      - run: npm --prefix raycast/fieldtheory ci
      - run: npm --prefix raycast/fieldtheory run lint
      - run: npm --prefix raycast/fieldtheory run build
      - run: npm --prefix apps/portal ci
      - run: DATABASE_URL="postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory_portal_ci" npm --prefix apps/portal run db:migrate
      - run: DATABASE_URL="postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory_portal_ci" npm run portal:test:db
      - run: npm run verify:hosted
      - name: Report skipped Vercel preview deploy
        if: ${{ env.VERCEL_TOKEN == '' || env.VERCEL_ORG_ID == '' || env.VERCEL_PROJECT_ID == '' }}
        run: echo "::notice::Vercel preview deploy skipped because VERCEL_* secrets are not configured."
      - run: npm install --global vercel@54.6.1
        if: ${{ env.VERCEL_TOKEN != '' && env.VERCEL_ORG_ID != '' && env.VERCEL_PROJECT_ID != '' }}
      - run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
        if: ${{ env.VERCEL_TOKEN != '' && env.VERCEL_ORG_ID != '' && env.VERCEL_PROJECT_ID != '' }}
        working-directory: apps/portal
      - run: vercel build --token=${{ secrets.VERCEL_TOKEN }}
        if: ${{ env.VERCEL_TOKEN != '' && env.VERCEL_ORG_ID != '' && env.VERCEL_PROJECT_ID != '' }}
        working-directory: apps/portal
      - run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}
        if: ${{ env.VERCEL_TOKEN != '' && env.VERCEL_ORG_ID != '' && env.VERCEL_PROJECT_ID != '' }}
        working-directory: apps/portal
```

## Production Workflow Shape

Production is the preview workflow plus:

- trigger only on protected `main`
- job-level branch guard for manual dispatch
- GitHub `production` environment
- required Vercel, Privy, `DATABASE_URL`, linked-identity policy variables,
  and `X402_ENABLED=false` preflight
- Postgres schema migration gate against the target production `DATABASE_URL`
  before Vercel build
- `vercel pull --environment=production`
- `vercel deploy --prebuilt --prod`
- post-deploy public smoke runs
  `npm run hosted:smoke -- --base-url "$DEPLOYMENT_URL" --json`
- the smoke script requires `/api/health` to report
  `status: "configuration_ready"`, configured auth, configured durable store,
  mutable routes ready, required wallet linking, Base mainnet / Solana
  mainnet-beta policy, and `x402Enabled: false`
- the same smoke script requires `/api/contracts` to stay apply-disabled,
  `/api/x402/discovery` to stay non-enforcing, and unauthenticated
  `/api/agents` to return `401`
- optional authenticated smoke skips with a GitHub notice until
  `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN` exists; once configured it runs
  `hosted:smoke` with a dry-run fixture and proves `/api/agents`,
  `/api/briefs/validate`, `/api/agents/runs`, and run readback against the
  durable store without printing token, wallet, subject, DB URL, or request-body
  values

## Required Gates Before Enabling

- `apps/portal` exists.
- Portal has unit tests and build script.
- Contract fixture smoke runs in CI.
- GitHub `production` environment exists with a `main` deployment branch policy.
- `main` branch protection requires the `preview` check and disallows force
  pushes/deletions.
- Privy app URLs include preview and production domains.
- `DATABASE_URL` is configured in Vercel and schema version `2` has been
  migrated on the same target database the deployment will use.
- Matching `DATABASE_URL`, `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, and
  `PRIVY_APP_SECRET` are set as GitHub production environment secrets so the
  workflow can fail fast and migrate the target database.
- Explicit `X402_ENABLED=false` in production until x402 review passes.
- Explicit `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`,
  `FIELD_THEORY_BASE_CHAIN_ID=8453`, `NEXT_PUBLIC_BASE_CHAIN_ID=8453`,
  `FIELD_THEORY_SOLANA_CLUSTER=mainnet-beta`, and
  `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` in GitHub and Vercel production
  environments before production promotion.
- Rollback instructions exist in the release checklist.
- `npm run hosted:check-readiness -- --remote --strict` reports `ready`.

Current scaffold status:

- `.github/workflows/vercel-preview.yml` runs root CLI gates, portal tests, and
  portal build on pull requests, runs a throwaway Postgres schema migration, then
  exercises one DB-backed route smoke, then deploys preview only when Vercel
  secrets exist. When secrets are missing, the workflow emits an explicit
  notice so a green preview check is not mistaken for a deployed preview.
- `.github/workflows/vercel-production.yml` runs the same gates plus release,
  Raycast, diff checks, a throwaway Postgres schema migration, the DB route
  smoke, production secret and linked-identity policy preflight, and the target
  production `DATABASE_URL` migration on protected `main`; it captures the
  production deployment URL and smokes public health/contracts/x402-discovery
  routes plus unauthenticated protected-route behavior through
  `npm run hosted:smoke`. It also includes an authenticated operator smoke that
  is skipped until a production Privy bearer token is configured. Production
  deploy fails fast when required Vercel, Privy, database, linked-identity, or x402-disable
  settings are missing.
- `apps/portal/vercel.json` keeps the Vercel project rooted in the portal app.

The throwaway CI migration only proves the migration script. Production release
also runs `npm --prefix apps/portal run db:migrate` against the target
`DATABASE_URL`; operators still need to verify `fieldtheory_schema_version` and
authenticated route behavior before traffic is considered ready.

## Rollback

The production workflow captures the deployment URL as the rollback deployment
reference. The operator must record that reference in
`docs/release/milestone-2-hosted-readiness.md` before promotion. If smoke fails
after deploy, use Vercel's dashboard or CLI to promote the last known-good
deployment, then rerun the public smoke commands and update the release ledger
with the rollback deployment reference.

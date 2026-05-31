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
Production deploy must fail fast when required Vercel secrets are absent.

## Required Secrets

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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
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
      - run: npm run verify:hosted
      - run: npm install --global vercel@54.6.1
      - run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
        working-directory: apps/portal
      - run: vercel build --token=${{ secrets.VERCEL_TOKEN }}
        working-directory: apps/portal
      - run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}
        working-directory: apps/portal
```

## Production Workflow Shape

Production is the preview workflow plus:

- trigger only on protected `main`
- job-level branch guard for manual dispatch
- GitHub `production` environment
- required Vercel secret preflight
- Postgres schema migration gate before Vercel build
- `vercel pull --environment=production`
- `vercel deploy --prebuilt --prod`
- post-deploy smoke against `/api/health`, `/api/contracts`, and authenticated
  route fixtures once deployment protection/bypass policy is configured

## Required Gates Before Enabling

- `apps/portal` exists.
- Portal has unit tests and build script.
- Contract fixture smoke runs in CI.
- Privy app URLs include preview and production domains.
- `DATABASE_URL` is configured in Vercel and schema version `1` has been
  migrated.
- `X402_ENABLED=false` in production until x402 review passes.
- Rollback instructions exist in the release checklist.

Current scaffold status:

- `.github/workflows/vercel-preview.yml` runs root CLI gates, portal tests, and
  portal build on pull requests, runs a throwaway Postgres schema migration, then
  deploys preview only when Vercel secrets exist.
- `.github/workflows/vercel-production.yml` runs the same gates plus release,
  Raycast, diff checks, and a throwaway Postgres schema migration on protected
  `main`; production deploy fails fast when Vercel secrets are missing.
- `apps/portal/vercel.json` keeps the Vercel project rooted in the portal app.

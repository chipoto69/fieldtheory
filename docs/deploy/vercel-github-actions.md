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
branches. Preview and production deploy steps must skip safely when Vercel
secrets are absent.

## Required Secrets

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | Authenticates Vercel CLI in GitHub Actions. |
| `VERCEL_ORG_ID` | Selects Vercel account/team. |
| `VERCEL_PROJECT_ID` | Selects hosted Field Theory project. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Browser Privy app id. |
| `PRIVY_APP_SECRET` | Server-side Privy verification. |

## Preview Workflow Shape

```yaml
name: vercel-preview
on:
  pull_request:
  workflow_dispatch:
jobs:
  preview:
    runs-on: ubuntu-latest
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
      - run: npm --prefix apps/portal ci
      - run: npm --prefix apps/portal test
      - run: npm --prefix apps/portal run build
      - run: npm install --global vercel@latest
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
- `vercel pull --environment=production`
- `vercel deploy --prebuilt --prod`
- post-deploy smoke against `/api/health`, `/api/contracts`, and authenticated
  route fixtures

## Required Gates Before Enabling

- `apps/portal` exists.
- Portal has unit tests and build script.
- Contract fixture smoke runs in CI.
- Privy app URLs include preview and production domains.
- `X402_ENABLED=false` in production until x402 review passes.
- Rollback instructions exist in the release checklist.

Current scaffold status:

- `.github/workflows/vercel-preview.yml` runs root CLI gates, portal tests, and
  portal build on pull requests, then deploys only when Vercel secrets exist.
- `.github/workflows/vercel-production.yml` runs the same gates on protected
  `main`, then deploys `--prod` only when Vercel secrets exist.
- `apps/portal/vercel.json` keeps the Vercel project rooted in the portal app.

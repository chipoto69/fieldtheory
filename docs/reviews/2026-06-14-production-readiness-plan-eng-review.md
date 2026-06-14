---
title: Production Readiness Plan Engineering Review
created: 2026-06-14
status: done-with-blockers
scope: final working Field Theory hosted suite readiness
tags: [engineering-review, production-readiness, privy, vercel, agents, x402]
---

# Production Readiness Plan Engineering Review

## Verdict

The repository now has a stronger M2 scaffold gate, not a finished production
product. The local CLI/Raycast capture contracts and the hosted dry-run portal
remain valid, but production promotion is blocked until operator-owned secrets,
Privy dashboard evidence, linked GitHub/Base/Solana production variables,
target database proof, and authenticated mutation/readback smoke are recorded.

```
green PR checks
  |
  v
M2 scaffold proven
  |
  +-- local capture / recall / packet / export contracts
  +-- dry-run hosted portal routes
  +-- CI Postgres migration smoke
  |
  v
production still blocked
  |
  +-- Vercel / Privy / DATABASE_URL secrets
  +-- linked identity variables
  +-- target DB schema proof
  +-- authenticated write + readback
  +-- rollback / retention / backup evidence
```

## Four-Agent Findings

| Lane | Finding | Action taken or next action |
|---|---|---|
| Deploy/auth readiness | Readiness could previously go green without requiring production linked identities. | Added a `linked_identity_policy` readiness check and production workflow health assertions. |
| Release/x402/docs | Green PR checks are mergeable scaffold evidence, not production deployment evidence. | Updated release/deploy/setup docs so preview pass is not overclaimed and x402 stays non-enforcing. |
| Hosted portal/API | Dry-run run creation works; idempotent retries and artifact import readback are now covered, while lifecycle transitions and scoped agent tokens remain open. | Next product behavior patch should add lifecycle/status transitions or scoped agent-token access after production secrets are available. |
| Capture/Raycast/export | Local contracts are strong, but local/hosted secret detection differs and export run IDs can collide at second precision. | Next local contract patch should unify secret detectors and harden export run ids. |

## New Readiness Gate

`npm run hosted:check-readiness -- --remote --json` now blocks production unless
the GitHub production environment has these non-secret variables:

| Variable | Required value |
|---|---|
| `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES` | `true` |
| `FIELD_THEORY_BASE_CHAIN_ID` | `8453` |
| `NEXT_PUBLIC_BASE_CHAIN_ID` | `8453` |
| `FIELD_THEORY_SOLANA_CLUSTER` | `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` |

The production workflow also fails fast on those values and verifies
`/api/health` reports `walletLinking: "required"`,
`identityPolicy.required: true`, Base chain `8453`, Solana `mainnet-beta`, and
`x402Enabled: false`.

## Current Live Readiness

Checked on 2026-06-14 after the new gate:

- Local artifacts, package scripts, Vercel metadata, GitHub production
  environment, `main` deploy policy, branch protection, required `preview`
  check, and `X402_ENABLED=false` pass.
- Blocked on missing production secret names:
  `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`,
  `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`.
- Warns on missing optional `PRIVY_JWT_VERIFICATION_KEY`.
- Blocked on missing linked-identity production variables:
  `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`,
  `FIELD_THEORY_BASE_CHAIN_ID=8453`, and
  `FIELD_THEORY_SOLANA_CLUSTER=mainnet-beta`.

## Next Engineering Order

1. Add idempotent dry-run run creation to the hosted portal so retries with the
   same idempotency key return the same run and do not duplicate audit events.
2. Align local and hosted secret detectors so local captures/exports cannot
   admit standalone provider or Slack tokens that hosted validation later
   rejects.
3. Harden local export run ids beyond second precision and add same-second
   collision coverage.
4. After operator secrets are present, run a target DB migration proof, deploy
   production from protected `main`, and record authenticated mutation/readback
   evidence in the release ledger.

## Stop Conditions

- Readiness is not `ready`.
- Production deploy runs without `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`.
- `/api/health` reports wallet linking as `deferred` in production.
- Protected routes mutate without Privy auth and the selected linked identity
  policy.
- x402 enforcement is enabled before the x402 implementation handoff passes.

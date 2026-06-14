---
title: Production Proof Plan Engineering Review
created: 2026-06-14
status: done-with-blockers
scope: staged Vercel promotion, Privy smoke, DB proof, and release evidence gate
tags: [engineering-review, production-proof, vercel, privy, postgres, release]
---

# Production Proof Plan Engineering Review

## Verdict

The repo has a credible local suite and hosted scaffold, but the final hosted
product is not proven live. The safest next production shape is staged deploy,
smoke, evidence collection, then promotion.

```text
main branch
  -> CI gates
  -> target DB migrate + schema readback
  -> vercel deploy --prod --skip-domain
  -> public smoke
  -> authenticated Privy import/run/readback smoke
  -> sanitized release evidence manifest
  -> vercel promote
```

This matters because a plain `vercel deploy --prod` can put a broken build in
front of users before the smoke tests run. Staged production deploy fixes that:
the build uses production env, but domains move only after proof passes.

## Review Findings

| Finding | Decision |
|---|---|
| Authenticated smoke was optional while release docs required it. | Make `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN` a required production secret and remove the skip path. |
| GitHub secret names could exist while Vercel runtime envs were missing. | Add a production workflow env-name check after `vercel pull` and before build/deploy. Runtime smoke remains the real proof. |
| Privy server/browser app IDs could mismatch. | `/api/health` now requires matching `PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_APP_ID` before `configuration_ready`. |
| Public smoke does not prove DB schema readiness. | Add `apps/portal` schema readback and require authenticated import/run/readback smoke. |
| Release evidence was a checklist, not a gate. | Add `npm run hosted:collect-evidence` and require a ready `fieldtheory.hosted-release-evidence.v1` manifest before promotion. |
| First production release has no prior rollback target. | Require an explicit rollback posture: `FIELD_THEORY_FIRST_PRODUCTION_RELEASE=true` for the initial launch, or `FIELD_THEORY_ROLLBACK_REF` with the previous known-good deployment for later releases. |

## Remaining Blockers

- Required production secrets are still missing:
  `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`,
  `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
  `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN`.
- Vercel production runtime envs must mirror the GitHub production variables and
  secrets before the workflow can pass.
- Rollback posture must be explicit: `FIELD_THEORY_FIRST_PRODUCTION_RELEASE=true`
  for launch zero, or `FIELD_THEORY_ROLLBACK_REF` for later releases.
- Privy dashboard evidence is still operator-owned: production redirect URLs,
  GitHub OAuth linking, Base EVM wallet linking, and Solana wallet linking.
- There is still no live Vercel deployment URL/id. Prior inspection showed
  `live=false` and `deployments=0`.

## Next Engineering Order

1. After operator secrets exist, run `npm run hosted:check-readiness -- --remote --strict`.
2. Run the protected `vercel-production` workflow from `main`.
3. Download the `hosted-production-release-evidence` artifact.
4. Copy the sanitized manifest into the release ledger only if it is `ready`.
5. Then tackle local M1 hardening: stricter `agent-brief-pack.v1` schema and an
   explicit local outcome-capture command for Aeon/Hermes results.

## Stop Conditions

- Readiness is not `ready`.
- Vercel production env names are missing.
- `/api/health` does not report matching Privy app IDs.
- Authenticated smoke does not prove import, dry-run creation, and run readback.
- Release evidence manifest is not `ready`.
- x402 enforcement is enabled before a separate payment security review.

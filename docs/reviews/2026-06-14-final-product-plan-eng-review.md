---
title: Final Product Plan Engineering Review
created: 2026-06-14
status: done-with-concerns
scope: capture-first local suite, hosted Vercel portal, agent control plane, Privy wallet gating, and x402 handoff
tags: [engineering-review, vercel, privy, raycast, agents, x402]
---

# Final Product Plan Engineering Review

## Verdict

Update, later on 2026-06-14: this review is superseded by the production-proof
hardening slice. Production promotion now also requires
`FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN`, matching Privy server/browser app
IDs, staged Vercel deploy with `--skip-domain`, mandatory authenticated smoke,
DB schema readback, and a ready `fieldtheory.hosted-release-evidence.v1`
manifest before `vercel promote`.

Do not call the full suite finished yet. The local capture-first Field Theory
contracts and the hosted dry-run portal are strong enough to continue from, but
the final working product still needs production-owned secrets, Privy dashboard
policy evidence, target database proof, and authenticated production mutation
smoke before deploy can be treated as complete.

The current plan is valid only if production remains protected-main only,
Field Theory stays the source-of-truth capture layer, and Gordo/Aeon, Hermes,
and x402 remain dry-run or handoff-only until their apply gates are separately
implemented.

## Current Evidence

| Evidence | Result |
|---|---|
| `git log --oneline -6` | Historical snapshot at review time; later commits added linked-identity gates, idempotent dry-runs, hosted smoke, and release evidence collection. |
| `gh pr checks 1 --repo chipoto69/fieldtheory` | `preview` passes and CodeRabbit reports `pass` / review skipped. |
| `npm run hosted:check-readiness -- --remote --json` | Later readiness blocks on missing required production secret names: `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN`, plus missing rollback posture; optional `PRIVY_JWT_VERIFICATION_KEY` is missing. |
| `apps/portal/.vercel/project.json` | Present locally after linking `apps/portal` to `grrrrrrrrs-projects/fieldtheory`; ignored and not committed. |
| `gh` production environment checks | Production environment, `main` deployment branch policy, main branch protection, required `preview` check, and `X402_ENABLED=false` pass. |
| Focused regression tests | `tests/hosted-readiness.test.ts` and `tests/skill.test.ts` pass after the readiness action, ignore, and skill-sync fixes. |

## Integrated Subagent Findings

| Lane | Finding | Plan impact |
|---|---|---|
| Deploy/auth readiness | Superseded: production deploy is blocked by six required operator-owned secrets including the smoke bearer token; linked identity policy is now a hard production gate. | Keep production deploy blocked until secrets, dashboard policy, staged smoke, DB proof, evidence manifest, and promotion evidence are recorded. |
| Hosted portal/API | Portal is a valid dry-run/audit scaffold, but agents lack scoped token auth, artifact retrieval, run lifecycle updates, idempotency, and automated browser/production wallet-link smoke. | Treat agent execution as M2.5/M3, not done M2. |
| Capture/Raycast | M1 contracts are solid, but the checked-in Claude command was stale, secret detectors differ between CLI and portal, and export run IDs can collide within a second. | Skill sync is fixed here; detector alignment, CLI smoke expansion, and run-id hardening remain next local work. |
| Release/x402/docs | Release ledger was stale; x402 is correctly fenced as non-enforcing; production docs still need linked-identity and authenticated mutation proof gates. | Ledger is refreshed here; x402 remains handoff-only. |

## Critical Remaining Blockers

1. Production secrets are not configured:
   `VERCEL_TOKEN`, `DATABASE_URL`, `PRIVY_APP_ID`,
   `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and
   `FIELD_THEORY_PRODUCTION_SMOKE_BEARER_TOKEN`.
2. Privy dashboard evidence is missing for production and preview redirect URLs,
   GitHub OAuth, Ethereum/Base wallet auth, and Solana wallet auth.
3. Rollback posture is not configured: first launch needs
   `FIELD_THEORY_FIRST_PRODUCTION_RELEASE=true`; later launches need
   `FIELD_THEORY_ROLLBACK_REF`.
4. Production linked-identity policy is now enforced by readiness and the
   production workflow. `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`, Base
   chain id, and Solana cluster remain release gates.
5. Target Postgres has no production migration proof, schema-version output,
   backup/restore drill, or audit retention policy.
6. Production smoke proves public routes and unauthenticated `401`, but not an
   authenticated protected mutation plus DB readback on the deployed target.
6. Agent runtime is not yet a live autonomous control plane. Current routes
   create dry-run plans and audit records only.

## Next Engineering Plan

1. Keep closing local correctness gaps while production secrets are unavailable:
   align CLI/portal secret detectors, harden export run IDs beyond second
   resolution, and add temp-root CLI smoke for packet/export flows.
2. Add a production identity-readiness gate after the owner chooses the Privy
   policy: require linked GitHub, Base EVM chain id, and Solana cluster when
   `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`.
3. Add an authenticated production smoke plan that creates one dry-run import,
   creates one run, reads it back, and verifies DB rows on the target database.
4. Do not enable x402 enforcement. Keep `X402_ENABLED=false` until the x402
   implementation swarm adds verify/settle, replay protection, failure
   semantics, and metadata privacy tests.
5. After secrets are present, rerun:

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH npm run hosted:check-readiness -- --remote --strict --json
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH gh pr checks 1 --repo chipoto69/fieldtheory
```

## Stop Conditions

- Readiness is not `ready`.
- Production deploy would run from any branch other than protected `main`.
- Protected routes can mutate without Privy auth and the selected linked
  identity policy.
- `DATABASE_URL` is absent, unmigrated, or lacks schema-version proof.
- Any Gordo/Aeon, Hermes, wiki, GBrain, GitHub, Vercel, or x402 write happens
  without a specific apply gate.

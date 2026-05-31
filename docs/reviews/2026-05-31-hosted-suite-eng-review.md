---
title: Hosted Agentic Suite Engineering Review
created: 2026-05-31
status: scaffold-follow-up-open
scope: final working product after capture-first CLI contracts
tags: [engineering-review, vercel, privy, agents, x402]
---

# Hosted Agentic Suite Engineering Review

## Verdict

Do not start Vercel implementation from the current repo state without first
landing the hosted PRD, hosted architecture, and hosted environment runbook.
Milestone 1 is strong enough to serve as the contract substrate, but the final
product requirements are not yet represented as implementation artifacts.

## Evidence Read

| Evidence | Finding |
|---|---|
| `docs/handoff/hosted-suite-milestone-2.md` | Handoff exists and is smoke-ready, but it is a bridge document, not a full product PRD. |
| `docs/prd/capture-first-agentic-suite.md` | Explicitly defers hosted app, Privy, Gordo/Aeon writeback, Hermes writeback, and x402. |
| `docs/architecture/capture-first-agentic-suite.md` | Hosted layer is shown as deferred and thin over CLI contracts. |
| Initial repo scan | Before this scaffold pass, no `.github/workflows`, `vercel.json`, `next.config.*`, or `apps/portal` existed. |
| Vercel docs | GitHub Actions deployment should use Vercel CLI pull/build/deploy-prebuilt with separate preview and production workflows. |
| Privy docs | Wallet auth supports Ethereum SIWE and Solana SIWS; wallet login must be enabled in the Privy dashboard. |
| x402 docs | x402 flow uses HTTP 402 challenge, payment payload, verify/settle, then resource delivery; enforcement needs separate replay/audit design. |

Follow-up scaffold evidence:

| Evidence | Finding |
|---|---|
| `apps/portal` | Next.js App Router scaffold now exists with dashboard shell and dry-run API routes. |
| `.github/workflows/vercel-preview.yml` | Preview workflow runs CLI and portal gates, then deploys only when Vercel secrets exist. |
| `.github/workflows/vercel-production.yml` | Production workflow is protected-main only and deploys only when Vercel secrets exist. |
| `apps/portal/package.json` | Privy browser SDK is deliberately deferred; npm production audit is clean for the current fail-closed scaffold. |

## Required Plan Change

The next milestone is not "deploy what exists." It is:

1. Add hosted-suite PRD and architecture.
2. Add hosted environment/deployment runbook.
3. Scaffold the portal from the documented endpoint contract.
4. Add contract validators and tests before connecting any provider.
5. Add Privy scaffold with fail-closed auth behavior.
6. Add Vercel preview workflow.
7. Add dry-run Gordo/Hermes adapters.
8. Add production workflow only after portal gates pass.
9. Draft x402 endpoint handoff before enforcement.

## Final Product Requirements

| Requirement | Current status | Evidence needed before completion |
|---|---|---|
| Vercel-hosted app | Scaffolded, not deployed | `apps/portal`, portal `vercel.json`, passing local portal build, deployed preview URL still needed. |
| Agents live with the app | Dry-run scaffolded | Route handlers for agent run creation/status and in-memory audit exist; durable artifacts still needed. |
| Privy GitHub/wallet login | Server fail-closed only | Browser SDK login is deferred to auth hardening; server checks fail closed without `PRIVY_APP_SECRET`. |
| Base EVM and Solana wallet scaffold | Env/UI scaffolded | UI distinguishes GitHub, Base chain id, and Solana cluster; real wallet linking pending Privy SDK gate. |
| Gordo/Aeon control plane | Dry-run scaffolded | Import-plan endpoint and tests exist; no repo mutation authority. |
| Hermes integration | Dry-run scaffolded | Import-plan endpoint and tests exist; no Kanban/profile write authority. |
| x402 architecture handoff | Partial | Endpoint inventory, replay/audit/threat model, payment metadata review. |
| GitHub Actions Vercel deployment | Scaffolded, secrets pending | Preview and production workflow files exist and skip deploy without secrets. |
| Raycast continuity | Present for local CLI | Docs explaining how Raycast remains local while portal is hosted. |

## Blockers Before Coding

1. No authoritative hosted endpoint inventory exists.
2. No auth/session ownership model exists for imported Field Theory artifacts.
3. No audit store model exists for hosted actions.
4. No Vercel/GitHub secret boundary exists.
5. x402 replay/payment metadata threat model exists as planning docs, but fixtures/handoff are not yet implemented in code beyond discovery.

## New Planning Artifacts

This review creates these implementation contracts:

- `docs/prd/hosted-agentic-suite.md`
- `docs/architecture/hosted-agentic-suite.md`
- `docs/setup/hosted-suite-environment.md`
- `docs/api/hosted-suite-endpoints.md`
- `docs/data/hosted-suite-data-model.md`
- `docs/security/hosted-suite-threat-model.md`
- `docs/deploy/vercel-github-actions.md`
- `docs/release/milestone-2-hosted-readiness.md`

## Subagent Review Queue

Four subagents were ordered to review independent lanes:

| Lane | Focus |
|---|---|
| Hosted architecture | Product requirements, endpoint/data-flow gaps, milestone order. |
| Verification | Current gate coverage, missing CI/deploy/test matrix. |
| Security/contracts | Auth, wallet, x402, secret handling, remote write risks. |
| Operator/release | Raycast continuity, docs, release/deployment readiness. |

Their findings should be appended below before the next implementation commit.

## Subagent Findings Integrated

| Lane | Findings | Action |
|---|---|---|
| Hosted architecture | Missing hosted PRD, endpoint inventory, authz matrix, data model, integration specs, deployment runbook. | Added hosted PRD, architecture, endpoint contract, data model, deploy plan, and readiness checklist. |
| Verification | Current gates prove M1 local contracts only; there is no enforced CI, portal test matrix, Privy/Hermes/Gordo/x402 coverage, or packed CLI smoke in CI. | Added CI/deploy gates to hosted runbook and Vercel deployment plan. |
| Security/contracts | Hosted app must preserve evidence-linked `AgentBriefPack` invariants, dry-run authority, secret scanning, auth classes, x402 replay/audit review, and remote-write prohibitions. | Added endpoint contract, data model, and threat model. |
| Operator/release | Operator can use local CLI/Raycast/static console today, but final product lacks hosted app, dynamic portal, deployment plan, and M2 release bridge. | Added release readiness checklist and README/handoff links. |

## Current Open Issues

- The output guard has tests for non-concurrent symlink swaps, but a malicious
  concurrent filesystem attacker could still race between final path check and
  write. Treat that as out of M1 scope and document it as a hosted threat when
  accepting uploaded/exported manifests.
- `release:check` remains package-focused. Add a broader `verify:*` script set
  when portal code exists.

Closed in this planning pass:

- Updated `tests/engine-invoke.test.ts` so the EOF test comment describes the
  current piped-stdin close behavior.
- Added a callout in `docs/workflows/operator-suite.md` that `bm_test` smoke
  snippets require the seeded setup fixture.

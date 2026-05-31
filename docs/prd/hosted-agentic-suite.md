---
title: Field Theory Hosted Agentic Suite PRD
created: 2026-05-31
status: draft-implementation-contract
scope: Vercel hosted product after capture-first CLI contracts
tags: [prd, vercel, privy, aeon, hermes, x402, agents]
---

# Field Theory Hosted Agentic Suite PRD

## Working Decision

The hosted suite must be a thin, audited product layer over Field Theory's local
capture-first contracts. The web app does not replace the CLI stores and does
not gain hidden authority over wiki canon, GBrain, Hermes, Aeon/Gordo, or user
wallets.

Milestone 1 proved the local contracts:

- `fieldtheory.capture.v1`
- `agent-brief-pack.v1`
- `fieldtheory.agent-export.v1`

Milestone 2 creates the hosted control plane around those contracts. Milestone 3
turns on production deployment and payment-gated endpoints only after auth,
audit, and replay behavior are tested.

## Product Promise

Let operators and agents capture knowledge locally, package it into cited
briefs, review the resulting agent context in a browser, and safely route that
context into Aeon/Gordo and Hermes without losing provenance or write authority.

## Users

| User | Job |
|---|---|
| Solo operator | Review capture/recall/export state, launch agent handoffs, and connect GitHub plus wallets. |
| Coding agent | Read stable endpoint contracts and fetch authorized brief/export packets. |
| Aeon/Gordo workspace | Consume run-scoped Field Theory export bundles and agent soul drafts. |
| Hermes profile | Import Field Theory packets as explicit staged handoffs, not raw canon. |
| Future buyer agent | Pay for approved Field Theory endpoints through x402 after the endpoint inventory is frozen. |

## Current Evidence

| Evidence | Finding |
|---|---|
| `docs/handoff/hosted-suite-milestone-2.md` | Defines M2 entry gate, contract versions, sample brief/export shapes, Privy assumptions, and x402 deferral. |
| `docs/prd/capture-first-agentic-suite.md` | Locks M1 as local-first and explicitly defers Vercel, Privy, Gordo/Aeon writeback, Hermes writeback, and x402 enforcement. |
| `docs/architecture/capture-first-agentic-suite.md` | Maps the hosted layer as a deferred surface over CLI contracts. |
| Repo scan | No `.github/workflows`, `vercel.json`, `next.config.*`, or hosted Next.js app exists yet. |
| Current PR #1 | Draft branch `codex/fieldtheory-suite`; M1 validation passed and branch is not `main`. |

## Non-Goals

- Do not write directly to wiki canon or GBrain from the hosted app.
- Do not let Vercel routes read operator-local raw stores directly.
- Do not create GitHub repos, push branches, write secrets, or dispatch
  workflows without a distinct apply gate.
- Do not add x402 enforcement before endpoint inventory, replay protection,
  audit logs, and wallet identity rules are approved.
- Do not make Privy wallet login imply payment authority.

## Milestone 2 Scope

| Capability | Required shape | Authority |
|---|---|---|
| Next.js portal | `apps/portal` with App Router, dashboard, endpoint docs, and agent run views | Reads staged fixtures and server-side store adapters only. |
| Auth scaffold | Privy GitHub login plus Base EVM and Solana wallet linking | Authenticates identities; does not authorize payments by itself. |
| Contract API | Route handlers for health, contracts, briefs, exports, agents, and x402 discovery | Returns typed JSON only until apply gates exist. |
| Gordo/Aeon adapter | Dry-run import of `fieldtheory.agent-export.v1` plus optional apply-plan preview | No repo mutation until explicit apply command. |
| Hermes adapter | Dry-run profile/task payload import with staged result envelope | No Kanban/profile writeback until explicit apply command. |
| Operator audit | Append-only action log for hosted operations | Stores who requested what, from which contract version, with which auth identity. |
| Deployment CI | GitHub Actions for Vercel preview and production | Production only from protected main after gates. |

## Milestone 3 Scope

| Capability | Required shape | Authority |
|---|---|---|
| Production Vercel deploy | Protected production deployment with documented secrets | Vercel deployment only; no external write side effects. |
| Agent runtime endpoints | Agent-facing contract fetch, run creation, status, and artifact download | Requires authenticated user and run ownership. |
| Wallet-gated surfaces | Privy identity checks around private dashboard and paid endpoint previews | Wallet ownership proves access tier only after policy mapping. |
| x402 architecture handoff | Endpoint inventory, payment challenge flow, replay/audit strategy, facilitator assumptions | Architecture and fixtures first; enforcement in a later gate. |

## Endpoint Inventory

All endpoints must be implemented as Next.js App Router route handlers. Current
Next.js docs define route handlers as `route.js|ts` files inside `app`, with
standard `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`
methods.

| Endpoint | Method | Auth | x402 | Purpose |
|---|---|---|---|---|
| `/api/health` | `GET` | none | none | Build/runtime readiness. |
| `/api/contracts` | `GET` | none | none | Supported contract versions and schema links. |
| `/api/briefs/validate` | `POST` | Privy | none | Validate an uploaded or generated `AgentBriefPack`. |
| `/api/exports/validate` | `POST` | Privy | none | Validate export manifest shape and forbidden writes. |
| `/api/agents` | `GET` | Privy | none | List configured local/remote agent targets. |
| `/api/agents/runs` | `POST` | Privy | deferred | Create a dry-run agent handoff from a validated export. |
| `/api/agents/runs/:id` | `GET` | Privy | deferred | Read run status, artifacts, and audit envelope. |
| `/api/gordo/import-plan` | `POST` | Privy | none | Convert export bundle into a Gordo/Aeon apply plan. |
| `/api/hermes/import-plan` | `POST` | Privy | none | Convert export bundle into a Hermes staged import plan. |
| `/api/x402/discovery` | `GET` | none | none | Publish planned paid endpoint inventory, not enforcement. |
| `/api/x402/protected/*` | varies | Privy or agent token | planned | Later paid endpoints after x402 review. |

## Auth and Identity

Privy must be configured to support:

- GitHub OAuth login.
- Ethereum wallet authentication for Base EVM ownership.
- Solana wallet authentication or embedded wallets.
- Account linking between GitHub and wallet identities.

Privy's wallet docs say wallet login uses Ethereum SIWE or Solana SIWS, and the
dashboard must enable wallet authentication before implementation. Privy's
Solana guide also notes that Solana connectors and RPC config are required when
using embedded wallet UI signing flows.

## Data Flow

1. Operator runs local Field Theory capture/recall/export commands.
2. Operator uploads or imports a generated brief/export manifest into the portal.
3. Portal validates contract version and forbidden writes.
4. Portal creates a dry-run agent handoff plan.
5. Operator reviews the plan and audit envelope.
6. Later apply gates can dispatch to Gordo/Aeon or Hermes.
7. Later x402 gates can challenge paid endpoint calls with HTTP 402 and verify
   settlement before returning protected output.

## Acceptance Criteria

| Area | Criteria |
|---|---|
| Contract fidelity | Hosted validators reject unknown contract versions, missing evidence, target payloads with duplicated forbidden actions, unsafe file paths, and manifests that imply remote writes. |
| Auth scaffold | App builds without real secrets using documented dummy env values; authenticated pages fail closed when Privy config is absent. |
| Wallet linking | UI distinguishes GitHub login, Base EVM wallet, Solana wallet, and linked identity state. |
| Agent runs | Initial run creation is dry-run only and stores audit envelopes; no external write happens in M2. |
| Gordo/Aeon | Import plan consumes `fieldtheory/exports/<run-id>/` bundles and keeps `aeon.yml.draft` as a draft. |
| Hermes | Import plan consumes `hermes/task-payload.dry-run.json` and emits staged profile handoff only. |
| Vercel CI | Preview and production workflows use `vercel build` and `vercel deploy --prebuilt`; production deploy runs only from protected main. |
| x402 | Handoff includes endpoint inventory, pricing owner, facilitator assumptions, replay protection, and audit log requirements before enforcement. |

## External Docs Checked

- Vercel GitHub Actions deployment docs: https://vercel.com/docs/git/vercel-for-github
- Next.js route handlers docs: https://nextjs.org/docs/app/getting-started/route-handlers
- Privy wallet auth docs: https://docs.privy.io/authentication/user-authentication/login-methods/wallet
- Privy Solana guide: https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana
- x402 introduction: https://docs.x402.org/introduction

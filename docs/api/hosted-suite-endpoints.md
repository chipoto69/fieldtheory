---
title: Hosted Suite Endpoint Contract
created: 2026-05-31
status: draft-implementation-contract
scope: Next.js route handlers for the hosted Field Theory suite
tags: [api, nextjs, vercel, agents, x402]
---

# Hosted Suite Endpoint Contract

## Rule

Hosted routes are contract consumers. They validate Field Theory artifacts,
create dry-run plans, and write audit records. They do not write to wiki,
GBrain, Hermes, Aeon/Gordo, GitHub, Vercel, or x402 settlement state until a
later apply gate exists.

State-changing hosted routes use `HostedStore`. In production, `DATABASE_URL`
must select the Postgres adapter and schema version `2` must be migrated before
requests are accepted.

## Route Table

| Route | Method | Auth | Body | Response | Side effects |
|---|---|---|---|---|---|
| `/api/health` | `GET` | none | none | service status | none |
| `/api/contracts` | `GET` | none | none | supported contract versions | none |
| `/api/briefs/validate` | `POST` | Privy | `AgentBriefPack` | validation report | audit event |
| `/api/exports/validate` | `POST` | Privy | export manifest plus optional file list | validation report | audit event |
| `/api/agents` | `GET` | Privy | none | target registry | none |
| `/api/agents/runs` | `GET` | Privy | none | owner-scoped recent runs plus `auditEvents[]` per run | none |
| `/api/agents/runs` | `POST` | Privy | `{target, importId, mode, idempotencyKey?}` | dry-run record plus `auditEvents[]` and `idempotentReplay` | audit event, run record unless replayed |
| `/api/agents/runs/[id]` | `GET` | Privy owner | none | run status plus owner-scoped `auditEvents[]` | none |
| `/api/gordo/import-plan` | `POST` | Privy | export manifest | Aeon/Gordo plan | accepted plan audit event |
| `/api/hermes/import-plan` | `POST` | Privy | export manifest | Hermes plan | accepted plan audit event |
| `/api/x402/discovery` | `GET` | none | none | `fieldtheory.x402-discovery.v1` endpoint inventory | none |

## Auth Classes

| Class | Meaning |
|---|---|
| `public` | May expose only health, contract names, and x402 discovery. |
| `privy-user` | Requires a valid Privy-authenticated user. |
| `artifact-owner` | Requires the user who imported or owns the artifact. |
| `operator-admin` | Reserved for future apply gates and production policy changes. |
| `paid-agent` | Reserved for x402-protected routes after payment enforcement review. |

## Validation Rules

Every `AgentBriefPack` endpoint must reject:

- unknown `version`
- missing `kind`, `input`, `limits`, `storeStatus`, `evidence`,
  `boundaries`, `promotionCandidates`, or `resultEnvelope`
- `summaryClaims`, `typedSlots`, `suggestedCommands`, `promotionCandidates`, or
  `boundaries` that reference missing evidence ids without `operatorAuthored`
- `source_packet` without `sourcePacket` or without boundaries
- `sourcePacket.payload.forbiddenActions`

Every export manifest endpoint must reject:

- unknown `version`
- paths that are absolute, hidden, dot paths, traversal paths, or `.git`
  metadata paths
- files outside `fieldtheory/exports/<run-id>/` except standalone soul export
  manifests
- forbidden writes that imply remote side effects
- any payload containing secret-like content, including `resultEnvelope`

Target-specific import plan endpoints must also reject mismatches:

- `/api/gordo/import-plan` accepts only `target: "aeon"` manifests that include
  `aeon/aeon.yml.draft` under the run-scoped export directory.
- `/api/hermes/import-plan` accepts only `target: "hermes"` manifests that
  include `hermes/task-payload.dry-run.json`.
- `/api/agents/runs` rejects an import whose sanitized export target does not
  match the requested agent target.

## Agent Run Modes

| Mode | M2 behavior |
|---|---|
| `dry-run` | Allowed; writes hosted run metadata and audit only. |
| `apply-plan` | Returned only inside generated dry-run plans; rejected as a requested run mode. |
| `apply` | Forbidden until a separate apply-gate PR. |

Run creation, run index, and run detail responses include the audit envelope
associated with each run target so operators can review who requested the
handoff, which action was accepted, and which hosted run id was affected before
any later apply gate exists.

`POST /api/agents/runs` accepts an optional `idempotencyKey` made from
letters, numbers, `_`, `.`, `/`, `:`, `@`, `=`, or `-`, up to 160 characters.
The key is scoped to the authenticated owner. A repeat request with the same
owner, key, target, import id, and mode returns the existing run with
`idempotentReplay: true` and does not create a second audit event. Reusing the
same key for a different run request returns `409 idempotency_conflict`.

When `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`, protected write routes
return `403 identity_policy_unsatisfied` before store writes unless the verified
Privy user has linked GitHub OAuth, an EVM wallet on
`FIELD_THEORY_BASE_CHAIN_ID`, and a Solana wallet. The protected write routes
are `/api/briefs/validate`, `/api/exports/validate`,
`/api/gordo/import-plan`, `/api/hermes/import-plan`, and
`/api/agents/runs`. Development auth never satisfies this policy.

## x402 Boundary

`/api/x402/discovery` may list planned endpoints, prices, and enforcement
status. It must not verify, settle, or return paid protected content until the
x402 handoff passes.

The current route mirrors `apps/portal/src/lib/x402-discovery.v1.json`, which
has a matching downstream handoff fixture at
`apps/portal/tests/fixtures/x402-discovery.v1.json`. The fixture names x402 V2
headers and planned Base Sepolia plus Solana devnet payment entries, but keeps
`enabled: false`, `enforcement: "disabled"`, and
`settlement: "not-implemented"`.

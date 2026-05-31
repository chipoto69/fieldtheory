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

## Route Table

| Route | Method | Auth | Body | Response | Side effects |
|---|---|---|---|---|---|
| `/api/health` | `GET` | none | none | service status | none |
| `/api/contracts` | `GET` | none | none | supported contract versions | none |
| `/api/briefs/validate` | `POST` | Privy | `AgentBriefPack` | validation report | audit event |
| `/api/exports/validate` | `POST` | Privy | export manifest plus optional file list | validation report | audit event |
| `/api/agents` | `GET` | Privy | none | target registry | none |
| `/api/agents/runs` | `POST` | Privy | `{target, importId, mode}` | dry-run record | audit event, run record |
| `/api/agents/runs/[id]` | `GET` | Privy owner | none | run status and artifacts | none |
| `/api/gordo/import-plan` | `POST` | Privy | export manifest | Aeon/Gordo plan | audit event |
| `/api/hermes/import-plan` | `POST` | Privy | export manifest | Hermes plan | audit event |
| `/api/x402/discovery` | `GET` | none | none | endpoint inventory | none |

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
- any payload containing secret-like content

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
| `dry-run` | Allowed; writes local hosted run metadata and audit only. |
| `apply-plan` | Returned only inside generated dry-run plans; rejected as a requested run mode. |
| `apply` | Forbidden until a separate apply-gate PR. |

## x402 Boundary

`/api/x402/discovery` may list planned endpoints, prices, and enforcement
status. It must not verify, settle, or return paid protected content until the
x402 handoff passes.

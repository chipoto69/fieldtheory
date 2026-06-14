---
title: Hosted Suite Data Model
created: 2026-05-31
status: draft-implementation-contract
scope: hosted persistence records for Field Theory portal and agents
tags: [data-model, vercel, agents, privy, audit]
---

# Hosted Suite Data Model

## Rule

Hosted persistence stores contract metadata, ownership, and audit records. It
does not store raw local Field Theory stores unless the operator explicitly
imports a brief/export artifact.

## Entities

| Entity | Required fields | Notes |
|---|---|---|
| `User` | `id`, `privyUserId`, `createdAt`, `updatedAt` | Internal user row keyed to Privy. |
| `Identity` | `id`, `userId`, `type`, `subject`, `verifiedAt` | `type` is `github`, `evm`, or `solana`. |
| `ArtifactImport` | `id`, `ownerUserId`, `contractVersion`, `kind`, `sha256`, `validationStatus`, `exportSummary`, `createdAt` | Imported `AgentBriefPack` or export manifest. IDs are owner-scoped from `ownerUserId + sha256`. Export summaries are sanitized and exclude raw payloads and absolute paths. |
| `ArtifactFile` | `id`, `importId`, `relPath`, `sha256`, `contentType`, `sizeBytes` | Optional file metadata; content storage provider is undecided. |
| `AgentRun` | `id`, `ownerUserId`, `target`, `mode`, `status`, `importId`, `idempotencyKey`, `resultEnvelope`, `createdAt` | M2 permits `dry-run` only. `idempotencyKey` is optional and owner-scoped. |
| `AuditEvent` | `id`, `actorUserId`, `action`, `targetType`, `targetId`, `contractHash`, `outcome`, `createdAt` | Append-only. |
| `X402EndpointPlan` | `id`, `route`, `method`, `pricePolicy`, `facilitator`, `status`, `createdAt` | `status` remains `planned` until enforcement review. |

## Identity Types

| Type | Subject |
|---|---|
| `github` | GitHub user id or login from Privy OAuth. |
| `evm` | EVM wallet address and chain context; Base is the first planned network. |
| `solana` | Solana wallet address or embedded wallet id. |

## Ownership Rules

- Imported artifacts are visible only to the importing user unless explicitly
  shared in a later collaboration model.
- Agent runs inherit ownership from the artifact import.
- Aeon and Hermes runs require target-compatible export imports; a Hermes export
  cannot create a Gordo/Aeon plan and an Aeon export cannot create a Hermes
  plan.
- Optional run `idempotencyKey` values are scoped by `ownerUserId`. Replays with
  the same owner/key return the existing run and audit envelope instead of
  writing duplicate run or audit rows.
- Linked identities are resolved from Privy at request time for the M2 scaffold;
  they are not persisted in the current Postgres schema. Linked wallets prove
  identity state; they do not automatically grant payment or apply authority.
- Audit events must be immutable from the application layer.

## Sanitized Export Summary

The portal stores derived export metadata, not the uploaded manifest body:

```json
{
  "target": "aeon",
  "runId": "aeon-20260531T130000Z",
  "fileRelPaths": ["fieldtheory/exports/aeon-20260531T130000Z/aeon/aeon.yml.draft"],
  "fileHashes": ["..."],
  "forbiddenWrites": ["create_repo", "network_call"],
  "resultEnvelope": {
    "status": "complete",
    "resultCount": 1,
    "warningCount": 0,
    "generatedBy": "fieldtheory"
  }
}
```

`files[].path` is treated as untrusted source metadata. Only `files[].relPath`
is accepted for hosted routing and it must pass the path-safety validator.
`inputs`, file metadata, brief content, and `resultEnvelope` are rejected before
persistence when they contain token, cookie, private-key, or BIP39 seed phrase
patterns. Persisted export summaries keep only result-envelope status, result
count, warning count, and generator id; warning text and raw details are dropped.

## Store Adapter

Postgres is the first durable hosted adapter. It is selected when
`DATABASE_URL` is present and stores these tables:

| Table | Purpose |
|---|---|
| `fieldtheory_schema_version` | Migration marker; version `2` is required in production. |
| `fieldtheory_imports` | Owner-scoped artifact import metadata and sanitized export summary. |
| `fieldtheory_agent_runs` | Dry-run agent run records, optional owner-scoped `idempotency_key`, and result envelopes. |
| `fieldtheory_audit_events` | Append-only hosted action records. |

Run `npm --prefix apps/portal run db:migrate` with `DATABASE_URL` before
production traffic. Request handlers may auto-create the schema only outside
production. Production returns `store_schema_not_ready` when the migration marker
is absent. Validation import + audit writes and run + audit writes use composite
store methods so the Postgres adapter commits those paired records in one
transaction.
Schema v2 adds `fieldtheory_agent_runs.idempotency_key` plus a unique partial
index on `(owner_user_id, idempotency_key)` where the key is present.

Import and run readback use the same owner id as the authenticated Privy
subject and return only audit events whose `actor_user_id`, `target_type`, and
`target_id` match that owner-scoped record. Import readback returns sanitized
`ArtifactImport` metadata only; it does not rehydrate the uploaded manifest body
or local file contents. The read paths are intentionally non-mutating.

## Retention Rules

| Record | Default retention |
|---|---|
| `User`, `Identity` | Until account deletion. |
| `ArtifactImport`, `ArtifactFile` | Operator-controlled; default keep while run history exists. |
| `AgentRun` | Keep while artifacts exist. |
| `AuditEvent` | Append-only; retention policy must be explicit before production. |
| `X402EndpointPlan` | Keep as deployment policy record. |

## Remaining Provider Work

Backups, restore drills, migration versioning beyond v1, and retention policy
are still release gates before treating the hosted store as production-complete.
The in-memory adapter remains local/test only and is ignored by production
mutations when `DATABASE_URL` is absent.

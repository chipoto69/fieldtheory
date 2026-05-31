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
| `ArtifactImport` | `id`, `ownerUserId`, `contractVersion`, `kind`, `sha256`, `validationStatus`, `createdAt` | Imported `AgentBriefPack` or export manifest. |
| `ArtifactFile` | `id`, `importId`, `relPath`, `sha256`, `contentType`, `sizeBytes` | Optional file metadata; content storage provider is undecided. |
| `AgentRun` | `id`, `ownerUserId`, `target`, `mode`, `status`, `importId`, `resultEnvelope`, `createdAt` | M2 permits `dry-run` only. |
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
- Linked wallets prove identity state; they do not automatically grant payment
  or apply authority.
- Audit events must be immutable from the application layer.

## Retention Rules

| Record | Default retention |
|---|---|
| `User`, `Identity` | Until account deletion. |
| `ArtifactImport`, `ArtifactFile` | Operator-controlled; default keep while run history exists. |
| `AgentRun` | Keep while artifacts exist. |
| `AuditEvent` | Append-only; retention policy must be explicit before production. |
| `X402EndpointPlan` | Keep as deployment policy record. |

## Open Provider Decision

The data model intentionally does not pick a database provider. The first portal
scaffold uses an in-memory adapter for local tests only. In production mode,
protected mutation routes fail closed until a durable adapter is added and
reviewed.

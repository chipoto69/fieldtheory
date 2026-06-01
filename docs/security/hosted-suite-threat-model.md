---
title: Hosted Suite Threat Model
created: 2026-05-31
status: draft-implementation-contract
scope: Privy, wallet, agent, remote-write, and x402 risks
tags: [security, privy, wallet, x402, agents]
---

# Hosted Suite Threat Model

## Assets

| Asset | Protection goal |
|---|---|
| Field Theory captures and briefs | Preserve provenance; prevent secret leakage and unauthorized sharing. |
| Export manifests | Prevent path escape, hidden remote write authority, and contract drift. |
| Privy identities | Prevent account takeover and mistaken identity linking. |
| Wallet addresses | Prove ownership without implying spend/payment authority. |
| Agent runs | Prevent unauthorized run creation, replay, and hidden external writes. |
| Audit log | Preserve append-only record of hosted actions. |
| x402 endpoints | Prevent replay, underpayment, metadata leaks, and false paid-access state. |

## Threats

| Threat | Required mitigation |
|---|---|
| GitHub-wallet account takeover | Reverify identity on sensitive operations; audit identity changes. |
| Wrong-chain wallet proof | Store chain context and signature method with wallet identity. |
| Replayed auth or payment payload | Idempotency keys, nonce windows, and audit event dedupe. |
| Webhook spoofing | Verify provider signatures before accepting webhook state. |
| Secret ingestion | Run server-side secret scanning before DB writes, logs, exports, or adapter calls. |
| Durable store misconfiguration | Fail closed without `DATABASE_URL`; require migrated schema marker in production. |
| Path escape in manifests | Reuse output-path validation semantics and reject dot/hidden/git paths. |
| Hidden remote write | Keep Gordo/Hermes adapters dry-run until apply gates. |
| Payment metadata leak | Review x402 endpoint descriptions and resource URLs before enforcement. |

## Endpoint Security Gates

| Gate | Requirement |
|---|---|
| Auth gate | Every non-public endpoint must map to an auth class before implementation. |
| Ownership gate | Artifact and run reads require owner checks. |
| Authority gate | Apply-capable routes must be disabled until a separate PR. |
| Secret gate | Token, cookie, private-key, and BIP39 fixtures are rejected before persistence. |
| Audit gate | Successful validation, import, and run creation write audit events; failed-auth audit needs a privacy-preserving design before it becomes a release claim. |
| x402 gate | No enforcement until replay, verify/settle, refund/failure, and privacy review pass. |

## Current Mitigations

- Server route handlers verify Privy access tokens with `@privy-io/node` when
  `PRIVY_APP_ID`/`NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET` are present.
- Unsigned development bearer tokens are ignored in production even if
  `PRIVY_DEV_ALLOW_UNSIGNED=true` is accidentally configured.
- Production mutation routes ignore the memory-store override and require
  `DATABASE_URL`.
- The Postgres adapter returns generic `store_unavailable` or
  `store_schema_not_ready` errors instead of exposing driver messages, SQL, or
  connection strings.
- Import/audit and run/audit writes use composite store methods; the Postgres
  adapter commits each pair in a single transaction.
- Import IDs are owner-scoped from `ownerUserId + sha256`, so two users can
  import the same artifact without overwriting ownership.
- Export imports keep sanitized summaries only: target, run id, relative paths,
  hashes, forbidden writes, and result envelope status/counts. Warning text,
  raw details, inputs, and source snippets are not persisted in the summary.
- Briefs, manifests, file metadata, inputs, and result envelopes are screened
  for token, cookie, private-key, and BIP39 seed phrase patterns before
  persistence.
- Aeon and Hermes import-plan routes reject target mismatches and require their
  target-specific dry-run artifact paths.
- x402 discovery remains non-enforcing; health can report that x402 was
  requested by env, but `x402Enabled` remains false until enforcement exists.
- `/api/health` exposes non-secret configuration readiness flags for Privy server config,
  durable-store config, mutable-route readiness, deferred wallet linking, and
  disabled x402 enforcement. Its positive status is `configuration_ready`, not
  production traffic readiness. It does not prove the production schema;
  operators must run `db:migrate` and check `fieldtheory_schema_version`.

## Current Limits

- Browser-side Privy login controls are mounted when `NEXT_PUBLIC_PRIVY_APP_ID`
  exists, but linked GitHub/Base/Solana wallet policy is still deferred; the
  current server gate only verifies bearer tokens on protected route handlers.
- Development auth does not fabricate linked GitHub, EVM, or Solana identities;
  protected route responses mark linked-identity policy as deferred.
- Failed authorization attempts return closed errors but are not yet persisted
  to the audit log.
- The public health endpoint reports whether `DATABASE_URL` is configured, not
  whether the database is reachable or migrated.

## x402 Review Checklist

- Endpoint inventory and price policy are approved.
- Facilitator `/verify` and `/settle` assumptions are documented.
- Payment idempotency key is included in request handling.
- Failure response shape is stable for unpaid, invalid, expired, and replayed
  payment states.
- Audit log records payment challenge id, endpoint id, actor id, and outcome.
- Payment metadata does not include raw captures or private source content.

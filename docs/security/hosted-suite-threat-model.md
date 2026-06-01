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
- When `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`, the server loads Privy
  linked accounts and requires GitHub OAuth, the configured Base EVM chain id,
  and Solana identity before protected write routes. Failed policy checks
  return before any hosted store write.
- Local browser operator mode is available only outside production. It sends a
  `Bearer dev:<operator>` token from the browser so operators can smoke the
  workbench without Privy secrets, but it still depends on server-side
  `PRIVY_DEV_ALLOW_UNSIGNED=true` and cannot satisfy required linked-identity
  policy.
- x402 discovery remains non-enforcing; health can report that x402 was
  requested by env, but `x402Enabled` remains false until enforcement exists.
- `/api/health` exposes non-secret configuration readiness flags for Privy server config,
  durable-store config, mutable-route readiness, wallet-linking policy mode, and
  disabled x402 enforcement. Its positive status is `configuration_ready`, not
  production traffic readiness. It does not prove the production schema;
  operators must run `db:migrate` and check `fieldtheory_schema_version`.

## Current Limits

- Browser-side Privy login controls are mounted when `NEXT_PUBLIC_PRIVY_APP_ID`
  exists, but production still needs operator-owned GitHub/Base/Solana policy
  values and real Privy dashboard configuration before the policy can be a
  release claim.
- Development auth does not fabricate linked GitHub, EVM, or Solana identities;
  protected route responses mark linked-identity policy as deferred by default
  and unsatisfied when the policy is required.
- The M2 Solana cluster value is a policy label for route gating. It does not
  prove chain-specific settlement, RPC health, or payment authority.
- Local browser operator mode proves UI-to-route wiring only. It does not prove
  production Privy login, wallet linking, durable store readiness, or x402.
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
- Discovery and audit fixtures stay non-enforcing and hash-only:
  `apps/portal/tests/fixtures/x402-discovery.v1.json` and
  `apps/portal/tests/fixtures/x402-audit-events.v1.json`.

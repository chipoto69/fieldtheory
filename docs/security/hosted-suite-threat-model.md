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
| Audit gate | Every validation, import, run creation, and failed authorization writes an audit event. |
| x402 gate | No enforcement until replay, verify/settle, refund/failure, and privacy review pass. |

## x402 Review Checklist

- Endpoint inventory and price policy are approved.
- Facilitator `/verify` and `/settle` assumptions are documented.
- Payment idempotency key is included in request handling.
- Failure response shape is stable for unpaid, invalid, expired, and replayed
  payment states.
- Audit log records payment challenge id, endpoint id, actor id, and outcome.
- Payment metadata does not include raw captures or private source content.

---
title: x402 Milestone 3 Handoff
created: 2026-06-01
status: fixture-backed-handoff
scope: non-enforcing endpoint, payment, replay, and audit contract for a later x402 swarm
tags: [handoff, x402, payments, agents]
---

# x402 Milestone 3 Handoff

This is an architecture handoff only. It gives the next swarm stable fixtures
for discovery and audit shape while keeping Field Theory enforcement disabled.
No route in this milestone verifies payment, settles funds, or returns paid
protected content.

## Enforcement Gate

Production and preview environments must keep:

```text
X402_ENABLED=false
```

`/api/x402/discovery` returns `enabled: false`, `enforcement: "disabled"`, and
`settlement: "not-implemented"` until a separate enforcement PR passes security
review and operator approval.

## Contract Fixtures

- Discovery fixture:
  `apps/portal/tests/fixtures/x402-discovery.v1.json`
- Audit lifecycle fixture:
  `apps/portal/tests/fixtures/x402-audit-events.v1.json`
- Canonical route payload:
  `apps/portal/src/lib/x402-discovery.v1.json`

The discovery route mirrors the fixture exactly. Downstream agents should use
the fixture for architecture, PRD, and x402 implementation planning, not as
proof that payment enforcement exists.

## Planned Endpoints

| Endpoint id | Route | Method | Auth before payment | Status |
|---|---|---|---|---|
| `paid-brief-export` | `/api/x402/protected/briefs/:id` | `GET` | Privy user | planned |
| `paid-agent-run` | `/api/x402/protected/agents/runs/:id` | `GET` | Artifact owner | planned |

Both endpoints are metadata-only in this handoff. Resource URLs, prices,
destination addresses, facilitator URLs, and asset contract or mint addresses
remain operator-owned placeholders.

## x402 V2 Headers

The x402 V2 docs define these payment headers:

| Header | Direction | Handoff use |
|---|---|---|
| `PAYMENT-REQUIRED` | server to client | Future HTTP 402 challenge payload. |
| `PAYMENT-SIGNATURE` | client to server | Future payment payload retry header. |
| `PAYMENT-RESPONSE` | server to client | Future settlement response header. |

References:

- https://docs.x402.org/core-concepts/http-402
- https://docs.x402.org/core-concepts/facilitator
- https://docs.x402.org/extensions/payment-identifier

## Required Enforcement Work

Before any protected route becomes live, the x402 swarm must implement and test:

1. HTTP 402 challenge generation from the approved discovery record.
2. `PAYMENT-SIGNATURE` parsing without storing raw payment payloads.
3. Facilitator `/verify` and `/settle` integration or a reviewed local verifier.
4. Replay protection keyed by endpoint, actor, resource, and payment identifier.
5. Audit writes using hashes and statuses only.
6. Failure semantics for verify failure, settlement failure, replay, and refund
   or non-delivery cases.
7. Privacy review for resource URLs and payment metadata.
8. Operator-owned price, destination address, network, and asset configuration.

## Audit Boundary

The audit fixture covers the lifecycle outcomes the later implementation must
record:

- `challenge_issued`
- `verify_failed`
- `verify_passed`
- `settle_failed`
- `settle_passed`
- `replay_blocked`

Audit events must persist hashes, endpoint ids, actor ids, statuses, and timing
metadata only. They must not persist raw payment payloads, signed transactions,
wallet secrets, or private key material.

## Stop Conditions

- `X402_ENABLED` is true before operator approval.
- Any route settles, verifies, or unlocks paid content before the enforcement
  PR passes.
- Audit records contain raw payment payloads or wallet secrets.
- Endpoint prices, destination addresses, facilitator URLs, or asset contracts
  are hard-coded as production values in repository fixtures.

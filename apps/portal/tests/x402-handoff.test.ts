import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GET as x402Get } from "../app/api/x402/discovery/route";

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("x402 discovery fixture is a non-enforcing handoff contract mirrored by the route", async () => {
  const fixture = await readJson("apps/portal/tests/fixtures/x402-discovery.v1.json");
  assert.equal(fixture.version, "fieldtheory.x402-discovery.v1");
  assert.equal(fixture.enabled, false);
  assert.equal(fixture.enforcement, "disabled");
  assert.equal(fixture.settlement, "not-implemented");

  const endpoints = asArray(fixture.endpoints);
  assert.equal(endpoints.length, 2);
  for (const item of endpoints) {
    const endpoint = asRecord(item);
    assert.equal(typeof endpoint.id, "string");
    assert.match(asString(endpoint.route), /^\/api\/x402\/protected\//);
    assert.equal(endpoint.method, "GET");
    assert.equal(endpoint.status, "planned");
    assert.equal(endpoint.enforcement, "disabled");
    assert.equal(endpoint.pricePolicyOwner, "operator-required");
    assert.equal(endpoint.privacy, "metadata-only");
    assert.deepEqual(endpoint.headers, ["PAYMENT-REQUIRED", "PAYMENT-SIGNATURE", "PAYMENT-RESPONSE"]);
    assert.equal(asRecord(endpoint.facilitator).status, "undecided");
    const accepts = asArray(endpoint.accepts);
    assert.ok(accepts.length >= 2);
    assert.ok(accepts.some((item) => asRecord(item).networkId === "base-sepolia"));
    assert.ok(accepts.some((item) => asRecord(item).networkId === "solana-devnet"));
    for (const payment of accepts) {
      assert.equal(asRecord(payment).scheme, "exact");
      assert.equal(typeof asRecord(payment).maxAmountRequired, "string");
      assert.match(asString(asRecord(payment).payTo), /^operator-required:/);
      assert.match(asString(asRecord(payment).resource), /^https:\/\/fieldtheory\.example\/api\/x402\/protected\//);
    }
  }

  const response = await x402Get();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, fixture);
});

test("x402 audit fixture covers payment lifecycle without raw payment payloads", async () => {
  const fixture = await readJson("apps/portal/tests/fixtures/x402-audit-events.v1.json");
  assert.equal(fixture.version, "fieldtheory.x402-audit-events.v1");
  const events = asArray(fixture.events);
  assert.deepEqual(events.map((event) => asRecord(event).outcome), [
    "challenge_issued",
    "verify_failed",
    "verify_passed",
    "settle_failed",
    "settle_passed",
    "replay_blocked",
  ]);

  for (const event of events) {
    const record = asRecord(event);
    assert.equal(record.rawPaymentPayload, undefined);
    assert.equal(record.paymentSignature, undefined);
    assert.equal(record.signedTransaction, undefined);
    assert.equal(record.privateKey, undefined);
    assert.match(asString(record.paymentRequirementHash), /^sha256:[a-f0-9]{64}$/);
    if (record.paymentPayloadHash !== null) {
      assert.match(asString(record.paymentPayloadHash), /^sha256:[a-f0-9]{64}$/);
    }
    assert.equal(typeof record.endpointId, "string");
    assert.equal(typeof record.actorUserId, "string");
    assert.equal(typeof record.status, "string");
  }
});

test("x402 handoff document names V2 headers and keeps enforcement disabled", async () => {
  const document = await readText("docs/handoff/x402-milestone-3.md");
  assert.match(document, /PAYMENT-REQUIRED/);
  assert.match(document, /PAYMENT-SIGNATURE/);
  assert.match(document, /PAYMENT-RESPONSE/);
  assert.match(document, /X402_ENABLED=false/);
  assert.doesNotMatch(document, /X-402-/);
});

async function readJson(path: string): Promise<JsonRecord> {
  return JSON.parse(await readText(path)) as JsonRecord;
}

async function readText(path: string): Promise<string> {
  return readFile(resolve(repoRoot, path), "utf8");
}

function asRecord(value: unknown): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function asString(value: unknown): string {
  assert.equal(typeof value, "string");
  return value as string;
}

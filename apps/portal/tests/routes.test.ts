import test from "node:test";
import assert from "node:assert/strict";
import { GET as healthGet } from "../app/api/health/route";
import { GET as contractsGet } from "../app/api/contracts/route";
import { POST as briefValidatePost } from "../app/api/briefs/validate/route";
import { POST as exportValidatePost } from "../app/api/exports/validate/route";
import { GET as importGet } from "../app/api/artifacts/imports/[id]/route";
import { GET as agentsGet } from "../app/api/agents/route";
import { GET as runsGet, POST as runsPost } from "../app/api/agents/runs/route";
import { GET as runGet } from "../app/api/agents/runs/[id]/route";
import { POST as gordoPlanPost } from "../app/api/gordo/import-plan/route";
import { POST as hermesPlanPost } from "../app/api/hermes/import-plan/route";
import { GET as x402Get } from "../app/api/x402/discovery/route";
import { setPrivyUserResolverForTests, setPrivyVerifierForTests } from "../src/lib/auth";
import { closePostgresHostedStoreForTests } from "../src/lib/postgres-store";
import { requireMutableStore } from "../src/lib/store-guard";
import { getHostedStore, hostedStore, MemoryHostedStore } from "../src/lib/store";
import { validAeonManifest, validBriefPack, validHermesManifest } from "./fixtures";

const previousEnv = {
  PRIVY_APP_ID: process.env.PRIVY_APP_ID,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
  PRIVY_JWT_VERIFICATION_KEY: process.env.PRIVY_JWT_VERIFICATION_KEY,
  PRIVY_DEV_ALLOW_UNSIGNED: process.env.PRIVY_DEV_ALLOW_UNSIGNED,
  FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE: process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  X402_ENABLED: process.env.X402_ENABLED,
  FIELD_THEORY_REQUIRE_LINKED_IDENTITIES: process.env.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES,
  FIELD_THEORY_BASE_CHAIN_ID: process.env.FIELD_THEORY_BASE_CHAIN_ID,
  FIELD_THEORY_SOLANA_CLUSTER: process.env.FIELD_THEORY_SOLANA_CLUSTER,
};

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
});

test.afterEach(async () => {
  hostedStore.resetForTests();
  setPrivyUserResolverForTests(undefined);
  setPrivyVerifierForTests(undefined);
  await closePostgresHostedStoreForTests();
  restoreEnv();
});

test("public health and contract routes do not require auth", async () => {
  process.env.X402_ENABLED = "true";
  delete process.env.PRIVY_APP_ID;
  delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.DATABASE_URL;
  setEnv("NODE_ENV", "production");

  const health = await healthGet();
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.status, "configuration_required");
  assert.equal(healthBody.readiness.production, true);
  assert.equal(healthBody.readiness.authConfigured, false);
  assert.equal(healthBody.readiness.durableStoreConfigured, false);
  assert.equal(healthBody.readiness.mutableRoutesReady, false);
  assert.equal(healthBody.readiness.walletLinking, "deferred");
  assert.equal(healthBody.x402Enabled, false);
  assert.equal(healthBody.x402Requested, true);

  const contracts = await contractsGet();
  const body = await contracts.json();
  assert.equal(contracts.status, 200);
  assert.equal(body.contracts.brief, "agent-brief-pack.v1");
});

test("health reports mutable routes ready only after production dependencies are configured", async () => {
  setEnv("NODE_ENV", "production");
  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  process.env.DATABASE_URL = "postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory";

  const health = await healthGet();
  const body = await health.json();
  assert.equal(health.status, 200);
  assert.equal(body.status, "configuration_ready");
  assert.equal(body.readiness.authConfigured, true);
  assert.equal(body.readiness.durableStoreConfigured, true);
  assert.equal(body.readiness.mutableStoreReady, true);
  assert.equal(body.readiness.mutableRoutesReady, true);
  assert.equal(body.readiness.schema, "requires_external_migration_proof");
});

test("protected routes fail closed when Privy server config is absent", async () => {
  delete process.env.PRIVY_APP_ID;
  delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_DEV_ALLOW_UNSIGNED;

  const response = await agentsGet(new Request("http://localhost/api/agents"));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "auth_not_configured");
});

test("protected routes accept a verified Privy access token", async () => {
  enableMockPrivyAuth("privy-user-a");

  const response = await agentsGet(authRequest("http://localhost/api/agents", {}, "privy.valid"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.actor.id, "privy-user-a");
  assert.deepEqual(body.actor.identities, []);
  assert.equal(body.actor.identityPolicyStatus, "deferred");
});

test("development auth does not fabricate linked GitHub or wallet identities", async () => {
  enableDevAuth();

  const response = await agentsGet(authRequest("http://localhost/api/agents"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.actor.id, "operator");
  assert.deepEqual(body.actor.identities, []);
  assert.equal(body.actor.identityPolicyStatus, "deferred");
});

test("linked identity policy reports satisfied for GitHub, Base EVM, and Solana accounts", async () => {
  enableMockPrivyAuth("privy-user-a");
  enableLinkedIdentityPolicy();
  setPrivyUserResolverForTests(async () => ({
    linked_accounts: [
      { type: "github_oauth", subject: "12345", username: "operator", verified_at: 1 },
      { type: "wallet", chain_type: "ethereum", chain_id: "8453", address: "0xABCDEF", verified_at: 2 },
      { type: "wallet", chain_type: "solana", address: "So11111111111111111111111111111111111111112", verified_at: 3 },
    ],
  }));

  const response = await agentsGet(authRequest("http://localhost/api/agents", {}, "privy.valid"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.actor.identities, ["github", "evm", "solana"]);
  assert.equal(body.actor.identityPolicyStatus, "satisfied");
  assert.deepEqual(body.actor.identityPolicy.missing, []);
  assert.deepEqual(body.actor.identityPolicy.required, ["github", "base_evm:8453", "solana:mainnet-beta"]);
});

test("agent run creation rejects unsatisfied linked identity policy before store writes", async () => {
  enableMockPrivyAuth("privy-user-a");
  enableLinkedIdentityPolicy();
  setPrivyUserResolverForTests(async () => ({
    linked_accounts: [
      { type: "github_oauth", subject: "12345", username: "operator", verified_at: 1 },
      { type: "wallet", chain_type: "ethereum", chain_id: "1", address: "0xABCDEF", verified_at: 2 },
    ],
  }));

  const response = await runsPost(authJsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: "import_missing",
    mode: "dry-run",
  }, "privy.valid"));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "identity_policy_unsatisfied");
  assert.deepEqual(body.identityPolicy.missing, ["base_evm:8453", "solana:mainnet-beta"]);
  assert.equal(body.auditEvents.length, 1);
  assert.equal(body.auditEvents[0].action, "agent.run.create");
  assert.equal(body.auditEvents[0].targetType, "identity_policy");
  assert.equal(body.auditEvents[0].targetId, "agent.run.create");
  assert.equal(body.auditEvents[0].outcome, "blocked");
  assert.doesNotMatch(JSON.stringify(body), /12345|0xABCDEF|operator/);
  assert.equal(hostedStore.listAuditEvents().length, 1);
});

test("required linked identity policy records blocked audit events without write payloads", async () => {
  enableMockPrivyAuth("privy-user-a");
  enableLinkedIdentityPolicy();
  setPrivyUserResolverForTests(async () => ({
    linked_accounts: [
      { type: "github_oauth", subject: "12345", username: "operator", verified_at: 1 },
      { type: "wallet", chain_type: "ethereum", chain_id: "1", address: "0xABCDEF", verified_at: 2 },
    ],
  }));

  const cases: Array<{ name: string; action: string; request: () => Promise<Response> }> = [
    { name: "brief validate", action: "brief.validate", request: () => briefValidatePost(authJsonRequest("/api/briefs/validate", validBriefPack(), "privy.valid")) },
    { name: "export validate", action: "export.validate", request: () => exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "privy.valid")) },
    { name: "gordo import plan", action: "gordo.import_plan", request: () => gordoPlanPost(authJsonRequest("/api/gordo/import-plan", validAeonManifest(), "privy.valid")) },
    { name: "hermes import plan", action: "hermes.import_plan", request: () => hermesPlanPost(authJsonRequest("/api/hermes/import-plan", validHermesManifest(), "privy.valid")) },
  ];

  for (const item of cases) {
    hostedStore.resetForTests();
    const response = await item.request();
    const body = await response.json();
    assert.equal(response.status, 403, item.name);
    assert.equal(body.error.code, "identity_policy_unsatisfied", item.name);
    assert.equal(body.import, undefined, item.name);
    assert.equal(body.plan, undefined, item.name);
    assert.equal(body.auditEvents.length, 1, item.name);
    assert.equal(body.auditEvents[0].action, item.action, item.name);
    assert.equal(body.auditEvents[0].targetType, "identity_policy", item.name);
    assert.equal(body.auditEvents[0].targetId, item.action, item.name);
    assert.equal(body.auditEvents[0].outcome, "blocked", item.name);
    assert.doesNotMatch(JSON.stringify(body), /12345|0xABCDEF|operator/, item.name);
    assert.equal(hostedStore.listAuditEvents().length, 1, item.name);
  }
});

test("required linked identity policy returns a closed error when Privy identity resolution fails", async () => {
  enableMockPrivyAuth("privy-user-a");
  enableLinkedIdentityPolicy();
  setPrivyUserResolverForTests(async () => {
    throw new Error("Privy unavailable");
  });

  const response = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "privy.valid"));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "identity_resolution_failed");
  assert.equal(hostedStore.listAuditEvents().length, 0);
});

test("development auth cannot satisfy required linked identity policy", async () => {
  enableDevAuth();
  enableLinkedIdentityPolicy();

  const response = await agentsGet(authRequest("http://localhost/api/agents"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.actor.identityPolicyStatus, "unsatisfied");
  assert.deepEqual(body.actor.identityPolicy.missing, ["github", "base_evm:8453", "solana:mainnet-beta"]);
});

test("production rejects unsigned development tokens", async () => {
  enableDevAuth();
  setEnv("NODE_ENV", "production");
  setPrivyVerifierForTests(async () => {
    throw new Error("dev token is not a real Privy token");
  });

  const response = await agentsGet(authRequest("http://localhost/api/agents"));
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "privy_token_invalid");
});

test("brief validation writes an import and audit event in development auth mode", async () => {
  enableDevAuth();
  const response = await briefValidatePost(jsonRequest("/api/briefs/validate", validBriefPack()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.report.valid, true);
  assert.match(body.import.id, /^import_/);
  assert.equal(JSON.stringify(body.import).includes("/tmp/out"), false);
  assert.equal(JSON.stringify(body.import).includes("path"), false);
  assert.equal(hostedStore.listAuditEvents().length, 1);
});

test("protected mutation routes fail closed in production without a durable store", async () => {
  enableMockPrivyAuth("operator");
  setEnv("NODE_ENV", "production");
  delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;

  const response = await briefValidatePost(authJsonRequest("/api/briefs/validate", validBriefPack(), "privy.valid"));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "durable_store_not_configured");
});

test("production mutable-store guard ignores memory override", () => {
  setEnv("NODE_ENV", "production");
  process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE = "true";
  delete process.env.DATABASE_URL;

  const response = requireMutableStore();
  assert.equal(response?.status, 503);
});

test("production mutable-store guard allows configured durable database", () => {
  setEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory";
  delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;

  assert.equal(requireMutableStore(), null);
});

test("production store selection ignores memory override when database is configured", () => {
  setEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgres://fieldtheory:fieldtheory@127.0.0.1:5432/fieldtheory";
  process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE = "true";

  assert.notEqual(getHostedStore(), hostedStore);
});

test("oversized JSON bodies are rejected before parsing", async () => {
  enableDevAuth();
  const response = await briefValidatePost(authRequest("http://localhost/api/briefs/validate", {
    method: "POST",
    body: "{}",
    headers: {
      "content-type": "application/json",
      "content-length": String(256 * 1024 + 1),
    },
  }));
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.equal(body.error.code, "body_too_large");
});

test("export validation plus dry-run creation returns a run envelope", async () => {
  enableDevAuth();
  const validate = await exportValidatePost(jsonRequest("/api/exports/validate", validAeonManifest()));
  const importBody = await validate.json();
  assert.equal(validate.status, 200);

  const createRun = await runsPost(jsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: importBody.import.id,
    mode: "dry-run",
  }));
  const runBody = await createRun.json();
  assert.equal(createRun.status, 201);
  assert.equal(runBody.run.target, "aeon");
  assert.equal(runBody.run.resultEnvelope.plan.applyEnabled, false);
  assert.equal(runBody.run.resultEnvelope.plan.source.runId, "aeon-20260531T130000Z");
  assert.ok(runBody.run.resultEnvelope.plan.source.fileRelPaths.some((file: string) => file.endsWith("/aeon/aeon.yml.draft")));
  assert.equal(runBody.auditEvents.length, 1);
  assert.equal(runBody.auditEvents[0].action, "agent.run.create");
  assert.equal(runBody.auditEvents[0].targetId, runBody.run.id);

  const readRun = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  const readRunBody = await readRun.json();
  assert.equal(readRun.status, 200);
  assert.equal(readRunBody.auditEvents.length, 1);
  assert.equal(readRunBody.auditEvents[0].action, "agent.run.create");
  assert.equal(readRunBody.auditEvents[0].targetId, runBody.run.id);

  const userBRead = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`, {}, "dev:other"), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  assert.equal(userBRead.status, 404);
});

test("artifact import detail returns a sanitized owner-scoped import and audit envelope", async () => {
  enableDevAuth();
  const validate = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "dev:user-a"));
  const validateBody = await validate.json();
  assert.equal(validate.status, 200);

  const readImport = await importGet(authRequest(`http://localhost/api/artifacts/imports/${validateBody.import.id}`, {}, "dev:user-a"), {
    params: Promise.resolve({ id: validateBody.import.id }),
  });
  const body = await readImport.json();
  assert.equal(readImport.status, 200);
  assert.equal(body.import.id, validateBody.import.id);
  assert.equal(body.import.ownerUserId, "user-a");
  assert.equal(body.import.exportSummary.target, "aeon");
  assert.equal(body.import.exportSummary.runId, "aeon-20260531T130000Z");
  assert.equal(JSON.stringify(body.import).includes("/tmp/out"), false);
  assert.equal(JSON.stringify(body.import).includes("\"path\""), false);
  assert.equal(body.auditEvents.length, 1);
  assert.equal(body.auditEvents[0].action, "export.validate");
  assert.equal(body.auditEvents[0].targetType, "artifact_import");
  assert.equal(body.auditEvents[0].targetId, validateBody.import.id);

  const userBRead = await importGet(authRequest(`http://localhost/api/artifacts/imports/${validateBody.import.id}`, {}, "dev:user-b"), {
    params: Promise.resolve({ id: validateBody.import.id }),
  });
  assert.equal(userBRead.status, 404);
});

test("agent run creation replays owner-scoped idempotency keys without duplicate audits", async () => {
  enableDevAuth();
  const validate = await exportValidatePost(jsonRequest("/api/exports/validate", validAeonManifest()));
  const importBody = await validate.json();
  const requestBody = {
    target: "aeon",
    importId: importBody.import.id,
    mode: "dry-run",
    idempotencyKey: "retry:aeon:operator:001",
  };

  const first = await runsPost(jsonRequest("/api/agents/runs", requestBody));
  const firstBody = await first.json();
  const second = await runsPost(jsonRequest("/api/agents/runs", requestBody));
  const secondBody = await second.json();

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(firstBody.idempotentReplay, false);
  assert.equal(secondBody.idempotentReplay, true);
  assert.equal(secondBody.run.id, firstBody.run.id);
  assert.equal(secondBody.run.createdAt, firstBody.run.createdAt);
  assert.equal(secondBody.run.idempotencyKey, "retry:aeon:operator:001");
  assert.equal(firstBody.auditEvents.length, 1);
  assert.equal(secondBody.auditEvents.length, 1);
  assert.equal(secondBody.auditEvents[0].id, firstBody.auditEvents[0].id);
  assert.equal(hostedStore.listAuditEvents().filter((event) => event.action === "agent.run.create").length, 1);

  const conflict = await runsPost(jsonRequest("/api/agents/runs", {
    ...requestBody,
    target: "hermes",
  }));
  const conflictBody = await conflict.json();
  assert.equal(conflict.status, 409);
  assert.equal(conflictBody.error.code, "idempotency_conflict");
  assert.equal(hostedStore.listAuditEvents().filter((event) => event.action === "agent.run.create").length, 1);
});

test("agent run index returns owner-scoped recent runs with audit events", async () => {
  enableDevAuth();
  const aeonImport = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "dev:user-a"));
  const aeonImportBody = await aeonImport.json();
  const hermesImport = await exportValidatePost(authJsonRequest("/api/exports/validate", validHermesManifest(), "dev:user-a"));
  const hermesImportBody = await hermesImport.json();
  const otherImport = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "dev:user-b"));
  const otherImportBody = await otherImport.json();

  const aeonRun = await runsPost(authJsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: aeonImportBody.import.id,
    mode: "dry-run",
  }, "dev:user-a"));
  const aeonRunBody = await aeonRun.json();
  const hermesRun = await runsPost(authJsonRequest("/api/agents/runs", {
    target: "hermes",
    importId: hermesImportBody.import.id,
    mode: "dry-run",
  }, "dev:user-a"));
  const hermesRunBody = await hermesRun.json();
  await runsPost(authJsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: otherImportBody.import.id,
    mode: "dry-run",
  }, "dev:user-b"));

  const response = await runsGet(authRequest("http://localhost/api/agents/runs", {}, "dev:user-a"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 2);
  assert.deepEqual(
    body.runs.map((item: { run: { id: string } }) => item.run.id).sort(),
    [aeonRunBody.run.id, hermesRunBody.run.id].sort(),
  );
  assert.ok(body.runs.every((item: { run: { ownerUserId: string } }) => item.run.ownerUserId === "user-a"));
  assert.ok(body.runs.every((item: { auditEvents: Array<{ action: string; targetId: string }> }) => item.auditEvents.length === 1));
  assert.ok(body.runs.every((item: { run: { id: string }; auditEvents: Array<{ action: string; targetId: string }> }) => (
    item.auditEvents[0].action === "agent.run.create" && item.auditEvents[0].targetId === item.run.id
  )));
  assert.equal(body.count, 2);
});

test("run detail returns a JSON error when the durable store is unavailable", async () => {
  enableMockPrivyAuth("operator");
  setEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgres://fieldtheory:fieldtheory@127.0.0.1:1/fieldtheory";
  delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;

  const response = await runGet(authRequest("http://localhost/api/agents/runs/run_missing", {}, "privy.valid"), {
    params: Promise.resolve({ id: "run_missing" }),
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "store_schema_not_ready");
});

test("same artifact imports are owner-scoped", async () => {
  enableDevAuth();

  const first = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "dev:user-a"));
  const firstBody = await first.json();
  const second = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest(), "dev:user-b"));
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.import.sha256, secondBody.import.sha256);
  assert.notEqual(firstBody.import.id, secondBody.import.id);
  assert.equal(firstBody.import.ownerUserId, "user-a");
  assert.equal(secondBody.import.ownerUserId, "user-b");

  const crossUserRun = await runsPost(authJsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: firstBody.import.id,
    mode: "dry-run",
  }, "dev:user-b"));
  assert.equal(crossUserRun.status, 404);

  const ownRun = await runsPost(authJsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: secondBody.import.id,
    mode: "dry-run",
  }, "dev:user-b"));
  assert.equal(ownRun.status, 201);
});

test("agent run creation rejects target mismatches", async () => {
  enableDevAuth();
  const validate = await exportValidatePost(jsonRequest("/api/exports/validate", validAeonManifest()));
  const importBody = await validate.json();

  const response = await runsPost(jsonRequest("/api/agents/runs", {
    target: "hermes",
    importId: importBody.import.id,
    mode: "dry-run",
  }));
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error.code, "target_mismatch");
});

test("agent run creation rejects apply mode", async () => {
  enableDevAuth();
  const validate = await exportValidatePost(jsonRequest("/api/exports/validate", validAeonManifest()));
  const importBody = await validate.json();

  const response = await runsPost(jsonRequest("/api/agents/runs", {
    target: "aeon",
    importId: importBody.import.id,
    mode: "apply-plan",
  }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "apply_disabled");
});

test("Gordo import plan stays dry-run and x402 discovery stays disabled", async () => {
  enableDevAuth();
  const planResponse = await gordoPlanPost(jsonRequest("/api/gordo/import-plan", validAeonManifest()));
  const planBody = await planResponse.json();
  assert.equal(planResponse.status, 200);
  assert.equal(planBody.plan.dryRun, true);
  assert.equal(planBody.plan.applyEnabled, false);
  assert.equal(planBody.plan.source.runId, "aeon-20260531T130000Z");

  const x402 = await x402Get();
  const x402Body = await x402.json();
  assert.equal(x402.status, 200);
  assert.equal(x402Body.enabled, false);
  assert.equal(x402Body.settlement, "not-implemented");
});

test("target-specific import plans reject mismatched manifests", async () => {
  enableDevAuth();

  const gordoMismatch = await gordoPlanPost(jsonRequest("/api/gordo/import-plan", validHermesManifest()));
  assert.equal(gordoMismatch.status, 422);
  assert.equal((await gordoMismatch.json()).error.code, "target_mismatch");

  const hermesMismatch = await hermesPlanPost(jsonRequest("/api/hermes/import-plan", validAeonManifest()));
  assert.equal(hermesMismatch.status, 422);
  assert.equal((await hermesMismatch.json()).error.code, "target_mismatch");

  const hermesPlan = await hermesPlanPost(jsonRequest("/api/hermes/import-plan", validHermesManifest()));
  const hermesBody = await hermesPlan.json();
  assert.equal(hermesPlan.status, 200);
  assert.equal(hermesBody.plan.source.runId, "hermes-20260531T130000Z");
  assert.ok(hermesBody.plan.source.fileRelPaths.some((file: string) => file.endsWith("/hermes/task-payload.dry-run.json")));
});

test("target-specific import plans return ok false for invalid manifests", async () => {
  enableDevAuth();

  const invalidManifest = { version: "fieldtheory.agent-export.v1", target: "aeon" };
  const gordoInvalid = await gordoPlanPost(jsonRequest("/api/gordo/import-plan", invalidManifest));
  const gordoBody = await gordoInvalid.json();
  assert.equal(gordoInvalid.status, 422);
  assert.equal(gordoBody.ok, false);
  assert.equal(gordoBody.report.valid, false);

  const hermesInvalid = await hermesPlanPost(jsonRequest("/api/hermes/import-plan", invalidManifest));
  const hermesBody = await hermesInvalid.json();
  assert.equal(hermesInvalid.status, 422);
  assert.equal(hermesBody.ok, false);
  assert.equal(hermesBody.report.valid, false);
});

test("agent run ids are unique when runs are created in the same millisecond", async () => {
  const store = new MemoryHostedStore();
  const originalDate = globalThis.Date;
  const fixedIso = "2026-06-01T00:00:00.000Z";
  const fixedTime = originalDate.parse(fixedIso);

  class FixedDate extends originalDate {
    constructor(value?: string | number | Date) {
      super(value ?? fixedIso);
    }

    static now(): number {
      return fixedTime;
    }
  }

  (globalThis as { Date: DateConstructor }).Date = FixedDate as DateConstructor;
  try {
    const runInput = {
      ownerUserId: "operator",
      target: "aeon" as const,
      mode: "dry-run" as const,
      importId: "import_same",
      resultEnvelope: { plan: { dryRun: true } },
    };
    const first = await store.createRun(runInput);
    const second = await store.createRun(runInput);

    assert.notEqual(first.id, second.id);
    assert.equal(first.createdAt, fixedIso);
    assert.equal(second.createdAt, fixedIso);
  } finally {
    (globalThis as { Date: DateConstructor }).Date = originalDate;
  }
});

function jsonRequest(path: string, body: unknown): Request {
  return authJsonRequest(path, body, "dev:operator");
}

function authJsonRequest(path: string, body: unknown, token: string): Request {
  return authRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }, token);
}

function authRequest(url: string, init: RequestInit = {}, token = "dev:operator"): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers),
      authorization: `Bearer ${token}`,
    },
  });
}

function enableDevAuth(): void {
  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  process.env.PRIVY_DEV_ALLOW_UNSIGNED = "true";
}

function enableMockPrivyAuth(userId: string): void {
  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  delete process.env.PRIVY_DEV_ALLOW_UNSIGNED;
  setPrivyVerifierForTests(async () => ({
    app_id: "test-app",
    issuer: "privy.io",
    issued_at: 1,
    expiration: 4_102_444_800,
    session_id: "session_test",
    user_id: userId,
  }));
}

function enableLinkedIdentityPolicy(): void {
  process.env.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES = "true";
  process.env.FIELD_THEORY_BASE_CHAIN_ID = "8453";
  process.env.FIELD_THEORY_SOLANA_CLUSTER = "mainnet-beta";
}

function restoreEnv(): void {
  if (previousEnv.PRIVY_APP_ID === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = previousEnv.PRIVY_APP_ID;
  if (previousEnv.NEXT_PUBLIC_PRIVY_APP_ID === undefined) delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  else process.env.NEXT_PUBLIC_PRIVY_APP_ID = previousEnv.NEXT_PUBLIC_PRIVY_APP_ID;
  if (previousEnv.PRIVY_APP_SECRET === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = previousEnv.PRIVY_APP_SECRET;
  if (previousEnv.PRIVY_JWT_VERIFICATION_KEY === undefined) delete process.env.PRIVY_JWT_VERIFICATION_KEY;
  else process.env.PRIVY_JWT_VERIFICATION_KEY = previousEnv.PRIVY_JWT_VERIFICATION_KEY;
  if (previousEnv.PRIVY_DEV_ALLOW_UNSIGNED === undefined) delete process.env.PRIVY_DEV_ALLOW_UNSIGNED;
  else process.env.PRIVY_DEV_ALLOW_UNSIGNED = previousEnv.PRIVY_DEV_ALLOW_UNSIGNED;
  if (previousEnv.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE === undefined) delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;
  else process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE = previousEnv.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;
  if (previousEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousEnv.DATABASE_URL;
  if (previousEnv.X402_ENABLED === undefined) delete process.env.X402_ENABLED;
  else process.env.X402_ENABLED = previousEnv.X402_ENABLED;
  if (previousEnv.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES === undefined) delete process.env.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES;
  else process.env.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES = previousEnv.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES;
  if (previousEnv.FIELD_THEORY_BASE_CHAIN_ID === undefined) delete process.env.FIELD_THEORY_BASE_CHAIN_ID;
  else process.env.FIELD_THEORY_BASE_CHAIN_ID = previousEnv.FIELD_THEORY_BASE_CHAIN_ID;
  if (previousEnv.FIELD_THEORY_SOLANA_CLUSTER === undefined) delete process.env.FIELD_THEORY_SOLANA_CLUSTER;
  else process.env.FIELD_THEORY_SOLANA_CLUSTER = previousEnv.FIELD_THEORY_SOLANA_CLUSTER;
  setEnv("NODE_ENV", previousEnv.NODE_ENV);
}

function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

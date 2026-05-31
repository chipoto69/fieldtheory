import test from "node:test";
import assert from "node:assert/strict";
import { GET as healthGet } from "../app/api/health/route";
import { GET as contractsGet } from "../app/api/contracts/route";
import { POST as briefValidatePost } from "../app/api/briefs/validate/route";
import { POST as exportValidatePost } from "../app/api/exports/validate/route";
import { GET as agentsGet } from "../app/api/agents/route";
import { POST as runsPost } from "../app/api/agents/runs/route";
import { GET as runGet } from "../app/api/agents/runs/[id]/route";
import { POST as gordoPlanPost } from "../app/api/gordo/import-plan/route";
import { POST as hermesPlanPost } from "../app/api/hermes/import-plan/route";
import { GET as x402Get } from "../app/api/x402/discovery/route";
import { setPrivyVerifierForTests } from "../src/lib/auth";
import { requireMutableStore } from "../src/lib/store-guard";
import { getHostedStore, hostedStore } from "../src/lib/store";
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
};

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
});

test.afterEach(() => {
  hostedStore.resetForTests();
  setPrivyVerifierForTests(undefined);
  restoreEnv();
});

test("public health and contract routes do not require auth", async () => {
  process.env.X402_ENABLED = "true";
  const health = await healthGet();
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.status, "ready");
  assert.equal(healthBody.x402Enabled, false);
  assert.equal(healthBody.x402Requested, true);

  const contracts = await contractsGet();
  const body = await contracts.json();
  assert.equal(contracts.status, 200);
  assert.equal(body.contracts.brief, "agent-brief-pack.v1");
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

  const readRun = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  assert.equal(readRun.status, 200);

  const userBRead = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`, {}, "dev:other"), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  assert.equal(userBRead.status, 404);
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
  setEnv("NODE_ENV", previousEnv.NODE_ENV);
}

function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

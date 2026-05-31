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
import { GET as x402Get } from "../app/api/x402/discovery/route";
import { hostedStore } from "../src/lib/store";
import { validAeonManifest, validBriefPack } from "./fixtures";

const previousEnv = {
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
  PRIVY_DEV_ALLOW_UNSIGNED: process.env.PRIVY_DEV_ALLOW_UNSIGNED,
  FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE: process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE,
  NODE_ENV: process.env.NODE_ENV,
};

test.afterEach(() => {
  hostedStore.resetForTests();
  restoreEnv();
});

test("public health and contract routes do not require auth", async () => {
  const health = await healthGet();
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ready");

  const contracts = await contractsGet();
  const body = await contracts.json();
  assert.equal(contracts.status, 200);
  assert.equal(body.contracts.brief, "agent-brief-pack.v1");
});

test("protected routes fail closed when Privy server config is absent", async () => {
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_DEV_ALLOW_UNSIGNED;

  const response = await agentsGet(new Request("http://localhost/api/agents"));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "auth_not_configured");
});

test("brief validation writes an import and audit event in development auth mode", async () => {
  enableDevAuth();
  const response = await briefValidatePost(jsonRequest("/api/briefs/validate", validBriefPack()));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.report.valid, true);
  assert.match(body.import.id, /^import_/);
  assert.equal(hostedStore.listAuditEvents().length, 1);
});

test("protected mutation routes fail closed in production without a durable store", async () => {
  enableDevAuth();
  setEnv("NODE_ENV", "production");
  delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;

  const response = await briefValidatePost(jsonRequest("/api/briefs/validate", validBriefPack()));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "durable_store_not_configured");
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

  const readRun = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  assert.equal(readRun.status, 200);

  const userBRead = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`, {}, "dev:other"), {
    params: Promise.resolve({ id: runBody.run.id }),
  });
  assert.equal(userBRead.status, 404);
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

  const x402 = await x402Get();
  const x402Body = await x402.json();
  assert.equal(x402.status, 200);
  assert.equal(x402Body.enabled, false);
  assert.equal(x402Body.settlement, "not-implemented");
});

function jsonRequest(path: string, body: unknown): Request {
  return authRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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
  process.env.PRIVY_APP_SECRET = "test-secret";
  process.env.PRIVY_DEV_ALLOW_UNSIGNED = "true";
}

function restoreEnv(): void {
  if (previousEnv.PRIVY_APP_SECRET === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = previousEnv.PRIVY_APP_SECRET;
  if (previousEnv.PRIVY_DEV_ALLOW_UNSIGNED === undefined) delete process.env.PRIVY_DEV_ALLOW_UNSIGNED;
  else process.env.PRIVY_DEV_ALLOW_UNSIGNED = previousEnv.PRIVY_DEV_ALLOW_UNSIGNED;
  if (previousEnv.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE === undefined) delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;
  else process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE = previousEnv.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;
  setEnv("NODE_ENV", previousEnv.NODE_ENV);
}

function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

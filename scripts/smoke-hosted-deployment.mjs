#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_TOKEN_ENV = "FIELD_THEORY_SMOKE_BEARER_TOKEN";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = options.baseUrl ?? process.env.FIELD_THEORY_DEPLOYMENT_URL;
  const tokenEnv = options.tokenEnv ?? DEFAULT_TOKEN_ENV;
  const token = process.env[tokenEnv];
  const fixture = options.fixture ? JSON.parse(await readFile(options.fixture, "utf8")) : undefined;
  const report = await smokeHostedDeployment({
    baseUrl,
    token,
    fixture,
    allowHttp: options.allowHttp,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSmokeMarkdown(report));
  }

  if (report.status !== "passed") process.exitCode = 2;
}

export async function smokeHostedDeployment(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl, { allowHttp: options.allowHttp });
  const checks = [];
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available in this Node runtime.");

  const health = await requestJson(fetchImpl, baseUrl, "/api/health");
  addCheck(checks, validateHealth(health));

  const contracts = await requestJson(fetchImpl, baseUrl, "/api/contracts");
  addCheck(checks, validateContracts(contracts));

  const x402 = await requestJson(fetchImpl, baseUrl, "/api/x402/discovery");
  addCheck(checks, validateX402Discovery(x402));

  const unauthenticatedAgents = await requestJson(fetchImpl, baseUrl, "/api/agents", { parseJson: false });
  addCheck(checks, {
    id: "agents_unauthenticated",
    title: "Protected agents route fails closed without auth",
    status: unauthenticatedAgents.statusCode === 401 ? "pass" : "block",
    detail:
      unauthenticatedAgents.statusCode === 401
        ? "Unauthenticated /api/agents returned 401."
        : `Expected unauthenticated /api/agents to return 401; got ${unauthenticatedAgents.statusCode}.`,
    statusCode: unauthenticatedAgents.statusCode,
  });

  const hasToken = typeof options.token === "string" && options.token.trim().length > 0;
  if (hasToken || options.fixture !== undefined) {
    if (!hasToken || options.fixture === undefined) {
      addCheck(checks, {
        id: "authenticated_smoke_configuration",
        title: "Authenticated smoke inputs are complete",
        status: "block",
        detail: "Authenticated smoke requires both a bearer token env value and a fixture path.",
      });
    } else {
      await runAuthenticatedSmoke({ fetchImpl, baseUrl, token: options.token.trim(), fixture: options.fixture, checks });
    }
  }

  const blockers = checks.filter((check) => check.status === "block");
  return {
    version: "fieldtheory.hosted-smoke.v1",
    status: blockers.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    baseUrl: `${baseUrl.origin}${baseUrl.pathname.replace(/\/$/, "")}`,
    summary: {
      checkCount: checks.length,
      blockerCount: blockers.length,
      authenticated: hasToken && options.fixture !== undefined,
    },
    checks,
    blockers: blockers.map((check) => ({ id: check.id, title: check.title, detail: check.detail })),
  };
}

export function normalizeBaseUrl(value, options = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Missing deployment URL. Pass --base-url or set FIELD_THEORY_DEPLOYMENT_URL.");
  }
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Deployment URL must not contain credentials, query parameters, or fragments.");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (loopback || options.allowHttp))) {
    throw new Error("Deployment URL must use https, except loopback http smoke targets.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

export function formatSmokeMarkdown(report) {
  const lines = [
    "# Hosted Deployment Smoke",
    "",
    `Status: ${report.status}`,
    `Base URL: ${report.baseUrl}`,
    `Authenticated: ${report.summary.authenticated ? "yes" : "no"}`,
    "",
  ];
  if (report.blockers.length > 0) {
    lines.push("## Blockers", "");
    for (const blocker of report.blockers) lines.push(`- ${blocker.title}: ${blocker.detail}`);
    lines.push("");
  }
  lines.push("## Checks", "");
  for (const check of report.checks) {
    const code = check.statusCode ? ` (${check.statusCode})` : "";
    lines.push(`- ${check.status}${code}: ${check.title} — ${check.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

async function runAuthenticatedSmoke({ fetchImpl, baseUrl, token, fixture, checks }) {
  const headers = { Authorization: `Bearer ${token}` };
  const agents = await requestJson(fetchImpl, baseUrl, "/api/agents", { headers });
  const identityStatus = agents.json?.actor?.identityPolicyStatus;
  addCheck(checks, {
    id: "agents_authenticated",
    title: "Authenticated operator status resolves linked identity policy",
    status: agents.statusCode === 200 && identityStatus === "satisfied" ? "pass" : "block",
    detail:
      agents.statusCode === 200 && identityStatus === "satisfied"
        ? "Authenticated /api/agents returned a satisfied linked identity policy."
        : `Expected authenticated /api/agents to return 200 with identityPolicyStatus=satisfied; got ${agents.statusCode}.`,
    statusCode: agents.statusCode,
  });
  if (agents.statusCode !== 200 || identityStatus !== "satisfied") return;

  const validation = await requestJson(fetchImpl, baseUrl, "/api/briefs/validate", {
    method: "POST",
    headers,
    body: fixture,
  });
  const importId = typeof validation.json?.import?.id === "string" ? validation.json.import.id : undefined;
  addCheck(checks, {
    id: "brief_validate_authenticated",
    title: "Authenticated brief validation persists a valid import",
    status: validation.statusCode === 200 && validation.json?.report?.valid === true && Boolean(importId) ? "pass" : "block",
    detail:
      validation.statusCode === 200 && validation.json?.report?.valid === true && Boolean(importId)
        ? "Authenticated brief validation returned a valid import id."
        : `Expected authenticated brief validation to return 200 with report.valid=true and import.id; got ${validation.statusCode}.`,
    statusCode: validation.statusCode,
  });
  if (!importId) return;

  const run = await requestJson(fetchImpl, baseUrl, "/api/agents/runs", {
    method: "POST",
    headers,
    body: {
      target: "content-os",
      importId,
      mode: "dry-run",
      idempotencyKey: buildSmokeIdempotencyKey(importId),
    },
  });
  const runId = typeof run.json?.run?.id === "string" ? run.json.run.id : undefined;
  addCheck(checks, {
    id: "agent_run_authenticated",
    title: "Authenticated dry-run agent run is retry-safe",
    status: (run.statusCode === 201 || run.statusCode === 200) && Boolean(runId) ? "pass" : "block",
    detail:
      (run.statusCode === 201 || run.statusCode === 200) && Boolean(runId)
        ? "Authenticated dry-run run returned a run id."
        : `Expected authenticated dry-run creation to return 200/201 with run.id; got ${run.statusCode}.`,
    statusCode: run.statusCode,
  });
  if (!runId) return;

  const detail = await requestJson(fetchImpl, baseUrl, `/api/agents/runs/${encodeURIComponent(runId)}`, { headers });
  addCheck(checks, {
    id: "agent_run_readback_authenticated",
    title: "Authenticated dry-run run can be read back",
    status: detail.statusCode === 200 && detail.json?.run?.id === runId ? "pass" : "block",
    detail:
      detail.statusCode === 200 && detail.json?.run?.id === runId
        ? "Authenticated dry-run readback returned the same run id."
        : `Expected authenticated dry-run readback to return 200 with the same run id; got ${detail.statusCode}.`,
    statusCode: detail.statusCode,
  });
}

async function requestJson(fetchImpl, baseUrl, path, options = {}) {
  const url = new URL(path, baseUrl);
  const headers = {
    Accept: "application/json",
    ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {}),
  };
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (options.parseJson === false) return { statusCode: response.status };
    let json;
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
    return { statusCode: response.status, json };
  } catch (error) {
    return {
      statusCode: 0,
      error: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    };
  }
}

function validateHealth(result) {
  const readiness = result.json?.readiness ?? {};
  const ok = result.statusCode === 200
    && result.json?.status === "configuration_ready"
    && readiness.authConfigured === true
    && readiness.durableStoreConfigured === true
    && readiness.mutableRoutesReady === true
    && readiness.walletLinking === "required"
    && readiness.identityPolicy?.required === true
    && readiness.identityPolicy?.baseChainId === "8453"
    && readiness.identityPolicy?.solanaCluster === "mainnet-beta"
    && result.json?.x402Enabled === false;
  return {
    id: "health",
    title: "Production health is configuration-ready",
    status: ok ? "pass" : "block",
    detail: ok
      ? "Health reports auth, durable store, linked identities, and disabled x402 ready."
      : `Expected configuration_ready health with auth/store/linked-identity/x402 gates; got ${result.statusCode}.`,
    statusCode: result.statusCode,
  };
}

function validateContracts(result) {
  const ok = result.statusCode === 200
    && result.json?.ok === true
    && result.json?.applyEnabled === false
    && result.json?.x402Enforcement === "disabled"
    && result.json?.contracts?.brief === "agent-brief-pack.v1"
    && Array.isArray(result.json?.endpoints);
  return {
    id: "contracts",
    title: "Contract inventory is public and apply-disabled",
    status: ok ? "pass" : "block",
    detail: ok
      ? "Contracts endpoint exposes AgentBriefPack and apply-disabled endpoint inventory."
      : `Expected public contract inventory with applyEnabled=false; got ${result.statusCode}.`,
    statusCode: result.statusCode,
  };
}

function validateX402Discovery(result) {
  const ok = result.statusCode === 200
    && result.json?.ok === true
    && result.json?.version === "fieldtheory.x402-discovery.v1"
    && result.json?.enabled === false
    && result.json?.enforcement === "disabled";
  return {
    id: "x402_discovery",
    title: "x402 discovery is public and non-enforcing",
    status: ok ? "pass" : "block",
    detail: ok
      ? "x402 discovery reports enabled=false and enforcement=disabled."
      : `Expected non-enforcing x402 discovery; got ${result.statusCode}.`,
    statusCode: result.statusCode,
  };
}

function buildSmokeIdempotencyKey(importId) {
  const cleanedImportId = importId.trim().replace(/[^A-Za-z0-9_./:@=-]+/g, "_");
  return `production-smoke:${cleanedImportId}`.slice(0, 160);
}

function addCheck(checks, check) {
  checks.push(check);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-http") {
      options.allowHttp = true;
    } else if (arg === "--base-url") {
      options.baseUrl = readValue(args, ++index, arg);
    } else if (arg === "--fixture") {
      options.fixture = readValue(args, ++index, arg);
    } else if (arg === "--token-env") {
      options.tokenEnv = readValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

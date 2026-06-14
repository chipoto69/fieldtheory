import test from "node:test";
import assert from "node:assert/strict";

import {
  formatSmokeMarkdown,
  normalizeBaseUrl,
  smokeHostedDeployment,
} from "../scripts/smoke-hosted-deployment.mjs";

type FetchCall = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
};

test("hosted deployment smoke probes public endpoints and fail-closed agents without auth", async () => {
  const { fetchMock, calls } = makeFetchMock({
    "GET /api/health": () => jsonResponse(200, validHealthBody()),
    "GET /api/contracts": () => jsonResponse(200, validContractsBody()),
    "GET /api/x402/discovery": () => jsonResponse(200, validX402DiscoveryBody()),
    "GET /api/agents": () => jsonResponse(401, { error: { code: "auth_required" } }),
  });

  const report = await withGlobalFetchBlocked(() => smokeHostedDeployment({
    baseUrl: "https://fieldtheory.example/",
    fetchImpl: fetchMock,
  }));

  assert.equal(report.version, "fieldtheory.hosted-smoke.v1");
  assert.equal(report.status, "passed");
  assert.equal(report.summary.authenticated, false);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    "GET /api/health",
    "GET /api/contracts",
    "GET /api/x402/discovery",
    "GET /api/agents",
  ]);
  assert.equal(calls.find((call) => call.path === "/api/agents")?.headers.authorization, undefined);
  assert.ok(report.checks.some((check: Record<string, unknown>) => (
    check.id === "agents_unauthenticated"
    && check.status === "pass"
    && String(check.detail).includes("401")
  )));
});

test("hosted deployment smoke uses bearer token only for authenticated import and run probes", async () => {
  const fixture = validBriefFixture();
  const bearerToken = "secret-token-that-must-not-leak";
  const { fetchMock, calls } = makeFetchMock({
    "GET /api/health": () => jsonResponse(200, validHealthBody()),
    "GET /api/contracts": () => jsonResponse(200, validContractsBody()),
    "GET /api/x402/discovery": () => jsonResponse(200, validX402DiscoveryBody()),
    "GET /api/agents": (_url, init) => {
      if (!readAuthorization(init)) return jsonResponse(401, { error: { code: "auth_required" } });
      assert.equal(readAuthorization(init), `Bearer ${bearerToken}`);
      return jsonResponse(200, {
        ok: true,
        actor: {
          id: "operator",
          identityPolicyStatus: "satisfied",
          identityPolicy: { baseChainId: "8453", solanaCluster: "mainnet-beta" },
        },
        targets: [],
      });
    },
    "POST /api/briefs/validate": (_url, init) => {
      assert.equal(readAuthorization(init), `Bearer ${bearerToken}`);
      assert.deepEqual(JSON.parse(String(init?.body)), fixture);
      return jsonResponse(200, {
        report: { valid: true, contractVersion: "agent-brief-pack.v1" },
        import: { id: "import_smoke_brief", kind: "agent-brief-pack" },
      });
    },
    "POST /api/agents/runs": (_url, init) => {
      assert.equal(readAuthorization(init), `Bearer ${bearerToken}`);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        target: "content-os",
        importId: "import_smoke_brief",
        mode: "dry-run",
        idempotencyKey: "production-smoke:import_smoke_brief",
      });
      return jsonResponse(201, {
        run: {
          id: "run_smoke_content_os",
          target: "content-os",
          importId: "import_smoke_brief",
          mode: "dry-run",
        },
        auditEvents: [],
        idempotentReplay: false,
      });
    },
    "GET /api/agents/runs/run_smoke_content_os": (_url, init) => {
      assert.equal(readAuthorization(init), `Bearer ${bearerToken}`);
      return jsonResponse(200, {
        run: {
          id: "run_smoke_content_os",
          target: "content-os",
          importId: "import_smoke_brief",
          mode: "dry-run",
        },
        auditEvents: [],
      });
    },
  });

  const report = await withGlobalFetchBlocked(() => smokeHostedDeployment({
    baseUrl: "https://fieldtheory.example/",
    fetchImpl: fetchMock,
    token: bearerToken,
    fixture,
  }));

  assert.equal(report.status, "passed");
  assert.equal(report.summary.authenticated, true);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    "GET /api/health",
    "GET /api/contracts",
    "GET /api/x402/discovery",
    "GET /api/agents",
    "GET /api/agents",
    "POST /api/briefs/validate",
    "POST /api/agents/runs",
    "GET /api/agents/runs/run_smoke_content_os",
  ]);
  assert.equal(calls[3].headers.authorization, undefined);
  assert.ok(calls.slice(4).every((call) => call.headers.authorization === `Bearer ${bearerToken}`));
  assert.ok(report.checks.some((check: Record<string, unknown>) => check.id === "brief_validate_authenticated"));
  assert.ok(report.checks.some((check: Record<string, unknown>) => check.id === "agent_run_authenticated"));
  assert.ok(report.checks.some((check: Record<string, unknown>) => check.id === "agent_run_readback_authenticated"));

  const serialized = JSON.stringify(report) + "\n" + formatSmokeMarkdown(report);
  assert.doesNotMatch(serialized, /secret-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /Bearer secret-token/i);
  assert.doesNotMatch(serialized, /private smoke note/i);
});

test("hosted deployment smoke blocks incomplete authenticated inputs without running auth probes", async () => {
  const { fetchMock, calls } = makeFetchMock({
    "GET /api/health": () => jsonResponse(200, validHealthBody()),
    "GET /api/contracts": () => jsonResponse(200, validContractsBody()),
    "GET /api/x402/discovery": () => jsonResponse(200, validX402DiscoveryBody()),
    "GET /api/agents": () => jsonResponse(401, { error: { code: "auth_required" } }),
  });

  const report = await withGlobalFetchBlocked(() => smokeHostedDeployment({
    baseUrl: "https://fieldtheory.example",
    fetchImpl: fetchMock,
    token: "token-without-fixture",
  }));

  assert.equal(report.status, "failed");
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    "GET /api/health",
    "GET /api/contracts",
    "GET /api/x402/discovery",
    "GET /api/agents",
  ]);
  assert.ok(report.blockers.some((blocker: Record<string, unknown>) => (
    blocker.id === "authenticated_smoke_configuration"
    && String(blocker.detail).includes("both a bearer token env value and a fixture path")
  )));
  assert.doesNotMatch(JSON.stringify(report), /token-without-fixture/);
});

test("hosted deployment smoke rejects unsafe public URLs and URL secrets", () => {
  assert.equal(normalizeBaseUrl("https://fieldtheory.example/").href, "https://fieldtheory.example/");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:3000/").href, "http://127.0.0.1:3000/");
  assert.throws(() => normalizeBaseUrl("http://fieldtheory.example"), /https/);
  assert.throws(() => normalizeBaseUrl("https://token:secret@fieldtheory.example"), /credentials/);
  assert.throws(() => normalizeBaseUrl("https://fieldtheory.example?token=secret"), /query/);
});

function makeFetchMock(handlers: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>): {
  fetchMock: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetchMock: async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      calls.push({
        method,
        path: url.pathname,
        headers: headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const handler = handlers[`${method} ${url.pathname}`];
      if (!handler) return jsonResponse(599, { error: { code: "unexpected_probe", method, path: url.pathname } });
      return handler(url, init);
    },
  };
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function readAuthorization(init?: RequestInit): string | undefined {
  return headersToRecord(init?.headers).authorization;
}

async function withGlobalFetchBlocked<T>(callback: () => Promise<T>): Promise<T> {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("hosted smoke tests must inject fetch and avoid real network access");
  }) as typeof fetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function validHealthBody(): Record<string, unknown> {
  return {
    status: "configuration_ready",
    readiness: {
      authConfigured: true,
      privyAppIdsMatch: true,
      durableStoreConfigured: true,
      mutableRoutesReady: true,
      walletLinking: "required",
      identityPolicy: {
        required: true,
        baseChainId: "8453",
        solanaCluster: "mainnet-beta",
      },
    },
    x402Enabled: false,
  };
}

function validContractsBody(): Record<string, unknown> {
  return {
    ok: true,
    applyEnabled: false,
    x402Enforcement: "disabled",
    contracts: { brief: "agent-brief-pack.v1" },
    endpoints: [{ route: "/api/health" }],
  };
}

function validX402DiscoveryBody(): Record<string, unknown> {
  return {
    ok: true,
    version: "fieldtheory.x402-discovery.v1",
    enabled: false,
    enforcement: "disabled",
  };
}

function validBriefFixture(): Record<string, unknown> {
  return {
    id: "pack_hosted_smoke",
    version: "agent-brief-pack.v1",
    kind: "source_packet",
    generatedAt: "2026-06-14T10:00:00.000Z",
    input: { sourceBookmarkId: "smoke", target: "content-os" },
    limits: { captures: 1, library: 1, commands: 1, bookmarks: 1 },
    storeStatus: [{ store: "captures", status: "available" }],
    summary: "Private smoke note that should not appear in reports.",
    summaryClaims: [{ text: "Smoke claim", evidenceIds: ["ev_smoke"] }],
    evidence: [{
      id: "ev_smoke",
      sourceType: "capture",
      title: "Smoke",
      locator: "Captures/smoke.md",
      excerpt: "Private smoke note",
      rank: 1,
      sourceRank: 1,
      score: 1,
      scoreReason: "fixture",
      retrievedAt: "2026-06-14T10:00:00.000Z",
      tags: [],
    }],
    typedSlots: [],
    suggestedCommands: [],
    boundaries: [],
    promotionCandidates: [],
    resultEnvelope: {
      status: "complete",
      resultCount: 1,
      warnings: [],
      generatedBy: "fieldtheory",
    },
  };
}

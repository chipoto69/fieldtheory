"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { buildLocalOperatorAuthorization, isLocalOperatorModeEnabled, localOperatorIdFromEnv } from "@/lib/local-operator";
import { workbenchFixtures } from "@/lib/workbench-fixtures";
import { buildWorkbenchRunIdempotencyKey } from "@/lib/workbench-idempotency";

type ValidationResponse = {
  report?: {
    valid?: boolean;
    kind?: string;
    issues?: Array<{ path: string; message: string }>;
  };
  import?: {
    id: string;
    kind: string;
    validationStatus: string;
    ownerUserId?: string;
    contractVersion?: string;
    sha256?: string;
    createdAt?: string;
    exportSummary?: {
      target?: string;
      runId?: string;
      fileRelPaths?: string[];
    };
  };
  error?: { code: string; message: string };
};

type AuditEventView = {
  id: string;
  action: string;
  targetType?: string;
  targetId: string;
  outcome: string;
  createdAt: string;
};

type ImportReadResponse = {
  import?: NonNullable<ValidationResponse["import"]>;
  auditEvents?: AuditEventView[];
  error?: { code: string; message: string };
};

type RunResponse = {
  run?: {
    id: string;
    target: string;
    status: string;
    importId?: string;
    idempotencyKey?: string;
    resultEnvelope?: Record<string, unknown>;
  };
  auditEvents?: AuditEventView[];
  idempotentReplay?: boolean;
  error?: { code: string; message: string };
};

type RunHistoryResponse = {
  runs?: Array<{
    run: NonNullable<RunResponse["run"]> & { createdAt: string };
    auditEvents: NonNullable<RunResponse["auditEvents"]>;
  }>;
  count?: number;
  error?: { code: string; message: string };
};

type HealthResponse = {
  status?: string;
  readiness?: {
    authConfigured?: boolean;
    durableStoreConfigured?: boolean;
    mutableRoutesReady?: boolean;
    walletLinking?: string;
    x402Enforcement?: string;
  };
  x402Enabled?: boolean;
  error?: { code: string; message: string };
};

type AgentsResponse = {
  actor?: {
    id: string;
    identities: string[];
    identityPolicyStatus: string;
    identityPolicy?: {
      missing?: string[];
      required?: string[];
    };
  };
  targets?: Array<{
    id: string;
    label: string;
    applyEnabled: boolean;
  }>;
  error?: { code: string; message: string };
};

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function OperatorWorkbench() {
  const localOperatorMode = isLocalOperatorModeEnabled();
  if (!privyAppId && !localOperatorMode) {
    return (
      <section className="panel workbench" aria-label="Operator workbench">
        <div>
          <h3>Operator workbench</h3>
          <p>Set `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, and `PRIVY_APP_SECRET` to enable browser login and protected import validation. For local no-secret smoke, set `NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR=true` with server-side dev auth.</p>
        </div>
      </section>
    );
  }

  if (localOperatorMode) return <LocalOperatorWorkbench />;
  return <PrivyWorkbench />;
}

function PrivyWorkbench() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  return (
    <WorkbenchCore
      ready={ready}
      authenticated={authenticated}
      statusLabel={authenticated ? "authenticated" : "login required"}
      getAuthorization={async () => {
        const token = await getAccessToken();
        return token ? `Bearer ${token}` : null;
      }}
      loginPanel={!authenticated && (
        <div className="inline-state">
          <span>Protected routes require a Privy access token.</span>
          <button className="btn" type="button" disabled={!ready} onClick={login}>Connect Privy</button>
        </div>
      )}
    />
  );
}

function LocalOperatorWorkbench() {
  const operatorId = localOperatorIdFromEnv();
  const authorization = buildLocalOperatorAuthorization();
  return (
    <WorkbenchCore
      ready={Boolean(authorization)}
      authenticated={Boolean(authorization)}
      statusLabel={authorization ? `local dev:${operatorId}` : "local operator invalid"}
      getAuthorization={async () => authorization ?? null}
      loginPanel={(
        <div className="inline-state">
          <span>Local operator mode requires `PRIVY_DEV_ALLOW_UNSIGNED=true`, `PRIVY_APP_ID`, and `PRIVY_APP_SECRET` on the server.</span>
        </div>
      )}
    />
  );
}

function WorkbenchCore({
  ready,
  authenticated,
  statusLabel,
  getAuthorization,
  loginPanel,
}: {
  ready: boolean;
  authenticated: boolean;
  statusLabel: string;
  getAuthorization: () => Promise<string | null>;
  loginPanel: ReactNode;
}) {
  const [input, setInput] = useState("");
  const [validation, setValidation] = useState<ValidationResponse | undefined>();
  const [run, setRun] = useState<RunResponse | undefined>();
  const [runHistory, setRunHistory] = useState<RunHistoryResponse | undefined>();
  const [health, setHealth] = useState<HealthResponse | undefined>();
  const [agents, setAgents] = useState<AgentsResponse | undefined>();
  const [selectedImport, setSelectedImport] = useState<ImportReadResponse | undefined>();
  const [selectedRun, setSelectedRun] = useState<RunResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<"validate" | "run" | "history" | "status" | "import" | "detail" | undefined>();

  const detected = useMemo(() => detectPayload(input), [input]);
  const runTarget = validation?.import ? targetForImport(validation.import) : "content-os";
  const canValidate = ready && authenticated && input.trim().length > 0 && !busy;
  const canRun = ready && authenticated && validation?.report?.valid === true && Boolean(validation.import?.id) && !busy;
  const canRefresh = ready && authenticated && !busy;

  function loadFixture(fixtureId: string) {
    const fixture = workbenchFixtures.find((item) => item.id === fixtureId);
    if (!fixture) return;
    setInput(JSON.stringify(fixture.payload, null, 2));
    setValidation(undefined);
    setRun(undefined);
    setSelectedImport(undefined);
    setError(undefined);
  }

  async function refreshOperatorState() {
    setBusy("status");
    setError(undefined);
    try {
      const [healthBody, agentsBody] = await Promise.all([
        publicJson<HealthResponse>("/api/health"),
        authenticatedGet<AgentsResponse>("/api/agents", getAuthorization),
      ]);
      setHealth(healthBody);
      setAgents(agentsBody);
      const apiError = healthBody.error ?? agentsBody.error;
      if (apiError) setError(`${apiError.code}: ${apiError.message}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function validateInput() {
    setBusy("validate");
    setError(undefined);
    setRun(undefined);
    try {
      const parsed = parseInput(input);
      const route = routeForPayload(parsed);
      const body = await authenticatedJson<ValidationResponse>(route, parsed, getAuthorization);
      setValidation(body);
      setSelectedImport(undefined);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setValidation(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function inspectImport(importId: string) {
    setBusy("import");
    setError(undefined);
    try {
      const body = await authenticatedGet<ImportReadResponse>(`/api/artifacts/imports/${encodeURIComponent(importId)}`, getAuthorization);
      setSelectedImport(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setSelectedImport(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function createRun() {
    if (!validation?.import?.id) return;
    setBusy("run");
    setError(undefined);
    try {
      const body = await authenticatedJson<RunResponse>("/api/agents/runs", {
        target: runTarget,
        importId: validation.import.id,
        mode: "dry-run",
        idempotencyKey: buildWorkbenchRunIdempotencyKey(runTarget, validation.import.id),
      }, getAuthorization);
      setRun(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
      else await refreshRuns();
    } catch (cause) {
      setRun(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function refreshRuns() {
    setBusy("history");
    setError(undefined);
    try {
      const body = await authenticatedGet<RunHistoryResponse>("/api/agents/runs", getAuthorization);
      setRunHistory(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setRunHistory(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  async function inspectRun(runId: string) {
    setBusy("detail");
    setError(undefined);
    try {
      const body = await authenticatedGet<RunResponse>(`/api/agents/runs/${encodeURIComponent(runId)}`, getAuthorization);
      setSelectedRun(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setSelectedRun(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  const identityMissing = agents?.actor?.identityPolicy?.missing ?? [];
  const targetCount = agents?.targets?.length ?? 0;

  return (
    <section className="panel workbench" aria-label="Operator workbench">
      <div className="workbench-header">
        <div>
          <h3>Operator workbench</h3>
          <p>Paste an AgentBriefPack or Field Theory export manifest, validate it through the hosted API, then create an audited dry-run run.</p>
        </div>
        <span className={`status ${authenticated ? "ok" : "warn"}`}>{statusLabel}</span>
      </div>

      {loginPanel}

      <div className="button-row">
        <button className="btn secondary" type="button" disabled={!canRefresh} onClick={refreshOperatorState}>
          {busy === "status" ? "Refreshing" : "Refresh status"}
        </button>
        {health && (
          <span className="detected-kind">
            {health.status ?? "unknown"} / mutable {health.readiness?.mutableRoutesReady ? "ready" : "blocked"} / x402 {health.x402Enabled ? "on" : "off"}
          </span>
        )}
        {agents?.actor && (
          <span className="detected-kind">
            {agents.actor.id} / {agents.actor.identityPolicyStatus} / {targetCount} targets
          </span>
        )}
      </div>

      {(health || agents) && (
        <div className="result-grid">
          <div className="result-box">
            <strong>Readiness</strong>
            <span>auth: {health?.readiness?.authConfigured ? "configured" : "blocked"}</span>
            <span>store: {health?.readiness?.durableStoreConfigured ? "durable" : "local/test"}</span>
            <span>wallet: {health?.readiness?.walletLinking ?? "unknown"}</span>
          </div>
          <div className="result-box">
            <strong>Identity policy</strong>
            <span>{agents?.actor?.identityPolicyStatus ?? "unknown"}</span>
            {identityMissing.length === 0 ? (
              <span>missing: none</span>
            ) : (
              <span>missing: {identityMissing.join(", ")}</span>
            )}
          </div>
        </div>
      )}

      <div className="fixture-row" aria-label="Workbench example payloads">
        <span>Examples</span>
        {workbenchFixtures.map((fixture) => (
          <button className="btn secondary" type="button" key={fixture.id} onClick={() => loadFixture(fixture.id)}>
            {fixture.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Brief or export JSON</span>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='{"version":"agent-brief-pack.v1", ...}'
          spellCheck={false}
        />
      </label>

      <div className="button-row">
        <button className="btn" type="button" disabled={!canValidate} onClick={validateInput}>
          {busy === "validate" ? "Validating" : "Validate import"}
        </button>
        <button className="btn secondary" type="button" disabled={!canRun} onClick={createRun}>
          {busy === "run" ? "Creating" : `Create ${runTarget} dry-run`}
        </button>
        <button className="btn secondary" type="button" disabled={!canRefresh} onClick={refreshRuns}>
          {busy === "history" ? "Refreshing" : "Refresh runs"}
        </button>
        <span className="detected-kind">{detected}</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {validation && (
        <div className="result-grid">
          <div className="result-box">
            <strong>Validation</strong>
            <span>{validation.report?.valid ? "valid" : "rejected"}</span>
            <span>{validation.import?.id ?? "no import id"}</span>
            {validation.import?.id && (
              <button className="link-button" type="button" disabled={Boolean(busy)} onClick={() => inspectImport(validation.import?.id ?? "")}>
                {busy === "import" ? "inspecting" : "inspect import"}
              </button>
            )}
          </div>
          <div className="result-box">
            <strong>Issues</strong>
            {(validation.report?.issues?.length ?? 0) === 0 ? (
              <span>none</span>
            ) : (
              <ul>
                {validation.report?.issues?.map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>{issue.path}: {issue.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedImport?.import && (
        <div className="result-box">
          <strong>Selected import detail</strong>
          <span>{selectedImport.import.kind} / {selectedImport.import.validationStatus} / {selectedImport.import.id}</span>
          <span>{selectedImport.import.exportSummary?.target ?? "brief"} / {selectedImport.import.exportSummary?.runId ?? "no run id"}</span>
          <pre className="code">{JSON.stringify({ import: selectedImport.import, auditEvents: selectedImport.auditEvents ?? [] }, null, 2)}</pre>
        </div>
      )}

      {run?.run && (
        <>
          <div className="result-grid">
            <div className="result-box">
              <strong>Run</strong>
              <span>{run.run.id}</span>
              <span>{run.run.target} / {run.run.status}</span>
              <span>{run.idempotentReplay ? "safe retry replay" : "new dry-run"} / {run.run.idempotencyKey ?? "no retry key"}</span>
              {importIdForRun(run.run) && (
                <button className="link-button" type="button" disabled={Boolean(busy)} onClick={() => inspectImport(importIdForRun(run.run) ?? "")}>
                  inspect import
                </button>
              )}
            </div>
            <div className="result-box">
              <strong>Audit</strong>
              {(run.auditEvents?.length ?? 0) === 0 ? (
                <span>no events</span>
              ) : (
                <ul>
                  {run.auditEvents?.map((event) => (
                    <li key={event.id}>{event.action}: {event.outcome}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <pre className="code">{JSON.stringify({ run: run.run, auditEvents: run.auditEvents ?? [] }, null, 2)}</pre>
        </>
      )}

      {runHistory && (
        <div className="result-box">
          <strong>Recent runs</strong>
          {(runHistory.runs?.length ?? 0) === 0 ? (
            <span>none</span>
          ) : (
            <ul>
              {runHistory.runs?.map((item) => (
                <li key={item.run.id}>
                  {item.run.target} / {item.run.status} / {item.auditEvents.length} audit event{item.auditEvents.length === 1 ? "" : "s"} / {item.run.id}
                  {" "}
                  <button className="link-button" type="button" disabled={Boolean(busy)} onClick={() => inspectRun(item.run.id)}>
                    inspect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedRun?.run && (
        <div className="result-box">
          <strong>Selected run detail</strong>
          <span>{selectedRun.run.target} / {selectedRun.run.status} / {selectedRun.run.id}</span>
          <span>{selectedRun.run.idempotencyKey ?? "no retry key"}</span>
          {importIdForRun(selectedRun.run) && (
            <button className="link-button" type="button" disabled={Boolean(busy)} onClick={() => inspectImport(importIdForRun(selectedRun.run) ?? "")}>
              inspect import
            </button>
          )}
          <pre className="code">{JSON.stringify({ run: selectedRun.run, auditEvents: selectedRun.auditEvents ?? [] }, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

async function authenticatedJson<T>(
  path: string,
  payload: unknown,
  getAuthorization: () => Promise<string | null>,
): Promise<T> {
  const authorization = await getAuthorization();
  if (!authorization) throw new Error("No authorization token is available.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as T;
  if (!response.ok && !isApiError(body)) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }
  return body;
}

async function authenticatedGet<T>(
  path: string,
  getAuthorization: () => Promise<string | null>,
): Promise<T> {
  const authorization = await getAuthorization();
  if (!authorization) throw new Error("No authorization token is available.");
  const response = await fetch(path, {
    headers: { authorization },
  });
  const body = await response.json() as T;
  if (!response.ok && !isApiError(body)) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }
  return body;
}

async function publicJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json() as T;
  if (!response.ok && !isApiError(body)) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }
  return body;
}

function parseInput(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function routeForPayload(payload: Record<string, unknown>): string {
  if (payload.version === "agent-brief-pack.v1") return "/api/briefs/validate";
  if (payload.version === "fieldtheory.agent-export.v1") return "/api/exports/validate";
  throw new Error("Unknown contract version. Expected agent-brief-pack.v1 or fieldtheory.agent-export.v1.");
}

function detectPayload(input: string): string {
  if (!input.trim()) return "waiting for JSON";
  try {
    const payload = parseInput(input);
    if (payload.version === "agent-brief-pack.v1") return "AgentBriefPack";
    if (payload.version === "fieldtheory.agent-export.v1") return `export:${String(payload.target ?? "unknown")}`;
    return "unknown contract";
  } catch {
    return "invalid JSON";
  }
}

function targetForImport(item: NonNullable<ValidationResponse["import"]>): "aeon" | "hermes" | "content-os" {
  const target = item.exportSummary?.target;
  if (target === "aeon" || target === "hermes") return target;
  return "content-os";
}

export function importIdForRun(run: { importId?: unknown } | undefined): string | undefined {
  if (typeof run?.importId !== "string") return undefined;
  const importId = run.importId.trim();
  return importId.length > 0 ? importId : undefined;
}

function isApiError(value: unknown): value is { error: { code: string; message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useMemo, useState } from "react";

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
    exportSummary?: { target?: string };
  };
  error?: { code: string; message: string };
};

type RunResponse = {
  run?: {
    id: string;
    target: string;
    status: string;
    resultEnvelope?: Record<string, unknown>;
  };
  auditEvents?: Array<{
    id: string;
    action: string;
    targetId: string;
    outcome: string;
    createdAt: string;
  }>;
  error?: { code: string; message: string };
};

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function OperatorWorkbench() {
  if (!privyAppId) {
    return (
      <section className="panel workbench" aria-label="Operator workbench">
        <div>
          <h3>Operator workbench</h3>
          <p>Set `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, and `PRIVY_APP_SECRET` to enable browser login and protected import validation.</p>
        </div>
      </section>
    );
  }

  return <PrivyWorkbench />;
}

function PrivyWorkbench() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const [input, setInput] = useState("");
  const [validation, setValidation] = useState<ValidationResponse | undefined>();
  const [run, setRun] = useState<RunResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<"validate" | "run" | undefined>();

  const detected = useMemo(() => detectPayload(input), [input]);
  const runTarget = validation?.import ? targetForImport(validation.import) : "content-os";
  const canValidate = ready && authenticated && input.trim().length > 0 && !busy;
  const canRun = ready && authenticated && validation?.report?.valid === true && Boolean(validation.import?.id) && !busy;

  async function validateInput() {
    setBusy("validate");
    setError(undefined);
    setRun(undefined);
    try {
      const parsed = parseInput(input);
      const route = routeForPayload(parsed);
      const body = await authenticatedJson<ValidationResponse>(route, parsed, getAccessToken);
      setValidation(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setValidation(undefined);
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
      }, getAccessToken);
      setRun(body);
      if (body.error) setError(`${body.error.code}: ${body.error.message}`);
    } catch (cause) {
      setRun(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="panel workbench" aria-label="Operator workbench">
      <div className="workbench-header">
        <div>
          <h3>Operator workbench</h3>
          <p>Paste an AgentBriefPack or Field Theory export manifest, validate it through the hosted API, then create an audited dry-run run.</p>
        </div>
        <span className={`status ${authenticated ? "ok" : "warn"}`}>{authenticated ? "authenticated" : "login required"}</span>
      </div>

      {!authenticated && (
        <div className="inline-state">
          <span>Protected routes require a Privy access token.</span>
          <button className="btn" type="button" disabled={!ready} onClick={login}>Connect Privy</button>
        </div>
      )}

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
        <span className="detected-kind">{detected}</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {validation && (
        <div className="result-grid">
          <div className="result-box">
            <strong>Validation</strong>
            <span>{validation.report?.valid ? "valid" : "rejected"}</span>
            <span>{validation.import?.id ?? "no import id"}</span>
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

      {run?.run && (
        <>
          <div className="result-grid">
            <div className="result-box">
              <strong>Run</strong>
              <span>{run.run.id}</span>
              <span>{run.run.target} / {run.run.status}</span>
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
    </section>
  );
}

async function authenticatedJson<T>(
  path: string,
  payload: unknown,
  getAccessToken: () => Promise<string | null>,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Privy did not return an access token.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
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

function isApiError(value: unknown): value is { error: { code: string; message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

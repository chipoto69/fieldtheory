import { requirePrivyUser } from "@/lib/auth";
import { buildImportPlan } from "@/lib/import-plans";
import { linkedIdentityPolicyErrorResponse } from "@/lib/identity-policy";
import { jsonError, jsonErrorFrom, jsonOk, readJson } from "@/lib/http";
import { getHostedStore, type AgentTarget, type RunMode } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const limit = readLimit(request);
    const store = getHostedStore();
    const runs = await store.listRunsForOwner(auth.user.id, limit);
    const runsWithAuditEvents = await Promise.all(runs.map(async (run) => ({
      run,
      auditEvents: await store.listAuditEventsForTarget(auth.user.id, "agent_run", run.id),
    })));
    return jsonOk({ runs: runsWithAuditEvents, count: runsWithAuditEvents.length });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const identityPolicyError = linkedIdentityPolicyErrorResponse(auth.user, "Linked GitHub, Base EVM, and Solana identities are required for agent runs.");
  if (identityPolicyError) return identityPolicyError;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const body = await readJson(request);
    if (!isRecord(body)) return jsonError("invalid_body", "Run request must be an object.", 400);
    const target = body.target;
    const importId = body.importId;
    const mode = body.mode ?? "dry-run";
    const idempotencyKeyResult = readIdempotencyKey(body.idempotencyKey);
    if (!isAgentTarget(target)) return jsonError("invalid_target", "target must be aeon, hermes, or content-os.", 400);
    if (typeof importId !== "string" || importId.length === 0) return jsonError("invalid_import", "importId is required.", 400);
    if (!isRunMode(mode)) return jsonError("invalid_mode", "mode must be dry-run or apply-plan.", 400);
    if (!idempotencyKeyResult.ok) return jsonError("invalid_idempotency_key", idempotencyKeyResult.message, 400);
    if (mode !== "dry-run") return jsonError("apply_disabled", "Only dry-run agent runs are enabled in Milestone 2.", 403);

    const store = getHostedStore();
    const idempotencyKey = idempotencyKeyResult.value;
    if (idempotencyKey) {
      const existingRun = await store.findRunByIdempotencyKey(auth.user.id, idempotencyKey);
      if (existingRun) {
        if (existingRun.target !== target || existingRun.importId !== importId || existingRun.mode !== mode) {
          return jsonError("idempotency_conflict", "idempotencyKey already belongs to a different run request.", 409);
        }
        const auditEvents = await store.listAuditEventsForTarget(auth.user.id, "agent_run", existingRun.id);
        return jsonOk({ run: existingRun, auditEvents, idempotentReplay: true });
      }
    }

    const artifact = await store.getImport(importId);
    if (!artifact || artifact.ownerUserId !== auth.user.id) {
      return jsonError("import_not_found", "Import was not found for this user.", 404);
    }
    if (artifact.validationStatus !== "valid") {
      return jsonError("invalid_import", "Cannot create an agent run from an invalid import.", 422);
    }
    if (!isImportCompatibleWithTarget(artifact.exportSummary?.target, target)) {
      return jsonError("target_mismatch", "Import target does not match the requested agent target.", 422);
    }

    const plan = buildImportPlan(target, artifact.exportSummary ?? { runId: importId, fileRelPaths: [], forbiddenWrites: [] });
    const { run, audit } = await store.createRunWithAudit(
      {
        ownerUserId: auth.user.id,
        target,
        mode,
        importId,
        idempotencyKey,
        resultEnvelope: {
          status: "dry-run",
          plan,
        },
      },
      {
        actorUserId: auth.user.id,
        action: "agent.run.create",
        targetType: "agent_run",
        contractHash: artifact.sha256,
        outcome: "accepted",
      },
    );
    return jsonOk({ run, auditEvents: [audit], idempotentReplay: false }, { status: 201 });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

function isAgentTarget(value: unknown): value is AgentTarget {
  return value === "aeon" || value === "hermes" || value === "content-os";
}

function isRunMode(value: unknown): value is RunMode {
  return value === "dry-run" || value === "apply-plan";
}

function isImportCompatibleWithTarget(importTarget: string | undefined, requestedTarget: AgentTarget): boolean {
  if (requestedTarget === "aeon" || requestedTarget === "hermes") return importTarget === requestedTarget;
  return importTarget === undefined || importTarget === "soul";
}

function readLimit(request: Request): number {
  const value = new URL(request.url).searchParams.get("limit");
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 50);
}

function readIdempotencyKey(value: unknown): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") return { ok: false, message: "idempotencyKey must be a string when provided." };
  const idempotencyKey = value.trim();
  if (idempotencyKey.length === 0) return { ok: false, message: "idempotencyKey must not be empty." };
  if (idempotencyKey.length > 160) return { ok: false, message: "idempotencyKey must be at most 160 characters." };
  if (!/^[A-Za-z0-9_./:@=-]+$/.test(idempotencyKey)) {
    return { ok: false, message: "idempotencyKey contains unsupported characters." };
  }
  return { ok: true, value: idempotencyKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

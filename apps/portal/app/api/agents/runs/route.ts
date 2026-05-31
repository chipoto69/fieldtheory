import { requirePrivyUser } from "@/lib/auth";
import { buildImportPlan } from "@/lib/import-plans";
import { jsonError, jsonErrorFrom, jsonOk, readJson } from "@/lib/http";
import { hostedStore, type AgentTarget, type RunMode } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const body = await readJson(request);
    if (!isRecord(body)) return jsonError("invalid_body", "Run request must be an object.", 400);
    const target = body.target;
    const importId = body.importId;
    const mode = body.mode ?? "dry-run";
    if (!isAgentTarget(target)) return jsonError("invalid_target", "target must be aeon, hermes, or content-os.", 400);
    if (typeof importId !== "string" || importId.length === 0) return jsonError("invalid_import", "importId is required.", 400);
    if (!isRunMode(mode)) return jsonError("invalid_mode", "mode must be dry-run or apply-plan.", 400);
    if (mode !== "dry-run") return jsonError("apply_disabled", "Only dry-run agent runs are enabled in Milestone 2.", 403);

    const artifact = hostedStore.getImport(importId);
    if (!artifact || artifact.ownerUserId !== auth.user.id) {
      return jsonError("import_not_found", "Import was not found for this user.", 404);
    }
    if (artifact.validationStatus !== "valid") {
      return jsonError("invalid_import", "Cannot create an agent run from an invalid import.", 422);
    }

    const plan = buildImportPlan(target, { runId: importId });
    const run = hostedStore.createRun({
      ownerUserId: auth.user.id,
      target,
      mode,
      importId,
      resultEnvelope: {
        status: "dry-run",
        plan,
      },
    });
    hostedStore.appendAudit({
      actorUserId: auth.user.id,
      action: "agent.run.create",
      targetType: "agent_run",
      targetId: run.id,
      contractHash: artifact.sha256,
      outcome: "accepted",
    });
    return jsonOk({ run }, { status: 201 });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import { requirePrivyUser } from "@/lib/auth";
import { summarizeExportManifest, validateExportManifest } from "@/lib/contracts";
import { buildImportPlan } from "@/lib/import-plans";
import { jsonError, jsonErrorFrom, jsonOk, readJson, stableHash } from "@/lib/http";
import { getHostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const manifest = await readJson(request);
    const report = validateExportManifest(manifest);
    if (!report.valid) return jsonOk({ report }, { status: 422 });
    const summary = summarizeExportManifest(manifest);
    if (!summary) return jsonError("invalid_manifest_summary", "Export manifest summary could not be derived.", 422);
    if (summary.target !== "hermes") return jsonError("target_mismatch", "Hermes import plans require a hermes export manifest.", 422);
    if (!summary.fileRelPaths.some((file) => file.endsWith("/hermes/task-payload.dry-run.json"))) {
      return jsonError("missing_hermes_payload", "Hermes export manifest must include hermes/task-payload.dry-run.json.", 422);
    }
    const plan = buildImportPlan("hermes", summary);
    await getHostedStore().appendAudit({
      actorUserId: auth.user.id,
      action: "hermes.import_plan",
      targetType: "import_plan",
      targetId: stableHash(manifest).slice(0, 16),
      contractHash: stableHash(manifest),
      outcome: "accepted",
    });
    return jsonOk({ report, plan });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

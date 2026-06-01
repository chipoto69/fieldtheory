import { requirePrivyUser } from "@/lib/auth";
import { summarizeExportManifest, validateExportManifest } from "@/lib/contracts";
import { buildImportPlan } from "@/lib/import-plans";
import { jsonError, jsonErrorFrom, jsonOk, readJson, stableHash } from "@/lib/http";
import { linkedIdentityPolicyErrorResponse } from "@/lib/identity-policy";
import { getHostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const identityPolicyError = linkedIdentityPolicyErrorResponse(auth.user);
  if (identityPolicyError) return identityPolicyError;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const manifest = await readJson(request);
    const report = validateExportManifest(manifest);
    if (!report.valid) return Response.json({ ok: false, report }, { status: 422 });
    const summary = summarizeExportManifest(manifest);
    if (!summary) return jsonError("invalid_manifest_summary", "Export manifest summary could not be derived.", 422);
    if (summary.target !== "aeon") return jsonError("target_mismatch", "Gordo/Aeon import plans require an aeon export manifest.", 422);
    if (!summary.fileRelPaths.some((file) => file.endsWith("/aeon/aeon.yml.draft"))) {
      return jsonError("missing_aeon_draft", "Aeon export manifest must include aeon/aeon.yml.draft.", 422);
    }
    const plan = buildImportPlan("aeon", summary);
    await getHostedStore().appendAudit({
      actorUserId: auth.user.id,
      action: "gordo.import_plan",
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

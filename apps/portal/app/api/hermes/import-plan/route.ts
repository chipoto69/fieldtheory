import { requirePrivyUser } from "@/lib/auth";
import { validateExportManifest } from "@/lib/contracts";
import { buildImportPlan } from "@/lib/import-plans";
import { jsonErrorFrom, jsonOk, readJson, stableHash } from "@/lib/http";
import { hostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const manifest = await readJson(request);
    const report = validateExportManifest(manifest);
    if (!report.valid) return jsonOk({ report }, { status: 422 });
    const plan = buildImportPlan("hermes", isRecord(manifest) ? manifest : {});
    hostedStore.appendAudit({
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

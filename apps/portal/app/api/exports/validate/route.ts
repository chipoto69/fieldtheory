import { requirePrivyUser } from "@/lib/auth";
import { summarizeExportManifest, validateExportManifest } from "@/lib/contracts";
import { jsonErrorFrom, jsonOk, readJson } from "@/lib/http";
import { getHostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const payload = await readJson(request);
    const report = validateExportManifest(payload);
    const exportSummary = report.valid ? summarizeExportManifest(payload) : undefined;
    const store = getHostedStore();
    const { artifact } = await store.createImportWithAudit(
      {
        ownerUserId: auth.user.id,
        contractVersion: report.contractVersion ?? "unknown",
        kind: report.kind ?? "agent-export",
        validationStatus: report.valid ? "valid" : "invalid",
        exportSummary,
        payload,
      },
      {
        actorUserId: auth.user.id,
        action: "export.validate",
        targetType: "artifact_import",
        outcome: report.valid ? "accepted" : "rejected",
      },
    );
    return jsonOk({ report, import: artifact }, { status: report.valid ? 200 : 422 });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

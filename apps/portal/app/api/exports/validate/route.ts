import { requirePrivyUser } from "@/lib/auth";
import { summarizeExportManifest, validateExportManifest } from "@/lib/contracts";
import { jsonErrorFrom, jsonOk, readJson } from "@/lib/http";
import { hostedStore } from "@/lib/store";
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
    const artifact = hostedStore.createImport({
      ownerUserId: auth.user.id,
      contractVersion: report.contractVersion ?? "unknown",
      kind: report.kind ?? "agent-export",
      validationStatus: report.valid ? "valid" : "invalid",
      exportSummary,
      payload,
    });
    hostedStore.appendAudit({
      actorUserId: auth.user.id,
      action: "export.validate",
      targetType: "artifact_import",
      targetId: artifact.id,
      contractHash: artifact.sha256,
      outcome: report.valid ? "accepted" : "rejected",
    });
    return jsonOk({ report, import: artifact }, { status: report.valid ? 200 : 422 });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

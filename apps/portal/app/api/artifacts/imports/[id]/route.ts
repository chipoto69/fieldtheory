import { requirePrivyUser } from "@/lib/auth";
import { jsonError, jsonErrorFrom, jsonOk } from "@/lib/http";
import { getHostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  try {
    const { id } = await context.params;
    const artifact = await getHostedStore().getImport(id);
    if (!artifact || artifact.ownerUserId !== auth.user.id) {
      return jsonError("artifact_import_not_found", "Artifact import was not found for this user.", 404);
    }
    const auditEvents = await getHostedStore().listAuditEventsForTarget(
      auth.user.id,
      "artifact_import",
      artifact.id,
    );

    return jsonOk({ import: artifact, auditEvents });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

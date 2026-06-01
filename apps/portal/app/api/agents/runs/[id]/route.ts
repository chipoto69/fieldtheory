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
    const run = await getHostedStore().getRun(id);
    if (!run || run.ownerUserId !== auth.user.id) {
      return jsonError("run_not_found", "Run was not found for this user.", 404);
    }
    const auditEvents = await getHostedStore().listAuditEventsForTarget(auth.user.id, "agent_run", run.id);

    return jsonOk({ run, auditEvents });
  } catch (error) {
    return jsonErrorFrom(error);
  }
}

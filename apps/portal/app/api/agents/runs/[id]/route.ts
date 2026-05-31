import { requirePrivyUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { hostedStore } from "@/lib/store";
import { requireMutableStore } from "@/lib/store-guard";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const storeGuard = requireMutableStore();
  if (storeGuard) return storeGuard;

  const { id } = await context.params;
  const run = hostedStore.getRun(id);
  if (!run || run.ownerUserId !== auth.user.id) {
    return jsonError("run_not_found", "Run was not found for this user.", 404);
  }

  return jsonOk({ run });
}

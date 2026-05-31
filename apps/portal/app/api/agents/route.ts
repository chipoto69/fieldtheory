import { requirePrivyUser } from "@/lib/auth";
import { targetRegistry } from "@/lib/fixtures";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const auth = requirePrivyUser(request);
  if (!auth.ok) return auth.response;

  return Response.json({
    ok: true,
    targets: targetRegistry,
    actor: {
      id: auth.user.id,
      identities: auth.user.identities.map((identity) => identity.type),
    },
  });
}

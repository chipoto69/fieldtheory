import { requirePrivyUser } from "@/lib/auth";
import { targetRegistry } from "@/lib/fixtures";
import { evaluateLinkedIdentityPolicy } from "@/lib/identity-policy";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const auth = await requirePrivyUser(request);
  if (!auth.ok) return auth.response;
  const identityPolicy = evaluateLinkedIdentityPolicy(auth.user);

  return Response.json({
    ok: true,
    targets: targetRegistry,
    actor: {
      id: auth.user.id,
      identities: auth.user.identities.map((identity) => identity.type),
      identityPolicyStatus: identityPolicy.status,
      identityPolicy,
    },
  });
}

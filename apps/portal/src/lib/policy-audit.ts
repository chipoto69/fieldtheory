import type { AuthenticatedUser } from "@/lib/auth";
import { stableHash } from "@/lib/http";
import { evaluateLinkedIdentityPolicy } from "@/lib/identity-policy";
import { getHostedStore } from "@/lib/store";

type LinkedIdentityPolicyAuditOptions = {
  action: string;
  message?: string;
  targetId?: string;
};

export async function linkedIdentityPolicyAuditErrorResponse(
  user: Pick<AuthenticatedUser, "id" | "authSource" | "identities">,
  options: LinkedIdentityPolicyAuditOptions,
): Promise<Response | null> {
  const identityPolicy = evaluateLinkedIdentityPolicy(user);
  if (identityPolicy.status !== "unsatisfied") return null;

  const audit = await getHostedStore().appendAudit({
    actorUserId: user.id,
    action: options.action,
    targetType: "identity_policy",
    targetId: options.targetId ?? options.action,
    contractHash: stableHash({
      policy: "linked_identity",
      required: identityPolicy.required,
      missing: identityPolicy.missing,
      baseChainId: identityPolicy.baseChainId,
      solanaCluster: identityPolicy.solanaCluster,
    }),
    outcome: "blocked",
  });

  return Response.json(
    {
      ok: false,
      error: {
        code: "identity_policy_unsatisfied",
        message: options.message ?? "Linked GitHub, Base EVM, and Solana identities are required for protected hosted writes.",
      },
      identityPolicy,
      auditEvents: [audit],
    },
    { status: 403 },
  );
}

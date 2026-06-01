export type PortalIdentity = {
  type: "github" | "evm" | "solana";
  subject: string;
  chainId?: string;
  username?: string;
  verifiedAt?: number;
};

export type IdentityPolicyStatus = "deferred" | "satisfied" | "unsatisfied";

export type IdentityPolicyResult = {
  required: string[];
  missing: string[];
  status: IdentityPolicyStatus;
  baseChainId: string;
  solanaCluster: string;
};

export type IdentityPolicyConfig = {
  required: boolean;
  baseChainId: string;
  solanaCluster: string;
};

type PrivyUserLike = {
  linked_accounts?: unknown[];
};

export function identityPolicyConfigFromEnv(): IdentityPolicyConfig {
  return {
    required: process.env.FIELD_THEORY_REQUIRE_LINKED_IDENTITIES === "true",
    baseChainId: process.env.FIELD_THEORY_BASE_CHAIN_ID ?? process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532",
    solanaCluster: process.env.FIELD_THEORY_SOLANA_CLUSTER ?? process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
  };
}

export function shouldLoadPrivyLinkedAccounts(config = identityPolicyConfigFromEnv()): boolean {
  return config.required || process.env.FIELD_THEORY_LOAD_PRIVY_USER === "true";
}

export function normalizePrivyIdentities(user: PrivyUserLike | undefined): PortalIdentity[] {
  const linkedAccounts = Array.isArray(user?.linked_accounts) ? user.linked_accounts : [];
  const identities: PortalIdentity[] = [];
  for (const account of linkedAccounts) {
    if (!isRecord(account)) continue;
    if (account.type === "github_oauth" && typeof account.subject === "string") {
      identities.push({
        type: "github",
        subject: account.subject,
        username: typeof account.username === "string" ? account.username : undefined,
        verifiedAt: numberOrUndefined(account.verified_at),
      });
      continue;
    }

    if (account.type !== "wallet" || typeof account.address !== "string") continue;
    if (account.chain_type === "ethereum") {
      identities.push({
        type: "evm",
        subject: account.address.toLowerCase(),
        chainId: stringOrUndefined(account.chain_id),
        verifiedAt: numberOrUndefined(account.verified_at),
      });
    }
    if (account.chain_type === "solana") {
      identities.push({
        type: "solana",
        subject: account.address,
        chainId: stringOrUndefined(account.chain_id),
        verifiedAt: numberOrUndefined(account.verified_at),
      });
    }
  }
  return dedupeIdentities(identities);
}

export function evaluateLinkedIdentityPolicy(
  user: { authSource: "privy" | "development"; identities: PortalIdentity[] },
  config = identityPolicyConfigFromEnv(),
): IdentityPolicyResult {
  const required = requiredIdentityLabels(config);
  if (!config.required) {
    return {
      required,
      missing: [],
      status: "deferred",
      baseChainId: config.baseChainId,
      solanaCluster: config.solanaCluster,
    };
  }

  const identities = user.authSource === "privy" ? user.identities : [];
  const missing = [
    identities.some((identity) => identity.type === "github") ? undefined : "github",
    identities.some((identity) => identity.type === "evm" && identity.chainId === config.baseChainId)
      ? undefined
      : `base_evm:${config.baseChainId}`,
    identities.some((identity) => identity.type === "solana") ? undefined : `solana:${config.solanaCluster}`,
  ].filter((item): item is string => Boolean(item));

  return {
    required,
    missing,
    status: missing.length === 0 ? "satisfied" : "unsatisfied",
    baseChainId: config.baseChainId,
    solanaCluster: config.solanaCluster,
  };
}

export function linkedIdentityPolicyErrorResponse(
  user: { authSource: "privy" | "development"; identities: PortalIdentity[] },
  message = "Linked GitHub, Base EVM, and Solana identities are required for protected hosted writes.",
): Response | null {
  const identityPolicy = evaluateLinkedIdentityPolicy(user);
  if (identityPolicy.status !== "unsatisfied") return null;
  return Response.json(
    {
      ok: false,
      error: {
        code: "identity_policy_unsatisfied",
        message,
      },
      identityPolicy,
    },
    { status: 403 },
  );
}

export function requiredIdentityLabels(config = identityPolicyConfigFromEnv()): string[] {
  return ["github", `base_evm:${config.baseChainId}`, `solana:${config.solanaCluster}`];
}

function dedupeIdentities(identities: PortalIdentity[]): PortalIdentity[] {
  const seen = new Set<string>();
  return identities.filter((identity) => {
    const key = `${identity.type}:${identity.subject}:${identity.chainId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

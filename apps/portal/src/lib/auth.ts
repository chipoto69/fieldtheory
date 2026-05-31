import { jsonError } from "@/lib/http";

export interface AuthenticatedUser {
  id: string;
  privyUserId: string;
  identities: Array<{ type: "github" | "evm" | "solana"; subject: string }>;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export function requirePrivyUser(request: Request): AuthResult {
  if (!process.env.PRIVY_APP_SECRET) {
    return {
      ok: false,
      response: jsonError(
        "auth_not_configured",
        "Privy server verification is not configured; protected routes fail closed.",
        503,
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return {
      ok: false,
      response: jsonError("missing_authorization", "Protected route requires a Privy bearer token.", 401),
    };
  }

  if (process.env.PRIVY_DEV_ALLOW_UNSIGNED === "true" && token.startsWith("dev:")) {
    const id = token.slice("dev:".length).trim();
    if (!id) {
      return { ok: false, response: jsonError("invalid_dev_token", "Development token is empty.", 401) };
    }
    return {
      ok: true,
      user: {
        id,
        privyUserId: id,
        identities: [
          { type: "github", subject: `${id}-github` },
          { type: "evm", subject: "0x0000000000000000000000000000000000000000" },
          { type: "solana", subject: "DevSolanaIdentity111111111111111111111111111" },
        ],
      },
    };
  }

  return {
    ok: false,
    response: jsonError(
      "privy_verification_required",
      "Real Privy token verification is intentionally not bypassed in this scaffold.",
      401,
    ),
  };
}

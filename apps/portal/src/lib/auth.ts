import { jsonError } from "@/lib/http";
import { PrivyClient, type VerifyAccessTokenResponse } from "@privy-io/node";

export interface AuthenticatedUser {
  id: string;
  privyUserId: string;
  sessionId?: string;
  authSource: "privy" | "development";
  identities: Array<{ type: "github" | "evm" | "solana"; subject: string }>;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response };

export type PrivyAccessTokenVerifier = (token: string) => Promise<VerifyAccessTokenResponse>;

let testVerifier: PrivyAccessTokenVerifier | undefined;
let cachedClient:
  | {
      key: string;
      client: PrivyClient;
    }
  | undefined;

export async function requirePrivyUser(request: Request): Promise<AuthResult> {
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
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

  if (process.env.NODE_ENV !== "production" && process.env.PRIVY_DEV_ALLOW_UNSIGNED === "true" && token.startsWith("dev:")) {
    const id = token.slice("dev:".length).trim();
    if (!id) {
      return { ok: false, response: jsonError("invalid_dev_token", "Development token is empty.", 401) };
    }
    return {
      ok: true,
      user: {
        id,
        privyUserId: id,
        authSource: "development",
        identities: [
          { type: "github", subject: `${id}-github` },
          { type: "evm", subject: "0x0000000000000000000000000000000000000000" },
          { type: "solana", subject: "DevSolanaIdentity111111111111111111111111111" },
        ],
      },
    };
  }

  try {
    const claims = await getVerifier(appId, appSecret)(token);
    if (claims.app_id !== appId) {
      return {
        ok: false,
        response: jsonError("privy_app_mismatch", "Privy access token was issued for a different app.", 401),
      };
    }
    return {
      ok: true,
      user: {
        id: claims.user_id,
        privyUserId: claims.user_id,
        sessionId: claims.session_id,
        authSource: "privy",
        identities: [],
      },
    };
  } catch {
    return {
      ok: false,
      response: jsonError("privy_token_invalid", "Privy access token verification failed.", 401),
    };
  }
}

export function setPrivyVerifierForTests(verifier: PrivyAccessTokenVerifier | undefined): void {
  testVerifier = verifier;
}

function getVerifier(appId: string, appSecret: string): PrivyAccessTokenVerifier {
  if (testVerifier) return testVerifier;
  return async (token: string) => getPrivyClient(appId, appSecret).utils().auth().verifyAccessToken(token);
}

function getPrivyClient(appId: string, appSecret: string): PrivyClient {
  const jwtVerificationKey = process.env.PRIVY_JWT_VERIFICATION_KEY;
  const key = `${appId}:${appSecret}:${jwtVerificationKey ?? ""}`;
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = {
      key,
      client: new PrivyClient({
        appId,
        appSecret,
        jwtVerificationKey,
      }),
    };
  }
  return cachedClient.client;
}

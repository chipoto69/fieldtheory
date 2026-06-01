export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const authConfigured = hasValue(process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    && hasValue(process.env.PRIVY_APP_SECRET);
  const durableStoreConfigured = hasValue(process.env.DATABASE_URL);
  const production = process.env.NODE_ENV === "production";
  const mutableStoreReady = production ? durableStoreConfigured : true;
  const mutableRoutesReady = authConfigured && mutableStoreReady;

  return Response.json({
    ok: true,
    service: "fieldtheory-portal",
    status: mutableRoutesReady ? "configuration_ready" : "configuration_required",
    version: "0.2.0",
    readiness: {
      production,
      authConfigured,
      durableStoreConfigured,
      mutableStoreReady,
      mutableRoutesReady,
      schema: durableStoreConfigured ? "requires_external_migration_proof" : "not_configured",
      walletLinking: "deferred",
      x402Enforcement: "disabled",
    },
    x402Enabled: false,
    x402Requested: process.env.X402_ENABLED === "true",
  });
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

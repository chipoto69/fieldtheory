export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "fieldtheory-portal",
    status: "ready",
    version: "0.2.0",
    x402Enabled: false,
    x402Requested: process.env.X402_ENABLED === "true",
  });
}

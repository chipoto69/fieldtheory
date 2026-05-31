export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "fieldtheory-portal",
    status: "ready",
    version: "0.1.0",
    x402Enabled: process.env.X402_ENABLED === "true",
  });
}

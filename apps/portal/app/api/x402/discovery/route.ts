import { x402EndpointPlans } from "@/lib/fixtures";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    enabled: false,
    enforcement: "disabled",
    settlement: "not-implemented",
    endpoints: x402EndpointPlans,
    gates: [
      "endpoint inventory approval",
      "price policy owner",
      "facilitator verify/settle assumptions",
      "replay protection",
      "payment metadata privacy review",
      "audit event shape",
    ],
  });
}

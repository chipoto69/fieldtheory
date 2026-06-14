import { endpointInventory, supportedContracts } from "@/lib/fixtures";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    contracts: supportedContracts,
    endpoints: endpointInventory,
    applyEnabled: false,
    x402Enforcement: "disabled",
  });
}

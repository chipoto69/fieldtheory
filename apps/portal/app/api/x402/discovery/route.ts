import { x402Discovery } from "@/lib/fixtures";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(x402Discovery);
}

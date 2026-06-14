import { jsonError } from "@/lib/http";

export function requireMutableStore(): Response | null {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    return jsonError(
      "durable_store_not_configured",
      "Hosted mutations require a durable store adapter; the in-memory store is local/test only.",
      503,
    );
  }
  return null;
}

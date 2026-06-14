import { createHash } from "node:crypto";

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export class JsonRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function jsonOk<T>(body: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...body }, init);
}

export function jsonError(code: string, message: string, status: number): Response {
  return Response.json(
    {
      ok: false,
      error: { code, message },
    } satisfies ApiErrorBody,
    { status },
  );
}

export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new JsonRequestError("body_too_large", `Request body must be ${maxBytes} bytes or less.`, 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new JsonRequestError("body_too_large", `Request body must be ${maxBytes} bytes or less.`, 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonRequestError("invalid_json", "Request body must be valid JSON.", 400);
  }
}

export function jsonErrorFrom(error: unknown): Response {
  if (error instanceof JsonRequestError) return jsonError(error.code, error.message, error.status);
  return jsonError("invalid_request", error instanceof Error ? error.message : "Invalid request.", 400);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

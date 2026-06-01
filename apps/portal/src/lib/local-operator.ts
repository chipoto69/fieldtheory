export type LocalOperatorEnv = Partial<Record<
  "NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR" | "NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID" | "NODE_ENV",
  string
>>;

export function defaultLocalOperatorEnv(): LocalOperatorEnv {
  return {
    NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: process.env.NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR,
    NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID: process.env.NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export function isLocalOperatorModeEnabled(env: LocalOperatorEnv = defaultLocalOperatorEnv()): boolean {
  return env.NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR === "true" && env.NODE_ENV !== "production";
}

export function localOperatorIdFromEnv(env: LocalOperatorEnv = defaultLocalOperatorEnv()): string | undefined {
  const value = env.NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID?.trim() || "operator";
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : undefined;
}

export function buildLocalOperatorAuthorization(env: LocalOperatorEnv = defaultLocalOperatorEnv()): string | undefined {
  if (!isLocalOperatorModeEnabled(env)) return undefined;
  const operatorId = localOperatorIdFromEnv(env);
  return operatorId ? `Bearer dev:${operatorId}` : undefined;
}

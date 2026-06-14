import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalOperatorAuthorization,
  isLocalOperatorModeEnabled,
  localOperatorIdFromEnv,
} from "../src/lib/local-operator";

test("local operator mode is explicit and disabled in production", () => {
  assert.equal(isLocalOperatorModeEnabled({ NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "true", NODE_ENV: "development" }), true);
  assert.equal(isLocalOperatorModeEnabled({ NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "false", NODE_ENV: "development" }), false);
  assert.equal(isLocalOperatorModeEnabled({ NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "true", NODE_ENV: "production" }), false);
});

test("local operator authorization builds a safe dev bearer token", () => {
  const env = {
    NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "true",
    NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID: "rudy.local",
    NODE_ENV: "development",
  };

  assert.equal(localOperatorIdFromEnv(env), "rudy.local");
  assert.equal(buildLocalOperatorAuthorization(env), "Bearer dev:rudy.local");
});

test("local operator id falls back safely and rejects unsafe values", () => {
  assert.equal(localOperatorIdFromEnv({ NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "true" }), "operator");
  assert.equal(
    buildLocalOperatorAuthorization({
      NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR: "true",
      NEXT_PUBLIC_FIELD_THEORY_LOCAL_OPERATOR_ID: "operator\nAuthorization: Bearer bad",
      NODE_ENV: "development",
    }),
    undefined,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { POST as exportValidatePost } from "../app/api/exports/validate/route";
import { POST as runsPost } from "../app/api/agents/runs/route";
import { GET as runGet } from "../app/api/agents/runs/[id]/route";
import { setPrivyVerifierForTests } from "../src/lib/auth";
import { closePostgresHostedStoreForTests } from "../src/lib/postgres-store";
import { validAeonManifest } from "./fixtures";

const databaseUrl = process.env.DATABASE_URL;

test("postgres-backed route smoke persists imports, runs, and audit events", {
  skip: databaseUrl ? false : "DATABASE_URL not configured",
}, async () => {
  const previousEnv = snapshotEnv();
  const sql = postgres(databaseUrl as string, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });

  try {
    setEnv("NODE_ENV", "production");
    process.env.PRIVY_APP_ID = "test-app";
    process.env.PRIVY_APP_SECRET = "test-secret";
    delete process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE;
    delete process.env.FIELD_THEORY_PORTAL_AUTO_CREATE_SCHEMA;
    setPrivyVerifierForTests(async () => ({
      app_id: "test-app",
      issuer: "privy.io",
      issued_at: 1,
      expiration: 4_102_444_800,
      session_id: "session_postgres_smoke",
      user_id: "postgres-operator",
    }));

    const validate = await exportValidatePost(authJsonRequest("/api/exports/validate", validAeonManifest()));
    const validateBody = await validate.json();
    assert.equal(validate.status, 200);
    assert.equal(validateBody.import.ownerUserId, "postgres-operator");

    const createRun = await runsPost(authJsonRequest("/api/agents/runs", {
      target: "aeon",
      importId: validateBody.import.id,
      mode: "dry-run",
    }));
    const runBody = await createRun.json();
    assert.equal(createRun.status, 201);
    assert.equal(runBody.run.ownerUserId, "postgres-operator");

    const readRun = await runGet(authRequest(`http://localhost/api/agents/runs/${runBody.run.id}`), {
      params: Promise.resolve({ id: runBody.run.id }),
    });
    assert.equal(readRun.status, 200);

    const rows = await sql<Array<{
      import_count: number;
      run_count: number;
      audit_count: number;
    }>>`
      select
        (select count(*)::int from fieldtheory_imports where id = ${validateBody.import.id}) as import_count,
        (select count(*)::int from fieldtheory_agent_runs where id = ${runBody.run.id}) as run_count,
        (
          select count(*)::int
          from fieldtheory_audit_events
          where target_id = ${validateBody.import.id} or target_id = ${runBody.run.id}
        ) as audit_count
    `;
    assert.equal(rows[0].import_count, 1);
    assert.equal(rows[0].run_count, 1);
    assert.equal(rows[0].audit_count, 2);
  } finally {
    setPrivyVerifierForTests(undefined);
    restoreEnv(previousEnv);
    await closePostgresHostedStoreForTests();
    await sql.end({ timeout: 5 });
  }
});

function authJsonRequest(path: string, body: unknown): Request {
  return authRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function authRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers),
      authorization: "Bearer privy.valid",
    },
  });
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    PRIVY_DEV_ALLOW_UNSIGNED: process.env.PRIVY_DEV_ALLOW_UNSIGNED,
    FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE: process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE,
    FIELD_THEORY_PORTAL_AUTO_CREATE_SCHEMA: process.env.FIELD_THEORY_PORTAL_AUTO_CREATE_SCHEMA,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function restoreEnv(previousEnv: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previousEnv)) setEnv(key, value);
}

function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

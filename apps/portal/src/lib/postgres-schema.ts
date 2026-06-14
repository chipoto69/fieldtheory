import type { Sql } from "postgres";
import { JsonRequestError } from "./http";

export const POSTGRES_SCHEMA_VERSION = 2;

export async function createPostgresSchema(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      create table if not exists fieldtheory_schema_version (
        version integer primary key,
        applied_at timestamptz not null default now()
      )
    `;
    await tx`
      create table if not exists fieldtheory_imports (
        id text primary key,
        owner_user_id text not null,
        contract_version text not null,
        kind text not null,
        sha256 text not null,
        validation_status text not null check (validation_status in ('valid', 'invalid')),
        export_summary jsonb,
        created_at timestamptz not null
      )
    `;
    await tx`
      create table if not exists fieldtheory_agent_runs (
        id text primary key,
        owner_user_id text not null,
        target text not null,
        mode text not null,
        status text not null,
        import_id text not null references fieldtheory_imports(id),
        idempotency_key text,
        result_envelope jsonb not null,
        created_at timestamptz not null
      )
    `;
    await tx`alter table fieldtheory_agent_runs add column if not exists idempotency_key text`;
    await tx`
      create table if not exists fieldtheory_audit_events (
        id text primary key,
        actor_user_id text not null,
        action text not null,
        target_type text not null,
        target_id text not null,
        contract_hash text,
        outcome text not null,
        created_at timestamptz not null
      )
    `;
    await tx`create index if not exists fieldtheory_imports_owner_idx on fieldtheory_imports(owner_user_id)`;
    await tx`create index if not exists fieldtheory_runs_owner_idx on fieldtheory_agent_runs(owner_user_id)`;
    await tx`
      create unique index if not exists fieldtheory_runs_owner_idempotency_idx
      on fieldtheory_agent_runs(owner_user_id, idempotency_key)
      where idempotency_key is not null
    `;
    await tx`create index if not exists fieldtheory_audit_actor_idx on fieldtheory_audit_events(actor_user_id)`;
    await tx`
      insert into fieldtheory_schema_version (version)
      values (${POSTGRES_SCHEMA_VERSION})
      on conflict (version) do nothing
    `;
  });
}

export async function assertPostgresSchemaReady(sql: Sql): Promise<void> {
  try {
    const rows = await sql<{ version: number }[]>`
      select version from fieldtheory_schema_version
      where version = ${POSTGRES_SCHEMA_VERSION}
      limit 1
    `;
    if (rows.length > 0) return;
  } catch {
    throw schemaNotReadyError();
  }
  throw schemaNotReadyError();
}

function schemaNotReadyError(): JsonRequestError {
  return new JsonRequestError(
    "store_schema_not_ready",
    "Hosted durable store schema has not been migrated.",
    503,
  );
}

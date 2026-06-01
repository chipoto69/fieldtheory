import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { JsonRequestError, stableHash } from "@/lib/http";
import { assertPostgresSchemaReady, createPostgresSchema } from "@/lib/postgres-schema";
import {
  type AgentRun,
  type AppendAuditInput,
  type ArtifactImport,
  type AuditEvent,
  type CreateImportAuditInput,
  type CreateImportInput,
  type CreateRunAuditInput,
  type CreateRunInput,
  type HostedStore,
} from "@/lib/store";
import type { ExportManifestSummary } from "@/lib/contracts";

type StoreSql = Sql | postgres.TransactionSql;

class PostgresHostedStore implements HostedStore {
  private readonly sql: Sql;
  private schemaReady: Promise<void> | undefined;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  async createImport(input: CreateImportInput): Promise<ArtifactImport> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const item = buildImport(input);
      await insertImport(this.sql, item);
      return item;
    });
  }

  async createImportWithAudit(input: CreateImportInput, audit: CreateImportAuditInput): Promise<{ artifact: ArtifactImport; audit: AuditEvent }> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const artifact = buildImport(input);
      const auditEvent = buildAudit({
        ...audit,
        targetId: artifact.id,
        contractHash: artifact.sha256,
      });
      await this.sql.begin(async (sql) => {
        await insertImport(sql, artifact);
        await insertAudit(sql, auditEvent);
      });
      return { artifact, audit: auditEvent };
    });
  }

  async getImport(id: string): Promise<ArtifactImport | undefined> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const rows = await this.sql<ImportRow[]>`
        select * from fieldtheory_imports where id = ${id} limit 1
      `;
      return rows[0] ? importFromRow(rows[0]) : undefined;
    });
  }

  async createRun(input: CreateRunInput): Promise<AgentRun> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const run = buildRun(input);
      await insertRun(this.sql, run);
      return run;
    });
  }

  async createRunWithAudit(input: CreateRunInput, audit: CreateRunAuditInput): Promise<{ run: AgentRun; audit: AuditEvent }> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const run = buildRun(input);
      const auditEvent = buildAudit({
        ...audit,
        targetId: run.id,
      });
      await this.sql.begin(async (sql) => {
        await insertRun(sql, run);
        await insertAudit(sql, auditEvent);
      });
      return { run, audit: auditEvent };
    });
  }

  async getRun(id: string): Promise<AgentRun | undefined> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const rows = await this.sql<RunRow[]>`
        select * from fieldtheory_agent_runs where id = ${id} limit 1
      `;
      return rows[0] ? runFromRow(rows[0]) : undefined;
    });
  }

  async listAuditEventsForTarget(actorUserId: string, targetType: string, targetId: string): Promise<AuditEvent[]> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const rows = await this.sql<AuditRow[]>`
        select * from fieldtheory_audit_events
        where actor_user_id = ${actorUserId}
          and target_type = ${targetType}
          and target_id = ${targetId}
        order by created_at asc, id asc
      `;
      return rows.map(auditFromRow);
    });
  }

  async appendAudit(input: AppendAuditInput): Promise<AuditEvent> {
    return this.withStore(async () => {
      await this.ensureSchema();
      const event = buildAudit(input);
      await insertAudit(this.sql, event);
      return event;
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
    this.schemaReady = undefined;
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.prepareSchema();
    await this.schemaReady;
  }

  private async prepareSchema(): Promise<void> {
    if (process.env.NODE_ENV === "production" && process.env.FIELD_THEORY_PORTAL_AUTO_CREATE_SCHEMA !== "true") {
      await assertPostgresSchemaReady(this.sql);
      return;
    }
    await createPostgresSchema(this.sql);
  }

  private async withStore<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.schemaReady = undefined;
      if (error instanceof JsonRequestError) throw error;
      throw new JsonRequestError("store_unavailable", "Hosted durable store is unavailable.", 503);
    }
  }
}

function buildImport(input: CreateImportInput): ArtifactImport {
  const now = new Date().toISOString();
  const sha256 = stableHash(input.payload);
  return {
    id: idFor("import", `${input.ownerUserId}:${sha256}`),
    ownerUserId: input.ownerUserId,
    contractVersion: input.contractVersion,
    kind: input.kind,
    sha256,
    validationStatus: input.validationStatus,
    exportSummary: input.exportSummary,
    createdAt: now,
  };
}

function buildRun(input: CreateRunInput): AgentRun {
  const now = new Date().toISOString();
  return {
    ...input,
    id: idFor("run", `${input.ownerUserId}:${input.target}:${input.importId}:${now}:${randomUUID()}`),
    status: "created",
    createdAt: now,
  };
}

function buildAudit(input: AppendAuditInput): AuditEvent {
  const now = new Date().toISOString();
  return {
    ...input,
    id: idFor("audit", `${input.actorUserId}:${input.action}:${input.targetType}:${input.targetId}:${now}`),
    createdAt: now,
  };
}

async function insertImport(sql: StoreSql, item: ArtifactImport): Promise<void> {
  await sql`
    insert into fieldtheory_imports (
      id,
      owner_user_id,
      contract_version,
      kind,
      sha256,
      validation_status,
      export_summary,
      created_at
    ) values (
      ${item.id},
      ${item.ownerUserId},
      ${item.contractVersion},
      ${item.kind},
      ${item.sha256},
      ${item.validationStatus},
      ${sql.json(toPostgresJson(item.exportSummary ?? null))},
      ${item.createdAt}
    )
    on conflict (id) do update set
      validation_status = excluded.validation_status,
      export_summary = excluded.export_summary
  `;
}

async function insertRun(sql: StoreSql, run: AgentRun): Promise<void> {
  await sql`
    insert into fieldtheory_agent_runs (
      id,
      owner_user_id,
      target,
      mode,
      status,
      import_id,
      result_envelope,
      created_at
    ) values (
      ${run.id},
      ${run.ownerUserId},
      ${run.target},
      ${run.mode},
      ${run.status},
      ${run.importId},
      ${sql.json(toPostgresJson(run.resultEnvelope))},
      ${run.createdAt}
    )
  `;
}

async function insertAudit(sql: StoreSql, event: AuditEvent): Promise<void> {
  await sql`
    insert into fieldtheory_audit_events (
      id,
      actor_user_id,
      action,
      target_type,
      target_id,
      contract_hash,
      outcome,
      created_at
    ) values (
      ${event.id},
      ${event.actorUserId},
      ${event.action},
      ${event.targetType},
      ${event.targetId},
      ${event.contractHash ?? null},
      ${event.outcome},
      ${event.createdAt}
    )
  `;
}

type ImportRow = {
  id: string;
  owner_user_id: string;
  contract_version: string;
  kind: string;
  sha256: string;
  validation_status: "valid" | "invalid";
  export_summary: ExportManifestSummary | null;
  created_at: Date | string;
};

type RunRow = {
  id: string;
  owner_user_id: string;
  target: AgentRun["target"];
  mode: AgentRun["mode"];
  status: AgentRun["status"];
  import_id: string;
  result_envelope: Record<string, unknown>;
  created_at: Date | string;
};

type AuditRow = {
  id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  contract_hash: string | null;
  outcome: AuditEvent["outcome"];
  created_at: Date | string;
};

function importFromRow(row: ImportRow): ArtifactImport {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    contractVersion: row.contract_version,
    kind: row.kind,
    sha256: row.sha256,
    validationStatus: row.validation_status,
    exportSummary: row.export_summary ?? undefined,
    createdAt: toIso(row.created_at),
  };
}

function runFromRow(row: RunRow): AgentRun {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    target: row.target,
    mode: row.mode,
    status: row.status,
    importId: row.import_id,
    resultEnvelope: row.result_envelope,
    createdAt: toIso(row.created_at),
  };
}

function auditFromRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    contractHash: row.contract_hash ?? undefined,
    outcome: row.outcome,
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function idFor(prefix: string, value: string): string {
  return `${prefix}_${stableHash(value).slice(0, 16)}`;
}

function toPostgresJson(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

const globalStore = globalThis as typeof globalThis & {
  __fieldTheoryPostgresStore?: PostgresHostedStore;
  __fieldTheoryPostgresStoreUrl?: string;
};

export function getPostgresHostedStore(): HostedStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres hosted store.");
  if (!globalStore.__fieldTheoryPostgresStore || globalStore.__fieldTheoryPostgresStoreUrl !== databaseUrl) {
    globalStore.__fieldTheoryPostgresStore = new PostgresHostedStore(databaseUrl);
    globalStore.__fieldTheoryPostgresStoreUrl = databaseUrl;
  }
  return globalStore.__fieldTheoryPostgresStore;
}

export async function closePostgresHostedStoreForTests(): Promise<void> {
  await globalStore.__fieldTheoryPostgresStore?.close();
  globalStore.__fieldTheoryPostgresStore = undefined;
  globalStore.__fieldTheoryPostgresStoreUrl = undefined;
}

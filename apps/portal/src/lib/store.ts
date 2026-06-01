import { randomUUID } from "node:crypto";
import { stableHash } from "@/lib/http";
import type { ExportManifestSummary } from "@/lib/contracts";
import { getPostgresHostedStore } from "@/lib/postgres-store";

export type AgentTarget = "aeon" | "hermes" | "content-os";
export type RunMode = "dry-run" | "apply-plan";

export interface ArtifactImport {
  id: string;
  ownerUserId: string;
  contractVersion: string;
  kind: string;
  sha256: string;
  validationStatus: "valid" | "invalid";
  exportSummary?: ExportManifestSummary;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  ownerUserId: string;
  target: AgentTarget;
  mode: RunMode;
  status: "created" | "blocked";
  importId: string;
  resultEnvelope: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  contractHash?: string;
  outcome: "accepted" | "rejected" | "blocked";
  createdAt: string;
}

export type CreateImportInput = Omit<ArtifactImport, "id" | "sha256" | "createdAt"> & { payload: unknown };
export type CreateRunInput = Omit<AgentRun, "id" | "createdAt" | "status">;
export type AppendAuditInput = Omit<AuditEvent, "id" | "createdAt">;
export type CreateImportAuditInput = Omit<AppendAuditInput, "targetId" | "contractHash">;
export type CreateRunAuditInput = Omit<AppendAuditInput, "targetId">;

export interface HostedStore {
  createImport(input: CreateImportInput): Promise<ArtifactImport>;
  createImportWithAudit(input: CreateImportInput, audit: CreateImportAuditInput): Promise<{ artifact: ArtifactImport; audit: AuditEvent }>;
  getImport(id: string): Promise<ArtifactImport | undefined>;
  createRun(input: CreateRunInput): Promise<AgentRun>;
  createRunWithAudit(input: CreateRunInput, audit: CreateRunAuditInput): Promise<{ run: AgentRun; audit: AuditEvent }>;
  getRun(id: string): Promise<AgentRun | undefined>;
  appendAudit(input: AppendAuditInput): Promise<AuditEvent>;
}

export class MemoryHostedStore implements HostedStore {
  private imports = new Map<string, ArtifactImport>();
  private runs = new Map<string, AgentRun>();
  private auditEvents: AuditEvent[] = [];

  async createImport(input: CreateImportInput): Promise<ArtifactImport> {
    const now = new Date().toISOString();
    const sha256 = stableHash(input.payload);
    const item: ArtifactImport = {
      id: idFor("import", `${input.ownerUserId}:${sha256}`),
      ownerUserId: input.ownerUserId,
      contractVersion: input.contractVersion,
      kind: input.kind,
      sha256,
      validationStatus: input.validationStatus,
      exportSummary: input.exportSummary,
      createdAt: now,
    };
    this.imports.set(item.id, item);
    return item;
  }

  async createImportWithAudit(input: CreateImportInput, audit: CreateImportAuditInput): Promise<{ artifact: ArtifactImport; audit: AuditEvent }> {
    const artifact = await this.createImport(input);
    const auditEvent = await this.appendAudit({
      ...audit,
      targetId: artifact.id,
      contractHash: artifact.sha256,
    });
    return { artifact, audit: auditEvent };
  }

  async getImport(id: string): Promise<ArtifactImport | undefined> {
    return this.imports.get(id);
  }

  async createRun(input: CreateRunInput): Promise<AgentRun> {
    const now = new Date().toISOString();
    const run: AgentRun = {
      ...input,
      id: idFor("run", `${input.ownerUserId}:${input.target}:${input.importId}:${now}:${randomUUID()}`),
      status: "created",
      createdAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async createRunWithAudit(input: CreateRunInput, audit: CreateRunAuditInput): Promise<{ run: AgentRun; audit: AuditEvent }> {
    const run = await this.createRun(input);
    const auditEvent = await this.appendAudit({
      ...audit,
      targetId: run.id,
    });
    return { run, audit: auditEvent };
  }

  async getRun(id: string): Promise<AgentRun | undefined> {
    return this.runs.get(id);
  }

  async appendAudit(input: AppendAuditInput): Promise<AuditEvent> {
    const now = new Date().toISOString();
    const event: AuditEvent = {
      ...input,
      id: idFor("audit", `${input.actorUserId}:${input.action}:${input.targetType}:${input.targetId}:${now}`),
      createdAt: now,
    };
    this.auditEvents.push(event);
    return event;
  }

  listAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  resetForTests(): void {
    this.imports.clear();
    this.runs.clear();
    this.auditEvents = [];
  }
}

const globalStore = globalThis as typeof globalThis & { __fieldTheoryPortalStore?: MemoryHostedStore };
export const hostedStore = globalStore.__fieldTheoryPortalStore ?? new MemoryHostedStore();
globalStore.__fieldTheoryPortalStore = hostedStore;

export function getHostedStore(): HostedStore {
  const allowMemoryStore = process.env.NODE_ENV !== "production" && process.env.FIELD_THEORY_PORTAL_ALLOW_MEMORY_STORE === "true";
  if (process.env.DATABASE_URL && !allowMemoryStore) {
    return getPostgresHostedStore();
  }
  return hostedStore;
}

export function idFor(prefix: string, value: string): string {
  return `${prefix}_${stableHash(value).slice(0, 16)}`;
}

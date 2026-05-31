import { stableHash } from "@/lib/http";
import type { ExportManifestSummary } from "@/lib/contracts";

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

class MemoryHostedStore {
  private imports = new Map<string, ArtifactImport>();
  private runs = new Map<string, AgentRun>();
  private auditEvents: AuditEvent[] = [];

  createImport(input: Omit<ArtifactImport, "id" | "sha256" | "createdAt"> & { payload: unknown }): ArtifactImport {
    const now = new Date().toISOString();
    const sha256 = stableHash(input.payload);
    const item: ArtifactImport = {
      id: idFor("import", sha256),
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

  getImport(id: string): ArtifactImport | undefined {
    return this.imports.get(id);
  }

  createRun(input: Omit<AgentRun, "id" | "createdAt" | "status">): AgentRun {
    const now = new Date().toISOString();
    const run: AgentRun = {
      ...input,
      id: idFor("run", `${input.ownerUserId}:${input.target}:${input.importId}:${now}`),
      status: "created",
      createdAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  getRun(id: string): AgentRun | undefined {
    return this.runs.get(id);
  }

  appendAudit(input: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
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

function idFor(prefix: string, value: string): string {
  return `${prefix}_${stableHash(value).slice(0, 16)}`;
}

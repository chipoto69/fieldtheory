import type { AgentTarget } from "@/lib/store";
import type { ExportManifestSummary } from "@/lib/contracts";

export interface ImportPlan {
  version: "fieldtheory.hosted-import-plan.v1";
  target: AgentTarget;
  dryRun: true;
  applyEnabled: false;
  applyGate: "required";
  steps: string[];
  forbiddenActions: string[];
  source: {
    runId: string;
    fileRelPaths: string[];
  };
}

export function buildImportPlan(target: AgentTarget, source: Pick<ExportManifestSummary, "runId" | "fileRelPaths" | "forbiddenWrites">): ImportPlan {
  const runId = source.runId;
  const fileRelPaths = source.fileRelPaths;
  if (target === "aeon") {
    const forbiddenActions = uniqueActions([
      ...source.forbiddenWrites,
      "create_repo",
      "push_remote",
      "write_github_secret",
      "dispatch_workflow",
      "write_github_workflow",
    ]);
    return {
      version: "fieldtheory.hosted-import-plan.v1",
      target,
      dryRun: true,
      applyEnabled: false,
      applyGate: "required",
      steps: [
        `Read export manifest for ${runId}.`,
        "Stage fieldtheory/exports/<run-id>/ files as an Aeon/Gordo import bundle.",
        "Keep aeon.yml.draft as a draft until an apply-gate command exists.",
      ],
      forbiddenActions,
      source: { runId, fileRelPaths },
    };
  }

  if (target === "hermes") {
    const forbiddenActions = uniqueActions([
      ...source.forbiddenWrites,
      "kanban_write",
      "profile_mutation",
      "gbrain_write",
      "wiki_canon_write",
      "external_dispatch",
    ]);
    return {
      version: "fieldtheory.hosted-import-plan.v1",
      target,
      dryRun: true,
      applyEnabled: false,
      applyGate: "required",
      steps: [
        `Read export manifest for ${runId}.`,
        "Stage hermes/task-payload.dry-run.json as an operator-reviewed handoff.",
        "Keep profile, Kanban, GBrain, and wiki writes disabled.",
      ],
      forbiddenActions,
      source: { runId, fileRelPaths },
    };
  }

  return {
    version: "fieldtheory.hosted-import-plan.v1",
    target,
    dryRun: true,
    applyEnabled: false,
    applyGate: "required",
    steps: ["Validate brief evidence before content packaging.", "Keep canon promotion blocked until explicit review."],
    forbiddenActions: uniqueActions([...source.forbiddenWrites, "wiki_canon_write", "gbrain_write", "external_dispatch"]),
    source: { runId, fileRelPaths },
  };
}

function uniqueActions(actions: string[]): string[] {
  return [...new Set(actions)].filter(Boolean).sort();
}

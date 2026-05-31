import type { AgentTarget } from "@/lib/store";

export interface ImportPlan {
  version: "fieldtheory.hosted-import-plan.v1";
  target: AgentTarget;
  dryRun: true;
  applyEnabled: false;
  applyGate: "required";
  steps: string[];
  forbiddenActions: string[];
}

export function buildImportPlan(target: AgentTarget, manifest: Record<string, unknown>): ImportPlan {
  const runId = typeof manifest.runId === "string" ? manifest.runId : "unknown";
  if (target === "aeon") {
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
      forbiddenActions: ["create_repo", "push_remote", "write_github_secret", "dispatch_workflow", "write_github_workflow"],
    };
  }

  if (target === "hermes") {
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
      forbiddenActions: ["kanban_write", "profile_mutation", "gbrain_write", "wiki_canon_write", "external_dispatch"],
    };
  }

  return {
    version: "fieldtheory.hosted-import-plan.v1",
    target,
    dryRun: true,
    applyEnabled: false,
    applyGate: "required",
    steps: ["Validate brief evidence before content packaging.", "Keep canon promotion blocked until explicit review."],
    forbiddenActions: ["wiki_canon_write", "gbrain_write", "external_dispatch"],
  };
}

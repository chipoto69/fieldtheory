export function validBriefPack(): Record<string, any> {
  return {
    id: "pack_test",
    version: "agent-brief-pack.v1",
    kind: "source_packet",
    generatedAt: "2026-05-31T13:00:00.000Z",
    input: { sourceBookmarkId: "b1", target: "aeon" },
    limits: { captures: 5, library: 5, commands: 3, bookmarks: 8 },
    storeStatus: [{ store: "captures", status: "available" }],
    summary: "Test summary",
    summaryClaims: [{ text: "Claim", evidenceIds: ["ev1"] }],
    evidence: [{
      id: "ev1",
      sourceType: "capture",
      title: "Capture",
      locator: "Captures/test.md",
      excerpt: "Evidence",
      rank: 1,
      sourceRank: 1,
      score: 1,
      scoreReason: "fixture",
      retrievedAt: "2026-05-31T13:00:00.000Z",
      tags: [],
    }],
    typedSlots: [],
    suggestedCommands: [],
    sourcePacket: {
      target: "aeon",
      agentRoute: "build_handoff",
      sourceId: "b1",
      whySavedStatus: "known",
      confidence: 0.9,
      forbiddenActions: ["create_repo"],
      payload: {},
    },
    boundaries: [{
      id: "boundary_test",
      authority: "dry-run",
      gate: "operator export",
      rule: "No writeback",
      reason: "Local only",
      forbiddenActions: ["create_repo"],
      evidenceIds: ["ev1"],
    }],
    promotionCandidates: [],
    resultEnvelope: { status: "complete", resultCount: 1, warnings: [], generatedBy: "fieldtheory" },
  };
}

export function validAeonManifest(): Record<string, any> {
  return {
    version: "fieldtheory.agent-export.v1",
    target: "aeon",
    runId: "aeon-20260531T130000Z",
    generatedAt: "2026-05-31T13:00:00.000Z",
    contracts: {
      brief: "agent-brief-pack.v1",
      capture: "fieldtheory.capture.v1",
    },
    inputs: { query: "agent memory", includeSoul: true, includeBriefs: true },
    forbiddenWrites: ["create_repo", "push_remote", "write_github_secret", "dispatch_workflow", "write_github_workflow", "network_call"],
    files: [
      {
        path: "/tmp/out/fieldtheory/exports/aeon-20260531T130000Z/brief.json",
        relPath: "fieldtheory/exports/aeon-20260531T130000Z/brief.json",
        sha256: "a".repeat(64),
      },
      {
        path: "/tmp/out/fieldtheory/exports/aeon-20260531T130000Z/manifest.json",
        relPath: "fieldtheory/exports/aeon-20260531T130000Z/manifest.json",
        sha256: "b".repeat(64),
      },
    ],
    resultEnvelope: { status: "complete", resultCount: 1, warnings: [], generatedBy: "fieldtheory" },
  };
}

export type WorkbenchFixtureTarget = "aeon" | "hermes" | "content-os";

export interface WorkbenchFixture {
  id: string;
  label: string;
  description: string;
  target: WorkbenchFixtureTarget;
  payload: Record<string, unknown>;
}

export const workbenchFixtures: WorkbenchFixture[] = [
  {
    id: "brief-source-packet",
    label: "Source packet",
    description: "Valid AgentBriefPack for a content-os dry-run.",
    target: "content-os",
    payload: {
      id: "pack_operator_fixture",
      version: "agent-brief-pack.v1",
      kind: "source_packet",
      generatedAt: "2026-06-01T00:00:00.000Z",
      input: { sourceBookmarkId: "bookmark_operator_fixture", target: "content-os" },
      limits: { captures: 5, library: 5, commands: 3, bookmarks: 8 },
      storeStatus: [{ store: "captures", status: "available" }],
      summary: "Operator fixture packet for reviewing capture evidence before any canon or agent writeback.",
      summaryClaims: [{ text: "The fixture has one cited capture evidence item.", evidenceIds: ["evidence_fixture"] }],
      evidence: [{
        id: "evidence_fixture",
        sourceType: "capture",
        title: "Operator capture fixture",
        locator: "Captures/operator-fixture.md",
        excerpt: "A saved source should be reviewed and packetized before agent dispatch.",
        rank: 1,
        sourceRank: 1,
        score: 1,
        scoreReason: "operator fixture",
        retrievedAt: "2026-06-01T00:00:00.000Z",
        tags: ["operator", "fixture"],
      }],
      typedSlots: [],
      suggestedCommands: [],
      sourcePacket: {
        target: "content-os",
        agentRoute: "draft_handoff",
        sourceId: "bookmark_operator_fixture",
        whySavedStatus: "known",
        confidence: 0.9,
        forbiddenActions: ["wiki_canon_write", "gbrain_write", "external_dispatch"],
        payload: {},
      },
      boundaries: [{
        id: "boundary_fixture",
        authority: "dry-run",
        gate: "operator approval",
        rule: "No canon or remote writeback from fixture review.",
        reason: "The portal must stay an audit/control plane until apply gates exist.",
        forbiddenActions: ["wiki_canon_write", "gbrain_write", "external_dispatch"],
        evidenceIds: ["evidence_fixture"],
      }],
      promotionCandidates: [],
      resultEnvelope: { status: "complete", resultCount: 1, warnings: [], generatedBy: "fieldtheory" },
    },
  },
  {
    id: "aeon-export",
    label: "Aeon export",
    description: "Valid Field Theory export manifest for a Gordo/Aeon dry-run.",
    target: "aeon",
    payload: {
      version: "fieldtheory.agent-export.v1",
      target: "aeon",
      runId: "aeon-operator-fixture",
      generatedAt: "2026-06-01T00:00:00.000Z",
      contracts: {
        brief: "agent-brief-pack.v1",
        capture: "fieldtheory.capture.v1",
      },
      inputs: { query: "operator fixture", includeSoul: true, includeBriefs: true },
      forbiddenWrites: ["create_repo", "push_remote", "write_github_secret", "dispatch_workflow", "write_github_workflow", "network_call"],
      files: [
        {
          relPath: "fieldtheory/exports/aeon-operator-fixture/brief.json",
          sha256: "a".repeat(64),
        },
        {
          relPath: "fieldtheory/exports/aeon-operator-fixture/aeon/aeon.yml.draft",
          sha256: "b".repeat(64),
        },
      ],
      resultEnvelope: { status: "complete", resultCount: 2, warnings: [], generatedBy: "fieldtheory" },
    },
  },
  {
    id: "hermes-export",
    label: "Hermes export",
    description: "Valid Field Theory export manifest for a Hermes dry-run.",
    target: "hermes",
    payload: {
      version: "fieldtheory.agent-export.v1",
      target: "hermes",
      runId: "hermes-operator-fixture",
      generatedAt: "2026-06-01T00:00:00.000Z",
      contracts: {
        brief: "agent-brief-pack.v1",
        capture: "fieldtheory.capture.v1",
      },
      inputs: { query: "operator fixture", includeBriefs: true },
      forbiddenWrites: ["kanban_write", "profile_mutation", "external_dispatch", "gbrain_write", "wiki_canon_write", "network_call"],
      files: [
        {
          relPath: "fieldtheory/exports/hermes-operator-fixture/brief.json",
          sha256: "c".repeat(64),
        },
        {
          relPath: "fieldtheory/exports/hermes-operator-fixture/hermes/task-payload.dry-run.json",
          sha256: "d".repeat(64),
        },
      ],
      resultEnvelope: { status: "complete", resultCount: 2, warnings: [], generatedBy: "fieldtheory" },
    },
  },
];

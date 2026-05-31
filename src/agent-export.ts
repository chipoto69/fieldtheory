import fs from "node:fs";
import path from "node:path";
import {
  formatAgentBriefPackMarkdown,
  type AgentBriefPack,
  type AgentBriefTarget,
  type ResultEnvelope,
} from "./agent-brief-pack.js";
import { buildBookmarkPacket } from "./packet.js";
import { buildRecallPack } from "./recall.js";
import { draftSoulFiles, type SoulDraftSourceName } from "./soul-draft.js";
import { sha256 } from "./document-ops.js";
import { assertNoSensitiveContent } from "./sensitive-content.js";
import {
  resolveOutputRoot,
  safeId,
  writeFixedBundleFile,
  type OutputRoot,
} from "./output-guard.js";

export interface ExportBundleFile {
  path: string;
  relPath: string;
  sha256: string;
}

export interface AgentExportManifest {
  version: "fieldtheory.agent-export.v1";
  target: "aeon" | "hermes" | "soul";
  runId: string;
  generatedAt: string;
  contracts: {
    brief: "agent-brief-pack.v1";
    capture: "fieldtheory.capture.v1";
  };
  inputs: Record<string, unknown>;
  forbiddenWrites: string[];
  files: ExportBundleFile[];
  resultEnvelope: ResultEnvelope;
}

export interface AgentExportResult {
  root: string;
  runId: string;
  files: ExportBundleFile[];
  manifest: AgentExportManifest;
}

export interface ExportAeonBundleOptions {
  repoPath: string;
  query?: string;
  bookmarkIds?: string[];
  includeSoul?: boolean;
  includeBriefs?: boolean;
  allowExistingRepo?: boolean;
  force?: boolean;
  now?: Date;
}

export interface ExportHermesBundleOptions {
  outDir: string;
  query?: string;
  bookmarkIds?: string[];
  includeBriefs?: boolean;
  force?: boolean;
  now?: Date;
}

export interface ExportSoulBundleOptions {
  outDir: string;
  from?: SoulDraftSourceName[];
  force?: boolean;
  now?: Date;
}

const AEON_FORBIDDEN_WRITES = [
  "create_repo",
  "push_remote",
  "write_github_secret",
  "dispatch_workflow",
  "write_root_aeon_yml",
  "write_github_workflow",
  "network_call",
];

const HERMES_FORBIDDEN_WRITES = [
  "kanban_write",
  "profile_mutation",
  "external_dispatch",
  "gbrain_write",
  "wiki_canon_write",
  "network_call",
];

const SOUL_FORBIDDEN_WRITES = [
  "wiki_canon_write",
  "gbrain_write",
  "honcho_write",
  "target_agent_write",
  "network_call",
];

function runId(target: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${target}-${stamp}`;
}

function writeBundleFile(
  root: OutputRoot,
  relPath: string,
  content: string,
  force: boolean,
): ExportBundleFile {
  assertNoSensitiveContent(content, `export output ${relPath}`);
  const written = writeFixedBundleFile(root, relPath, content, { force });
  return { path: written, relPath, sha256: sha256(content) };
}

function relToRoot(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function resultEnvelopeFrom(
  statusInputs: ResultEnvelope[],
  resultCount: number,
  warnings: string[],
): ResultEnvelope {
  return {
    status:
      statusInputs.some((item) => item.status === "partial") ||
      resultCount === 0
        ? "partial"
        : "complete",
    resultCount,
    warnings,
    generatedBy: "fieldtheory",
  };
}

async function buildPackets(
  target: AgentBriefTarget,
  bookmarkIds: string[],
  now: Date,
): Promise<AgentBriefPack[]> {
  const packets: AgentBriefPack[] = [];
  for (const id of bookmarkIds) {
    packets.push(await buildBookmarkPacket(id, { target, now }));
  }
  return packets;
}

function packetRelPath(
  target: "aeon" | "hermes",
  id: string,
  ext: "json" | "md",
): string {
  return `packets/${target}-bookmark-${safeId(id)}.${ext}`;
}

function sourceIndexContent(
  generatedAt: string,
  brief: AgentBriefPack | null,
  packets: AgentBriefPack[],
): string {
  const sources = [
    ...(brief?.evidence ?? []).map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      locator: item.locator,
      hash: item.hash,
    })),
    ...packets.map((packet) => ({
      id: packet.sourceBookmarkId ?? packet.id,
      sourceType: "bookmark",
      locator: packet.sourcePacket?.sourceUrl ?? packet.sourcePacket?.sourceId,
      hash: sha256(JSON.stringify(packet.sourcePacket ?? packet.input)),
    })),
  ];
  return `${JSON.stringify({ version: "fieldtheory.export-source-index.v1", generatedAt, sources }, null, 2)}\n`;
}

function draftAeonConfig(generatedAt: string, run: string): string {
  return [
    "# Aeon/Gordo Field Theory export draft",
    `generated_at: ${generatedAt}`,
    `run_id: ${run}`,
    "status: dry-run",
    "apply_gate: required",
    "forbidden:",
    ...AEON_FORBIDDEN_WRITES.map((item) => `  - ${item}`),
    "",
  ].join("\n");
}

function hermesTaskPayload(
  generatedAt: string,
  packets: AgentBriefPack[],
): string {
  return `${JSON.stringify(
    {
      version: "fieldtheory.hermes-task-payload.v1",
      generatedAt,
      dryRun: true,
      packets: packets.map((packet) => packet.sourcePacket?.payload ?? {}),
    },
    null,
    2,
  )}\n`;
}

function hermesProfileHandoff(
  generatedAt: string,
  packets: AgentBriefPack[],
): string {
  return [
    "# Hermes Profile Handoff",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Dry-run only. No Hermes profile, Kanban, GBrain, or wiki writes were attempted.",
    "",
    "## Packets",
    "",
    packets.length > 0
      ? packets.map((packet) => `- ${packet.id}: ${packet.summary}`).join("\n")
      : "- No bookmark packets requested.",
    "",
  ].join("\n");
}

function manifestContent(manifest: AgentExportManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function assertExistingGitGate(
  rootPath: string,
  allowExistingRepo: boolean | undefined,
): void {
  if (fs.existsSync(path.join(rootPath, ".git")) && !allowExistingRepo) {
    throw new Error(
      "Refusing to export into an existing git repo without --allow-existing-repo.",
    );
  }
}

export async function exportAeonBundle(
  options: ExportAeonBundleOptions,
): Promise<AgentExportResult> {
  const root = resolveOutputRoot(options.repoPath);
  assertExistingGitGate(root.resolved, options.allowExistingRepo);

  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const id = runId("aeon", now);
  const force = options.force ?? false;
  const bookmarkIds = options.bookmarkIds ?? [];
  const files: ExportBundleFile[] = [];
  const warnings: string[] = [];
  let brief: AgentBriefPack | null = null;
  let soulResultCount = 0;

  if (options.includeBriefs) {
    brief = await buildRecallPack(options.query ?? "agent memory", { now });
    const jsonRel = `fieldtheory/exports/${id}/brief.json`;
    const mdRel = `fieldtheory/exports/${id}/brief.md`;
    files.push(
      writeBundleFile(
        root,
        jsonRel,
        `${JSON.stringify(brief, null, 2)}\n`,
        force,
      ),
    );
    files.push(
      writeBundleFile(root, mdRel, formatAgentBriefPackMarkdown(brief), force),
    );
    warnings.push(...brief.resultEnvelope.warnings);
  }

  const packets = await buildPackets("aeon", bookmarkIds, now);
  for (const packet of packets) {
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/${packetRelPath("aeon", packet.sourceBookmarkId ?? packet.id, "json")}`,
        `${JSON.stringify(packet, null, 2)}\n`,
        force,
      ),
    );
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/${packetRelPath("aeon", packet.sourceBookmarkId ?? packet.id, "md")}`,
        formatAgentBriefPackMarkdown(packet),
        force,
      ),
    );
    warnings.push(...packet.resultEnvelope.warnings);
  }

  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/sources/source-index.json`,
      sourceIndexContent(generatedAt, brief, packets),
      force,
    ),
  );
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/reports/export-report.json`,
      `${JSON.stringify(
        {
          target: "aeon",
          runId: id,
          generatedAt,
          dryRun: true,
          forbiddenWrites: AEON_FORBIDDEN_WRITES,
        },
        null,
        2,
      )}\n`,
      force,
    ),
  );
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/aeon/aeon.yml.draft`,
      draftAeonConfig(generatedAt, id),
      force,
    ),
  );

  if (options.includeSoul) {
    const soul = await draftSoulFiles({
      from: ["clipboard", "library"],
      outDir: path.join(root.resolved, "soul"),
      now,
      force,
    });
    soulResultCount = soul.sourceIndex.sources.length;
    files.push(
      ...soul.files.map((file) => ({
        path: file.path,
        relPath: relToRoot(root.resolved, file.path),
        sha256: file.sha256,
      })),
    );
  }

  const envelopes = [brief?.resultEnvelope].filter(
    (item): item is ResultEnvelope => Boolean(item),
  );
  const resultEnvelope = resultEnvelopeFrom(
    envelopes,
    (brief?.evidence.length ?? 0) + packets.length + soulResultCount,
    warnings,
  );
  const manifest: AgentExportManifest = {
    version: "fieldtheory.agent-export.v1",
    target: "aeon",
    runId: id,
    generatedAt,
    contracts: {
      brief: "agent-brief-pack.v1",
      capture: "fieldtheory.capture.v1",
    },
    inputs: {
      query: options.query ?? "agent memory",
      bookmarkIds,
      includeSoul: options.includeSoul ?? false,
      includeBriefs: options.includeBriefs ?? false,
      allowExistingRepo: options.allowExistingRepo ?? false,
    },
    forbiddenWrites: AEON_FORBIDDEN_WRITES,
    files,
    resultEnvelope,
  };
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/manifest.json`,
      manifestContent(manifest),
      force,
    ),
  );

  return { root: root.resolved, runId: id, files, manifest };
}

export async function exportHermesBundle(
  options: ExportHermesBundleOptions,
): Promise<AgentExportResult> {
  const root = resolveOutputRoot(options.outDir);
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const id = runId("hermes", now);
  const force = options.force ?? false;
  const bookmarkIds = options.bookmarkIds ?? [];
  const files: ExportBundleFile[] = [];
  const warnings: string[] = [];
  let brief: AgentBriefPack | null = null;

  if (options.includeBriefs) {
    brief = await buildRecallPack(options.query ?? "agent memory", { now });
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/brief.json`,
        `${JSON.stringify(brief, null, 2)}\n`,
        force,
      ),
    );
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/brief.md`,
        formatAgentBriefPackMarkdown(brief),
        force,
      ),
    );
    warnings.push(...brief.resultEnvelope.warnings);
  }

  const packets = await buildPackets("hermes", bookmarkIds, now);
  for (const packet of packets) {
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/${packetRelPath("hermes", packet.sourceBookmarkId ?? packet.id, "json")}`,
        `${JSON.stringify(packet, null, 2)}\n`,
        force,
      ),
    );
    files.push(
      writeBundleFile(
        root,
        `fieldtheory/exports/${id}/${packetRelPath("hermes", packet.sourceBookmarkId ?? packet.id, "md")}`,
        formatAgentBriefPackMarkdown(packet),
        force,
      ),
    );
    warnings.push(...packet.resultEnvelope.warnings);
  }

  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/hermes/task-payload.dry-run.json`,
      hermesTaskPayload(generatedAt, packets),
      force,
    ),
  );
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/hermes/profile-handoff.md`,
      hermesProfileHandoff(generatedAt, packets),
      force,
    ),
  );
  const envelopes = [brief?.resultEnvelope].filter(
    (item): item is ResultEnvelope => Boolean(item),
  );
  const resultEnvelope = resultEnvelopeFrom(
    envelopes,
    (brief?.evidence.length ?? 0) + packets.length,
    warnings,
  );
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/hermes/result-envelope.json`,
      `${JSON.stringify(resultEnvelope, null, 2)}\n`,
      force,
    ),
  );
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/sources/source-index.json`,
      sourceIndexContent(generatedAt, brief, packets),
      force,
    ),
  );

  const manifest: AgentExportManifest = {
    version: "fieldtheory.agent-export.v1",
    target: "hermes",
    runId: id,
    generatedAt,
    contracts: {
      brief: "agent-brief-pack.v1",
      capture: "fieldtheory.capture.v1",
    },
    inputs: {
      query: options.query ?? "agent memory",
      bookmarkIds,
      includeBriefs: options.includeBriefs ?? false,
    },
    forbiddenWrites: HERMES_FORBIDDEN_WRITES,
    files,
    resultEnvelope,
  };
  files.push(
    writeBundleFile(
      root,
      `fieldtheory/exports/${id}/manifest.json`,
      manifestContent(manifest),
      force,
    ),
  );

  return { root: root.resolved, runId: id, files, manifest };
}

export async function exportSoulBundle(
  options: ExportSoulBundleOptions,
): Promise<AgentExportResult> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const id = runId("soul", now);
  const soul = await draftSoulFiles({
    from: options.from ?? ["clipboard", "library", "bookmarks"],
    outDir: options.outDir,
    now,
    force: options.force,
  });
  const root = resolveOutputRoot(options.outDir);
  const files = [...soul.files];
  const resultEnvelope = resultEnvelopeFrom(
    [],
    soul.sourceIndex.sources.length,
    [],
  );
  const manifest: AgentExportManifest = {
    version: "fieldtheory.agent-export.v1",
    target: "soul",
    runId: id,
    generatedAt,
    contracts: {
      brief: "agent-brief-pack.v1",
      capture: "fieldtheory.capture.v1",
    },
    inputs: { from: options.from ?? ["clipboard", "library", "bookmarks"] },
    forbiddenWrites: SOUL_FORBIDDEN_WRITES,
    files,
    resultEnvelope,
  };

  return { root: root.resolved, runId: id, files, manifest };
}

import fs from 'node:fs';
import { getBookmarkById, type BookmarkTimelineItem } from './bookmarks-db.js';
import { twitterBookmarksIndexPath } from './paths.js';
import {
  assertValidAgentBriefPack,
  type AgentBriefPack,
  type AgentBriefTarget,
  type BoundaryNote,
  type EvidenceItem,
  type SourcePacket,
} from './agent-brief-pack.js';

export interface BuildBookmarkPacketOptions {
  target: AgentBriefTarget;
  now?: Date;
}

const TARGET_ROUTES: Record<AgentBriefTarget, SourcePacket['agentRoute']> = {
  aeon: 'build_handoff',
  hermes: 'recon_candidate',
  'content-os': 'synthesis_evidence',
};

const TARGET_FORBIDDEN_ACTIONS: Record<AgentBriefTarget, string[]> = {
  aeon: ['create_repo', 'push_remote', 'write_github_secret', 'dispatch_workflow'],
  hermes: ['kanban_write', 'profile_mutation', 'external_dispatch'],
  'content-os': ['content_os_write', 'wiki_canon_write', 'gbrain_write'],
};

export async function buildBookmarkPacket(
  id: string,
  options: BuildBookmarkPacketOptions,
): Promise<AgentBriefPack> {
  if (!Object.prototype.hasOwnProperty.call(TARGET_ROUTES, options.target)) {
    throw new Error(`Unsupported packet target: ${String(options.target)}`);
  }

  if (!fs.existsSync(twitterBookmarksIndexPath())) {
    throw new Error('Bookmark index missing; run ft sync or ft index first.');
  }

  const bookmark = await getBookmarkById(id);
  if (!bookmark) throw new Error(`Bookmark not found: ${id}`);

  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const evidence = buildEvidence(bookmark, generatedAt);
  const forbiddenActions = TARGET_FORBIDDEN_ACTIONS[options.target];
  const sourcePacket: SourcePacket = {
    target: options.target,
    agentRoute: TARGET_ROUTES[options.target],
    sourceId: bookmark.id,
    sourceUrl: bookmark.url,
    whySavedStatus: 'unknown',
    confidence: 0.68,
    forbiddenActions,
    payload: buildPayload(options.target, bookmark, generatedAt),
  };
  const boundaries = buildBoundaries(options.target, bookmark.id, forbiddenActions);

  const pack: AgentBriefPack = {
    id: `source_packet_${options.target}_${sanitizeId(bookmark.id)}`,
    version: 'agent-brief-pack.v1',
    kind: 'source_packet',
    generatedAt,
    input: { sourceBookmarkId: bookmark.id, target: options.target },
    limits: { captures: 0, library: 0, commands: 0, bookmarks: 1 },
    storeStatus: [{ store: 'bookmarks', status: 'available' }],
    sourceBookmarkId: bookmark.id,
    summary: `Dry-run ${options.target} source packet for bookmark ${bookmark.id}.`,
    summaryClaims: [
      {
        text: 'The source packet is derived from one local bookmark record.',
        evidenceIds: [evidence[0].id],
      },
    ],
    evidence,
    typedSlots: [
      {
        type: 'source',
        label: 'bookmark',
        value: bookmark.url,
        evidenceIds: [evidence[0].id],
      },
    ],
    suggestedCommands: [],
    sourcePacket,
    boundaries,
    promotionCandidates: [
      {
        destination: options.target === 'content-os' ? 'none' : 'skill',
        status: options.target === 'content-os' ? 'blocked' : 'candidate',
        reason: 'Packet is dry-run only; target-system writes require a separate adapter gate.',
        evidenceIds: [evidence[0].id],
      },
    ],
    resultEnvelope: {
      status: 'complete',
      resultCount: 1,
      warnings: ['whySavedStatus remains unknown because no explicit saved-intent evidence was found.'],
      generatedBy: 'fieldtheory',
    },
  };

  assertValidAgentBriefPack(pack);
  return pack;
}

function buildEvidence(bookmark: BookmarkTimelineItem, retrievedAt: string): EvidenceItem[] {
  const title = bookmark.articleTitle
    || (bookmark.authorHandle ? `@${bookmark.authorHandle} bookmark` : `Bookmark ${bookmark.id}`);
  return [
    {
      id: `bookmark:${bookmark.id}`,
      sourceType: 'bookmark',
      title,
      locator: bookmark.url,
      excerpt: excerpt(bookmark.articleText || bookmark.text),
      rank: 1,
      sourceRank: 1,
      score: 1,
      scoreReason: 'selected bookmark id',
      retrievedAt,
      capturedAt: bookmark.bookmarkedAt ?? bookmark.postedAt ?? bookmark.syncedAt ?? undefined,
      tags: [...new Set([...bookmark.categories, ...bookmark.folderNames])],
    },
  ];
}

function buildBoundaries(
  target: AgentBriefTarget,
  sourceId: string,
  forbiddenActions: string[],
): BoundaryNote[] {
  return [
    {
      id: `boundary:${target}:${sanitizeId(sourceId)}:dry-run`,
      authority: 'dry-run',
      gate: 'packet.v1',
      rule: 'Build reviewable packet JSON only; do not mutate target systems.',
      reason: 'Milestone 1 source packets are local contracts for later adapters.',
      forbiddenActions,
      evidenceIds: [`bookmark:${sourceId}`],
    },
  ];
}

function buildPayload(
  target: AgentBriefTarget,
  bookmark: BookmarkTimelineItem,
  generatedAt: string,
): Record<string, unknown> {
  if (target === 'aeon') return buildAeonPayload(bookmark);
  if (target === 'hermes') return buildHermesPayload(bookmark);
  return buildContentOsPayload(bookmark, generatedAt);
}

function buildAeonPayload(bookmark: BookmarkTimelineItem): Record<string, unknown> {
  return {
    repoHints: bookmark.githubUrls,
    skillHints: [...new Set([...bookmark.categories, ...bookmark.folderNames])],
    memorySeeds: [
      {
        sourceId: bookmark.id,
        sourceUrl: bookmark.url,
        excerpt: excerpt(bookmark.articleText || bookmark.text),
      },
    ],
    aeonDraftConfigPath: 'fieldtheory/exports/<run-id>/aeon/packet.json',
    verificationCommands: ['npm test', 'npm run build'],
  };
}

function buildHermesPayload(bookmark: BookmarkTimelineItem): Record<string, unknown> {
  return {
    profileHint: 'hermes-content-os',
    kanbanTaskDryRun: {
      title: taskTitle(bookmark),
      sourceId: bookmark.id,
      sourceUrl: bookmark.url,
      evidenceIds: [`bookmark:${bookmark.id}`],
    },
    boardHint: 'field-theory-intake',
    gate: 'dry-run-review',
    resultEnvelope: {
      status: 'partial',
      resultCount: 0,
      warnings: ['Dry-run packet only; no Hermes Kanban write was attempted.'],
      generatedBy: 'fieldtheory',
    },
  };
}

function buildContentOsPayload(bookmark: BookmarkTimelineItem, generatedAt: string): Record<string, unknown> {
  const topicKeys = [...new Set([...bookmark.categories, ...bookmark.domains, ...bookmark.folderNames])];
  const sourceIdentity = {
    source: 'fieldtheory-bookmark',
    bookmarkId: bookmark.id,
    tweetId: bookmark.tweetId,
    url: bookmark.url,
    authorHandle: bookmark.authorHandle ?? null,
  };

  return {
    topicKeys,
    tags_json: JSON.stringify(topicKeys),
    source_metadata_json: JSON.stringify({
      ...sourceIdentity,
      generatedAt,
      whySavedStatus: 'unknown',
      primaryDomain: bookmark.primaryDomain ?? null,
      articleSite: bookmark.articleSite ?? null,
    }),
    links_json: JSON.stringify(bookmark.links),
    dedupeKey: `fieldtheory:bookmark:${bookmark.id}`,
    sourceIdentity,
    nextAction: 'route-through-content-os-adapter',
    adapterRequired: true,
  };
}

function taskTitle(bookmark: BookmarkTimelineItem): string {
  return excerpt(bookmark.articleTitle || bookmark.text, 80);
}

function excerpt(value: string | null | undefined, max = 240): string {
  const compact = (value ?? '').replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}...`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

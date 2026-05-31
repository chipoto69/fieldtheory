import fs from 'node:fs';
import path from 'node:path';
import {
  assertValidAgentBriefPack,
  AgentBriefPack,
  EvidenceItem,
  PackLimits,
  StoreStatusEntry,
} from './agent-brief-pack.js';
import { getBookmarkById, searchBookmarks } from './bookmarks-db.js';
import type { BookmarkTimelineItem } from './bookmarks-db.js';
import { listCommandDocuments } from './commands-files.js';
import { sha256 } from './document-ops.js';
import { listLibraryDocuments, searchLibraryDocuments } from './library.js';
import { canonicalCommandsDir, canonicalLibraryDir, capturesDir, twitterBookmarksIndexPath } from './paths.js';

const DEFAULT_LIMITS: PackLimits = {
  captures: 5,
  library: 5,
  commands: 3,
  bookmarks: 8,
};

type SourceType = EvidenceItem['sourceType'];

interface BuildRecallPackOptions {
  now?: Date;
  limits?: Partial<PackLimits>;
}

interface RecallCandidate {
  sourceType: SourceType;
  id: string;
  title: string;
  locator: string;
  excerpt: string;
  hash?: string;
  score: number;
  scoreReason: string;
  sourceRank: number;
  timestamp?: string | null;
  capturedAt?: string;
  tags: string[];
  command?: string;
}

interface CaptureFrontmatter {
  id?: string;
  capturedAt?: string;
  tags: string[];
  hash?: string;
}

function mergeLimits(limits?: Partial<PackLimits>): PackLimits {
  return {
    captures: positiveLimit(limits?.captures, DEFAULT_LIMITS.captures),
    library: positiveLimit(limits?.library, DEFAULT_LIMITS.library),
    commands: positiveLimit(limits?.commands, DEFAULT_LIMITS.commands),
    bookmarks: positiveLimit(limits?.bookmarks, DEFAULT_LIMITS.bookmarks),
  };
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? Math.floor(value) : fallback;
}

function normalized(value: string): string {
  return value.toLowerCase();
}

function queryTerms(query: string): string[] {
  return normalized(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function contentMatches(content: string, query: string): boolean {
  const haystack = normalized(content);
  const needle = normalized(query.trim());
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const terms = queryTerms(query);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function headingText(content: string): string {
  const heading = content.split('\n').find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, '').trim() : '';
}

function firstMatchingLine(content: string, query: string): string | null {
  const needle = normalized(query.trim());
  const terms = queryTerms(query);
  for (const line of content.split(/\r?\n/)) {
    const lower = normalized(line);
    if ((needle && lower.includes(needle)) || (terms.length > 0 && terms.every((term) => lower.includes(term)))) {
      return line.trim();
    }
  }
  return null;
}

function excerptFor(content: string, query: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const needle = normalized(query.trim());
  const lower = normalized(compact);
  const phraseIndex = needle ? lower.indexOf(needle) : -1;
  const termIndex = phraseIndex >= 0
    ? phraseIndex
    : Math.min(...queryTerms(query).map((term) => lower.indexOf(term)).filter((index) => index >= 0));
  const index = Number.isFinite(termIndex) ? termIndex : 0;
  const start = Math.max(0, index - 70);
  const end = Math.min(compact.length, index + Math.max(query.length, 20) + 110);
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`;
}

function scoreTextMatch(title: string, content: string, query: string): { score: number; reason: string } {
  const needle = normalized(query.trim());
  const titleLower = normalized(title);
  const headingLower = normalized(firstMatchingLine(content, query) ?? headingText(content));
  if (needle && titleLower === needle) return { score: 1000, reason: 'exact title match' };
  if (needle && titleLower.includes(needle)) return { score: 900, reason: 'title match' };
  if (needle && headingLower.includes(needle)) return { score: 700, reason: 'heading or usage match' };
  if (needle && normalized(content).includes(needle)) return { score: 500, reason: 'body phrase match' };
  if (contentMatches(content, query)) return { score: 300, reason: 'body term match' };
  return { score: 0, reason: 'no query match' };
}

function parseCaptureFrontmatter(content: string): CaptureFrontmatter {
  const result: CaptureFrontmatter = { tags: [] };
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === 'id') result.id = value;
    else if (key === 'captured_at') result.capturedAt = value;
    else if (key === 'content_sha256') result.hash = value;
    else if (key === 'tags') result.tags = parseTags(value);
  }
  return result;
}

function parseTags(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return trimmed
    .split(',')
    .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function sortCandidates(candidates: RecallCandidate[]): RecallCandidate[] {
  return [...candidates].sort((a, b) => {
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    const byTime = timestampMs(b.timestamp) - timestampMs(a.timestamp);
    if (byTime !== 0) return byTime;
    return `${a.locator}:${a.id}`.localeCompare(`${b.locator}:${b.id}`);
  });
}

function withSourceRanks(candidates: RecallCandidate[]): RecallCandidate[] {
  return candidates.map((candidate, index) => ({ ...candidate, sourceRank: index + 1 }));
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusFor(store: StoreStatusEntry['store'], rootExists: boolean, resultCount: number): StoreStatusEntry {
  if (!rootExists) return { store, status: 'missing' };
  if (resultCount === 0) return { store, status: 'empty' };
  return { store, status: 'available' };
}

function toRelLocator(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function searchCaptureDocuments(query: string, limit: number): { candidates: RecallCandidate[]; rootExists: boolean } {
  const root = capturesDir();
  if (!fs.existsSync(root)) return { candidates: [], rootExists: false };

  const docs = listLibraryDocuments({ includeRelPathPrefixes: ['Captures/'], limit: undefined });
  const candidates = docs.flatMap((doc) => {
    const content = fs.readFileSync(doc.path, 'utf-8');
    if (!contentMatches(content, query)) return [];
    const body = stripFrontmatter(content);
    const frontmatter = parseCaptureFrontmatter(content);
    const title = headingText(body) || doc.title;
    const score = scoreTextMatch(title, body, query);
    return [{
      sourceType: 'capture' as const,
      id: `capture:${frontmatter.id ?? sha256(doc.relPath).slice(0, 12)}`,
      title,
      locator: doc.relPath,
      excerpt: excerptFor(body, query),
      hash: frontmatter.hash ?? sha256(body),
      score: score.score,
      scoreReason: score.reason,
      sourceRank: 0,
      timestamp: frontmatter.capturedAt ?? doc.updatedAt,
      capturedAt: frontmatter.capturedAt,
      tags: frontmatter.tags,
    }];
  });

  return { candidates: withSourceRanks(sortCandidates(candidates).slice(0, limit)), rootExists: true };
}

function searchRegularLibraryDocuments(query: string, limit: number): { candidates: RecallCandidate[]; rootExists: boolean } {
  const root = canonicalLibraryDir();
  if (!fs.existsSync(root)) return { candidates: [], rootExists: false };

  const docs = searchLibraryDocuments(query, {
    limit: Math.max(limit * 4, limit),
    excludeDirs: [capturesDir(), canonicalCommandsDir()],
  });
  const candidates = docs.map((doc) => {
    const content = fs.readFileSync(doc.path, 'utf-8');
    const score = scoreTextMatch(doc.title, content, query);
    return {
      sourceType: 'library' as const,
      id: `library:${sha256(doc.relPath).slice(0, 12)}`,
      title: doc.title,
      locator: doc.relPath,
      excerpt: doc.snippet || excerptFor(content, query),
      hash: sha256(content),
      score: score.score,
      scoreReason: score.reason,
      sourceRank: 0,
      timestamp: doc.updatedAt,
      tags: [],
    };
  });

  return { candidates: withSourceRanks(sortCandidates(candidates).slice(0, limit)), rootExists: true };
}

function searchCommandDocuments(query: string, limit: number): { candidates: RecallCandidate[]; rootExists: boolean } {
  const root = canonicalCommandsDir();
  if (!fs.existsSync(root)) return { candidates: [], rootExists: false };

  const candidates = listCommandDocuments().flatMap((doc) => {
    const content = fs.readFileSync(doc.path, 'utf-8');
    const searchable = `${doc.name}\n${content}`;
    if (!contentMatches(searchable, query)) return [];
    const score = scoreTextMatch(doc.name, searchable, query);
    return [{
      sourceType: 'command' as const,
      id: `command:${doc.name}`,
      title: doc.name,
      locator: toRelLocator(root, doc.path),
      excerpt: excerptFor(content, query),
      hash: sha256(content),
      score: score.score,
      scoreReason: score.reason,
      sourceRank: 0,
      timestamp: doc.updatedAt,
      tags: [],
      command: doc.name,
    }];
  });

  return { candidates: withSourceRanks(sortCandidates(candidates).slice(0, limit)), rootExists: true };
}

async function searchBookmarkDocuments(
  query: string,
  limit: number,
): Promise<{ candidates: RecallCandidate[]; status: StoreStatusEntry; warnings: string[] }> {
  if (!fs.existsSync(twitterBookmarksIndexPath())) {
    return {
      candidates: [],
      status: {
        store: 'bookmarks',
        status: 'missing',
        message: 'Bookmark index missing; run ft sync or ft index first.',
      },
      warnings: ['Bookmark index missing; run ft sync or ft index first.'],
    };
  }

  try {
    const matches = await searchBookmarks({ query, limit });
    const hydrated = await Promise.all(matches.map(async (match) => getBookmarkById(match.id)));
    const candidates = hydrated.flatMap((bookmark, index) => {
      if (!bookmark) return [];
      const match = matches[index];
      return [bookmarkCandidate(bookmark, match.score, query)];
    });
    return {
      candidates: withSourceRanks(sortCandidates(candidates).slice(0, limit)),
      status: statusFor('bookmarks', true, candidates.length),
      warnings: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      candidates: [],
      status: { store: 'bookmarks', status: 'error', message },
      warnings: [`Bookmark search failed: ${message}`],
    };
  }
}

function bookmarkCandidate(bookmark: BookmarkTimelineItem, ftsScore: number, query: string): RecallCandidate {
  const content = [
    bookmark.text,
    bookmark.articleTitle,
    bookmark.articleText,
    bookmark.quotedTweet?.text,
    bookmark.links.join(' '),
  ].filter(Boolean).join('\n');
  const author = bookmark.authorHandle ? `@${bookmark.authorHandle}` : 'bookmark';
  const normalizedFts = 100 + (1 / (1 + Math.abs(ftsScore)));
  return {
    sourceType: 'bookmark',
    id: `bookmark:${bookmark.id}`,
    title: `${author}: ${bookmark.text.slice(0, 80)}`,
    locator: bookmark.url,
    excerpt: excerptFor(content, query),
    hash: sha256(content),
    score: normalizedFts,
    scoreReason: 'bookmark FTS match',
    sourceRank: 0,
    timestamp: bookmark.bookmarkedAt ?? bookmark.postedAt ?? bookmark.syncedAt,
    capturedAt: bookmark.bookmarkedAt ?? undefined,
    tags: [...bookmark.categories, ...bookmark.domains, ...bookmark.folderNames],
  };
}

function evidenceFromCandidates(candidates: RecallCandidate[], retrievedAt: string): EvidenceItem[] {
  return candidates.map((candidate, index) => ({
    id: candidate.id,
    sourceType: candidate.sourceType,
    title: candidate.title,
    locator: candidate.locator,
    excerpt: candidate.excerpt,
    hash: candidate.hash,
    rank: index + 1,
    sourceRank: candidate.sourceRank,
    score: Number(candidate.score.toFixed(6)),
    scoreReason: candidate.scoreReason,
    retrievedAt,
    capturedAt: candidate.capturedAt,
    tags: candidate.tags,
  }));
}

function sortEvidence(candidates: RecallCandidate[]): RecallCandidate[] {
  return [...candidates].sort((a, b) => {
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    const bySourceRank = a.sourceRank - b.sourceRank;
    if (bySourceRank !== 0) return bySourceRank;
    const byTime = timestampMs(b.timestamp) - timestampMs(a.timestamp);
    if (byTime !== 0) return byTime;
    const bySource = sourceOrder(a.sourceType) - sourceOrder(b.sourceType);
    if (bySource !== 0) return bySource;
    return `${a.locator}:${a.id}`.localeCompare(`${b.locator}:${b.id}`);
  });
}

function sourceOrder(sourceType: SourceType): number {
  return ['capture', 'library', 'command', 'bookmark', 'operator'].indexOf(sourceType);
}

export async function buildRecallPack(query: string, options: BuildRecallPackOptions = {}): Promise<AgentBriefPack> {
  const normalizedQuery = query.trim();
  const limits = mergeLimits(options.limits);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const warnings: string[] = [];

  const captures = searchCaptureDocuments(normalizedQuery, limits.captures);
  const library = searchRegularLibraryDocuments(normalizedQuery, limits.library);
  const commands = searchCommandDocuments(normalizedQuery, limits.commands);
  const bookmarks = await searchBookmarkDocuments(normalizedQuery, limits.bookmarks);
  warnings.push(...bookmarks.warnings);

  const storeStatus: StoreStatusEntry[] = [
    statusFor('captures', captures.rootExists, captures.candidates.length),
    statusFor('library', library.rootExists, library.candidates.length),
    statusFor('commands', commands.rootExists, commands.candidates.length),
    bookmarks.status,
  ];
  const candidates = sortEvidence([
    ...captures.candidates,
    ...library.candidates,
    ...commands.candidates,
    ...bookmarks.candidates,
  ]);
  const evidence = evidenceFromCandidates(candidates, generatedAt);
  const evidenceIds = evidence.map((item) => item.id);
  const resultCount = evidence.length;
  const status = storeStatus.some((entry) => entry.status === 'missing' || entry.status === 'error') ? 'partial' : 'complete';

  const summaryClaims = evidenceIds.length > 0
    ? [{
      text: `Found ${resultCount} recall evidence item${resultCount === 1 ? '' : 's'} for "${normalizedQuery}".`,
      evidenceIds,
    }]
    : [{
      text: `No local recall evidence matched "${normalizedQuery}".`,
      evidenceIds: [],
      operatorAuthored: true,
    }];

  const pack: AgentBriefPack = {
    id: `recall_${sha256(`${normalizedQuery}\n${generatedAt}`).slice(0, 16)}`,
    version: 'agent-brief-pack.v1',
    kind: 'recall_pack',
    generatedAt,
    input: { query: normalizedQuery },
    limits,
    storeStatus,
    query: normalizedQuery,
    summary: summaryClaims.map((claim) => claim.text).join(' '),
    summaryClaims,
    evidence,
    typedSlots: evidence.slice(0, 8).map((item) => ({
      type: item.sourceType === 'command' ? 'command' : 'context',
      label: item.title,
      value: item.excerpt,
      evidenceIds: [item.id],
    })),
    suggestedCommands: candidates
      .filter((candidate) => candidate.sourceType === 'command' && candidate.command)
      .slice(0, limits.commands)
      .map((candidate) => ({
        command: candidate.command ?? candidate.title,
        argv: [],
        reason: `Command matched "${normalizedQuery}".`,
        evidenceIds: [candidate.id],
      })),
    boundaries: [{
      id: 'boundary_local_recall',
      authority: 'local-only',
      gate: 'Milestone 1 local contract',
      rule: 'Recall packs read local Field Theory stores and do not write external systems.',
      reason: 'Milestone 1 recall is a local context contract.',
      forbiddenActions: ['write_wiki', 'write_gbrain', 'network_export', 'create_repo'],
      evidenceIds,
    }],
    promotionCandidates: evidenceIds.length > 0
      ? [{
        destination: 'none',
        status: 'not_recommended',
        reason: 'Recall packs are read-only context surfaces; promotion requires a separate operator action.',
        evidenceIds: [evidenceIds[0]],
      }]
      : [{
        destination: 'none',
        status: 'not_recommended',
        reason: 'No matched evidence to promote.',
        evidenceIds: [],
        operatorAuthored: true,
      }],
    resultEnvelope: {
      status,
      resultCount,
      warnings,
      generatedBy: 'fieldtheory',
    },
  };

  assertValidAgentBriefPack(pack);
  return pack;
}

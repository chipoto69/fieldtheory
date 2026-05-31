export type AgentBriefPackKind = 'recall_pack' | 'source_packet' | 'dispatch_brief';
export type AgentBriefTarget = 'aeon' | 'hermes' | 'content-os';
export type StoreStatus = 'available' | 'missing' | 'empty' | 'error';

export interface PackInput {
  query?: string;
  sourceBookmarkId?: string;
  sourceNodeId?: string;
  target?: AgentBriefTarget;
}

export interface PackLimits {
  captures: number;
  library: number;
  commands: number;
  bookmarks: number;
}

export interface StoreStatusEntry {
  store: 'captures' | 'library' | 'commands' | 'bookmarks';
  status: StoreStatus;
  message?: string;
}

export interface EvidenceItem {
  id: string;
  sourceType: 'capture' | 'library' | 'command' | 'bookmark' | 'operator';
  title: string;
  locator: string;
  excerpt: string;
  hash?: string;
  rank: number;
  sourceRank: number;
  score: number;
  scoreReason: string;
  retrievedAt: string;
  capturedAt?: string;
  tags: string[];
}

export interface SummaryClaim {
  text: string;
  evidenceIds: string[];
  operatorAuthored?: boolean;
}

export interface TypedSlot {
  type: 'context' | 'constraint' | 'command' | 'idea' | 'soul' | 'source';
  label: string;
  value: string;
  evidenceIds: string[];
  operatorAuthored?: boolean;
}

export interface SuggestedCommand {
  command: string;
  argv: string[];
  reason: string;
  evidenceIds: string[];
  operatorAuthored?: boolean;
}

export interface SourcePacket {
  target: AgentBriefTarget;
  agentRoute: 'build_handoff' | 'recon_candidate' | 'synthesis_evidence';
  sourceId: string;
  sourceUrl?: string;
  whySavedStatus: 'known' | 'inferred' | 'unknown';
  confidence: number;
  forbiddenActions: string[];
  payload: Record<string, unknown>;
}

export interface BoundaryNote {
  id: string;
  authority: 'local-only' | 'dry-run' | 'external-gated';
  gate: string;
  rule: string;
  reason: string;
  forbiddenActions: string[];
  evidenceIds: string[];
}

export interface PromotionCandidate {
  destination: 'library' | 'wiki' | 'gbrain' | 'skill' | 'none';
  status: 'candidate' | 'blocked' | 'not_recommended';
  reason: string;
  evidenceIds: string[];
}

export interface ResultEnvelope {
  status: 'complete' | 'partial';
  resultCount: number;
  warnings: string[];
  generatedBy: 'fieldtheory';
}

export interface AgentBriefPack {
  id: string;
  version: 'agent-brief-pack.v1';
  kind: AgentBriefPackKind;
  generatedAt: string;
  input: PackInput;
  limits: PackLimits;
  storeStatus: StoreStatusEntry[];
  query?: string;
  sourceBookmarkId?: string;
  sourceNodeId?: string;
  summary: string;
  summaryClaims: SummaryClaim[];
  evidence: EvidenceItem[];
  typedSlots: TypedSlot[];
  suggestedCommands: SuggestedCommand[];
  sourcePacket?: SourcePacket;
  boundaries: BoundaryNote[];
  promotionCandidates: PromotionCandidate[];
  resultEnvelope: ResultEnvelope;
}

function evidenceIdSet(pack: AgentBriefPack): Set<string> {
  return new Set(pack.evidence.map((item) => item.id));
}

function validateEvidenceReferences(
  issues: string[],
  evidenceIds: Set<string>,
  label: string,
  item: { evidenceIds: string[]; operatorAuthored?: boolean },
): void {
  if (item.operatorAuthored) return;
  if (!Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0) {
    issues.push(`${label} must cite evidenceIds or set operatorAuthored`);
    return;
  }
  for (const evidenceId of item.evidenceIds) {
    if (!evidenceIds.has(evidenceId)) issues.push(`${label} references missing evidence id: ${evidenceId}`);
  }
}

export function validateAgentBriefPack(pack: AgentBriefPack): string[] {
  const issues: string[] = [];

  if (pack.version !== 'agent-brief-pack.v1') issues.push('version must be agent-brief-pack.v1');
  if (!['recall_pack', 'source_packet', 'dispatch_brief'].includes(pack.kind)) {
    issues.push(`unsupported kind: ${String(pack.kind)}`);
  }

  const evidenceIds = evidenceIdSet(pack);
  pack.summaryClaims.forEach((item, index) => {
    validateEvidenceReferences(issues, evidenceIds, `summaryClaims[${index}]`, item);
  });
  pack.typedSlots.forEach((item, index) => {
    validateEvidenceReferences(issues, evidenceIds, `typedSlots[${index}]`, item);
  });
  pack.suggestedCommands.forEach((item, index) => {
    validateEvidenceReferences(issues, evidenceIds, `suggestedCommands[${index}]`, item);
  });
  pack.promotionCandidates.forEach((item, index) => {
    validateEvidenceReferences(issues, evidenceIds, `promotionCandidates[${index}]`, item);
  });

  if (pack.kind === 'source_packet') {
    if (!pack.sourcePacket) issues.push('source_packet requires sourcePacket');
    if (!Array.isArray(pack.boundaries) || pack.boundaries.length === 0) {
      issues.push('source_packet requires at least one boundary');
    }
  }

  if (pack.sourcePacket && Object.prototype.hasOwnProperty.call(pack.sourcePacket.payload, 'forbiddenActions')) {
    issues.push('SourcePacket.payload must not contain forbiddenActions; use sourcePacket.forbiddenActions');
  }

  return issues;
}

export function assertValidAgentBriefPack(pack: AgentBriefPack): void {
  const issues = validateAgentBriefPack(pack);
  if (issues.length > 0) {
    throw new Error(`Invalid AgentBriefPack:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
}

function formatEvidence(pack: AgentBriefPack): string {
  if (pack.evidence.length === 0) return '- None';
  return pack.evidence
    .map((item) => `- ${item.id}: ${item.title} (${item.sourceType})\n  locator: ${item.locator}`)
    .join('\n');
}

function formatBoundaries(pack: AgentBriefPack): string {
  if (pack.boundaries.length === 0) return '- None';
  return pack.boundaries
    .map((item) => `- ${item.id}: ${item.authority} via ${item.gate}\n  ${item.rule}`)
    .join('\n');
}

function formatPromotionCandidates(pack: AgentBriefPack): string {
  if (pack.promotionCandidates.length === 0) return '- None';
  return pack.promotionCandidates
    .map((item) => `- ${item.destination}: ${item.status} - ${item.reason}`)
    .join('\n');
}

export function formatAgentBriefPackMarkdown(pack: AgentBriefPack): string {
  return [
    '# Agent Brief Pack',
    '',
    `- Version: ${pack.version}`,
    `- Kind: ${pack.kind}`,
    `- Generated: ${pack.generatedAt}`,
    `- Status: ${pack.resultEnvelope.status}`,
    '',
    '## Summary',
    '',
    pack.summary || 'No summary.',
    '',
    '## Evidence',
    '',
    formatEvidence(pack),
    '',
    '## Boundaries',
    '',
    formatBoundaries(pack),
    '',
    '## Promotion Candidates',
    '',
    formatPromotionCandidates(pack),
    '',
    '## Warnings',
    '',
    pack.resultEnvelope.warnings.length > 0
      ? pack.resultEnvelope.warnings.map((warning) => `- ${warning}`).join('\n')
      : '- None',
    '',
  ].join('\n');
}

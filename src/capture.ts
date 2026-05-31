import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createLibraryDocument } from './library.js';
import { capturesDir, canonicalLibraryDir } from './paths.js';
import { relativeMarkdownPath, sha256 } from './document-ops.js';
import { assertNoSensitiveContent } from './sensitive-content.js';

export type CaptureType = 'note' | 'source' | 'idea' | 'soul';
export type CaptureSource = 'clipboard' | 'text';

export interface CaptureRecord {
  version: 'fieldtheory.capture.v1';
  id: string;
  type: CaptureType;
  source: CaptureSource;
  captured_at: string;
  promotion_status: 'captured';
  tags: string[];
  source_locator: 'stdin' | 'macos-pbpaste' | string;
  content_sha256: string;
}

export interface CaptureResult {
  path: string;
  relPath: string;
  capture: CaptureRecord;
}

const execFileAsync = promisify(execFile);
const CAPTURE_TYPES = new Set<CaptureType>(['note', 'source', 'idea', 'soul']);

function assertCaptureType(type: CaptureType): void {
  if (!CAPTURE_TYPES.has(type)) {
    throw new Error(`Unsupported capture type: ${String(type)}`);
  }
}

function timestampParts(now: Date): { file: string; id: string; iso: string } {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return {
    file: `${year}-${month}-${day}-${hour}${minute}${second}`,
    id: `${year}${month}${day}_${hour}${minute}${second}`,
    iso: now.toISOString(),
  };
}

function slugFromContent(text: string): string {
  const useful = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  const slug = useful.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'capture';
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

function yamlScalar(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

function yamlList(values: string[]): string {
  return `[${values.join(', ')}]`;
}

function formatCaptureMarkdown(capture: CaptureRecord, text: string): string {
  return [
    '---',
    `version: ${capture.version}`,
    `id: ${capture.id}`,
    `type: ${capture.type}`,
    `source: ${capture.source}`,
    `captured_at: ${capture.captured_at}`,
    `promotion_status: ${capture.promotion_status}`,
    `tags: ${yamlList(capture.tags)}`,
    `source_locator: ${yamlScalar(capture.source_locator)}`,
    `content_sha256: ${capture.content_sha256}`,
    '---',
    '',
    `# ${capture.type[0].toUpperCase()}${capture.type.slice(1)} capture`,
    '',
    text.trim(),
    '',
  ].join('\n');
}

function nextCaptureTarget(timestamp: string, slug: string): { relPath: string; suffix: number } {
  let suffix = 1;
  while (true) {
    const suffixPart = suffix === 1 ? '' : `-${suffix}`;
    const relPath = `Captures/${timestamp}-${slug}${suffixPart}.md`;
    if (!fs.existsSync(path.join(capturesDir(), `${timestamp}-${slug}${suffixPart}.md`))) {
      return { relPath, suffix };
    }
    suffix += 1;
  }
}

function idFor(timestamp: string, slug: string, suffix: number): string {
  const base = `cap_${timestamp}_${slug.replace(/-/g, '_')}`;
  return suffix === 1 ? base : `${base}_${suffix}`;
}

export async function captureText(input: {
  text: string;
  type: CaptureType;
  now?: Date;
  tags?: string[];
  source?: CaptureSource;
  sourceLocator?: string;
}): Promise<CaptureResult> {
  assertCaptureType(input.type);
  const text = input.text.trim();
  if (!text) throw new Error('Empty capture text.');
  assertNoSensitiveContent(text, 'capture');

  const source = input.source ?? 'text';
  const now = input.now ?? new Date();
  const timestamp = timestampParts(now);
  const slug = slugFromContent(text);
  const target = nextCaptureTarget(timestamp.file, slug);
  const capture: CaptureRecord = {
    version: 'fieldtheory.capture.v1',
    id: idFor(timestamp.id, slug, target.suffix),
    type: input.type,
    source,
    captured_at: timestamp.iso,
    promotion_status: 'captured',
    tags: sanitizeTags(input.tags),
    source_locator: input.sourceLocator ?? (source === 'clipboard' ? 'macos-pbpaste' : 'stdin'),
    content_sha256: sha256(text),
  };

  const content = formatCaptureMarkdown(capture, text);
  const created = await createLibraryDocument(target.relPath, { content });
  return {
    path: created.path,
    relPath: relativeMarkdownPath(canonicalLibraryDir(), created.path),
    capture,
  };
}

async function readMacClipboard(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pbpaste', []);
    return stdout;
  } catch {
    throw new Error('Clipboard capture failed. Use ft capture text --stdin as a fallback.');
  }
}

export async function captureClipboard(input: {
  type: CaptureType;
  now?: Date;
  tags?: string[];
  readClipboard?: () => Promise<string>;
}): Promise<CaptureResult> {
  const text = await (input.readClipboard ?? readMacClipboard)();
  return captureText({
    text,
    type: input.type,
    now: input.now,
    tags: input.tags,
    source: 'clipboard',
    sourceLocator: 'macos-pbpaste',
  });
}

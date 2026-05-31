# Field Theory Capture-First Agentic Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the local capture, recall, packet, soul, and export contracts that make Field Theory the source-of-truth context layer for Aeon/Gordo, Hermes, Raycast, MCP wrappers, and the later Vercel product.

**Architecture:** Field Theory stays local-first. Raw captures go to `Library/Captures/`, recall and packet commands emit `AgentBriefPack` JSON/Markdown, and all Aeon/Hermes/soul exports write only to explicit local output paths. Hosted Vercel, Privy, wallet gating, and x402 are downstream consumers, not Milestone 1 dependencies.

**Tech Stack:** TypeScript ESM, Commander.js, Node test runner, local markdown stores, SQLite bookmark index, macOS `pbpaste` with stdin fallback, existing `src/document-ops.ts` path guards.

---

## Engineering Review Lock

This plan supersedes the earlier high-level checklist. The previous version had the right build order, but it was not safe to hand to four workers because it left API names, schema invariants, test fixtures, and write boundaries underspecified.

Hard rules for every worker:

- Do not push to `main`.
- Do not write to `~/wiki`, GBrain, Honcho, Hermes, Gordo, Vercel, Privy, or x402 endpoints from Milestone 1 commands.
- Do not create `.git`, GitHub secrets, workflow dispatches, or remotes from any export command.
- Use TDD. Add failing tests first, run the focused test, implement, rerun focused tests, then build.
- Keep command JSON clean. Any command supporting `--json` must avoid logo/chrome output through `shouldSkipCommandChrome()`.
- Use isolated paths in tests: `FT_DATA_DIR`, `FT_LIBRARY_DIR`, `FT_COMMANDS_DIR`, and `HOME`.
- Existing file helpers are authoritative: `resolveMarkdownPath()`, `relativeMarkdownPath()`, `sha256()`, `writeMd()`, `writeJson()`, `createMarkdownFile()`.

## Shared Contracts

Create `src/agent-brief-pack.ts` first or in the same commit as recall.
This is the canonical v1 contract. PRD, feature docs, skill text, Raycast, and
future MCP wrappers must use this shape instead of inventing local variants.

```ts
export type AgentBriefPackKind = "recall_pack" | "source_packet" | "dispatch_brief";
export type AgentBriefTarget = "aeon" | "hermes" | "content-os";
export type StoreStatus = "available" | "missing" | "empty" | "error";

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
  store: "captures" | "library" | "commands" | "bookmarks";
  status: StoreStatus;
  message?: string;
}

export interface EvidenceItem {
  id: string;
  sourceType: "capture" | "library" | "command" | "bookmark" | "operator";
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
  type: "context" | "constraint" | "command" | "idea" | "soul" | "source";
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
  agentRoute: "build_handoff" | "recon_candidate" | "synthesis_evidence";
  sourceId: string;
  sourceUrl?: string;
  whySavedStatus: "known" | "inferred" | "unknown";
  confidence: number;
  forbiddenActions: string[];
  payload: Record<string, unknown>;
}

export interface BoundaryNote {
  id: string;
  authority: "local-only" | "dry-run" | "external-gated";
  gate: string;
  rule: string;
  reason: string;
  forbiddenActions: string[];
  evidenceIds: string[];
}

export interface PromotionCandidate {
  destination: "library" | "wiki" | "gbrain" | "skill" | "none";
  status: "candidate" | "blocked" | "not_recommended";
  reason: string;
  evidenceIds: string[];
}

export interface ResultEnvelope {
  status: "complete" | "partial";
  resultCount: number;
  warnings: string[];
  generatedBy: "fieldtheory";
}

export interface AgentBriefPack {
  id: string;
  version: "agent-brief-pack.v1";
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
```

Invariant: every `summaryClaims`, `typedSlot`, `suggestedCommand`, and
`promotionCandidate` entry must either reference `evidenceIds` or explicitly set
`operatorAuthored: true`. `summary` is a human-readable rollup of
`summaryClaims`, not an uncited claim surface.

## Worker Order

Do not run the write tasks below in parallel until Task 0 lands. After Task 0, workers may split by write scope:

| Worker | Owns | Must not touch |
|---|---|---|
| A | `src/capture.ts`, capture CLI tests | recall, packet, exports |
| B | `src/agent-brief-pack.ts`, `src/recall.ts`, recall tests | Raycast, exports |
| C | `src/packet.ts`, `src/soul-draft.ts`, `src/agent-export.ts`, packet/export tests | skill/Raycast copy |
| D | `src/skill.ts`, `src/operator-suite.ts`, Raycast wrapper, docs, smoke script | core capture/recall implementation |

Controller sequence:

1. Task 0
2. Task 1
3. Task 2
4. Task 3
5. Task 4 and Task 5
6. Task 6
7. Final verification and release note

Before Task 0 starts, the controller must confirm docs agree on this contract:

- `docs/prd/capture-first-agentic-suite.md`
- `docs/features/agent-brief-packs.md`
- `docs/superpowers/plans/2026-05-31-fieldtheory-capture-first-agentic-suite.md`

## Task 0: Test Harness And Guards

**Files:**

- Create: `tests/agentic-suite.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: create isolated test helpers**

Add helpers at the top of `tests/agentic-suite.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCli } from '../src/cli.js';

async function withAgenticRoots(fn: (roots: { root: string; data: string; library: string; commands: string; home: string }) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-agentic-'));
  const roots = {
    root,
    data: path.join(root, 'data'),
    library: path.join(root, 'library'),
    commands: path.join(root, 'library', 'Commands'),
    home: path.join(root, 'home'),
  };
  const previous = {
    FT_DATA_DIR: process.env.FT_DATA_DIR,
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
    HOME: process.env.HOME,
  };
  process.env.FT_DATA_DIR = roots.data;
  process.env.FT_LIBRARY_DIR = roots.library;
  process.env.FT_COMMANDS_DIR = roots.commands;
  process.env.HOME = roots.home;
  try {
    await fn(roots);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: unknown, encodingOrCb?: unknown, cb?: unknown) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
    if (typeof encodingOrCb === 'function') encodingOrCb();
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}
```

- [ ] **Step 2: add CLI registration test**

```ts
test('agentic command groups are registered', () => {
  const program = buildCli();
  for (const name of ['capture', 'recall', 'packet', 'soul', 'export']) {
    assert.ok(program.commands.find((command) => command.name() === name), `${name} command should be registered`);
  }
});
```

- [ ] **Step 3: run red**

Run:

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
```

Expected: fails because the new command groups do not exist.

- [ ] **Step 4: add empty command groups**

In `src/cli.ts`, register command groups before hidden aliases:

```ts
const capture = program.command('capture').description('Capture clipboard or stdin material into the Field Theory Library');
capture.command('text').description('Capture text from stdin');
capture.command('clipboard').description('Capture macOS clipboard text');

program.command('recall').description('Build an agent brief pack from local Field Theory sources');

const packet = program.command('packet').description('Build dry-run source packets for agent targets');
packet.command('bookmark').description('Build a source packet from one bookmark');

const soul = program.command('soul').description('Draft agent soul files from Field Theory sources');
soul.command('draft').description('Draft SOUL.md, STYLE.md, MEMORY.md, and examples');

const exportCommand = program.command('export').description('Export local-only agent handoff bundles');
exportCommand.command('aeon').description('Export a local Aeon/Gordo bundle');
exportCommand.command('hermes').description('Export a local Hermes bundle');
exportCommand.command('soul').description('Export soul files');
```

Also update `shouldSkipCommandChrome()` to skip these command names and their parents:

```ts
if (['capture', 'recall', 'packet', 'soul', 'export'].includes(command.name())) return true;
if (['capture', 'packet', 'soul', 'export'].includes(command.parent?.name() ?? '')) return true;
```

- [ ] **Step 5: run green**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
npm run build
```

## Task 1: Capture Substrate

**Files:**

- Create: `src/capture.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing tests**

Append:

```ts
test('capture text writes markdown under Library/Captures with metadata', async () => {
  await withAgenticRoots(async ({ library }) => {
    const { captureText } = await import('../src/capture.js');
    const result = await captureText({
      text: 'Field Theory should learn from operator clips.',
      type: 'note',
      now: new Date('2026-05-31T12:00:00.000Z'),
      tags: ['agent', 'capture'],
    });

    assert.equal(result.capture.type, 'note');
    assert.equal(result.capture.source, 'text');
    assert.equal(result.relPath, 'Captures/2026-05-31-120000-field-theory-should-learn-from-operator-clips.md');
    assert.equal(result.capture.promotion_status, 'captured');
    assert.equal(fs.existsSync(path.join(library, result.relPath)), true);

    const body = fs.readFileSync(path.join(library, result.relPath), 'utf-8');
    assert.match(body, /version: fieldtheory.capture.v1/);
    assert.match(body, /type: note/);
    assert.match(body, /source: text/);
    assert.match(body, /captured_at: 2026-05-31T12:00:00.000Z/);
    assert.match(body, /content_sha256: [a-f0-9]{64}/);
    assert.match(body, /Field Theory should learn from operator clips\./);
  });
});

test('capture text rejects empty and unsupported types', async () => {
  await withAgenticRoots(async () => {
    const { captureText } = await import('../src/capture.js');
    await assert.rejects(() => captureText({ text: '   ', type: 'note' }), /empty capture/i);
    await assert.rejects(() => captureText({ text: 'x', type: 'bad' as never }), /Unsupported capture type/);
  });
});
```

- [ ] **Step 2: run red**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
```

Expected: module or function missing.

- [ ] **Step 3: implement `src/capture.ts`**

Required API:

```ts
export type CaptureType = "note" | "source" | "idea" | "soul";
export type CaptureSource = "clipboard" | "text";

export interface CaptureRecord {
  version: "fieldtheory.capture.v1";
  id: string;
  type: CaptureType;
  source: CaptureSource;
  captured_at: string;
  promotion_status: "captured";
  tags: string[];
  source_locator: "stdin" | "macos-pbpaste" | string;
  content_sha256: string;
}

export interface CaptureResult {
  path: string;
  relPath: string;
  capture: CaptureRecord;
}

export async function captureText(input: {
  text: string;
  type: CaptureType;
  now?: Date;
  tags?: string[];
  source?: CaptureSource;
  sourceLocator?: string;
}): Promise<CaptureResult>;

export async function captureClipboard(input: {
  type: CaptureType;
  now?: Date;
  tags?: string[];
  readClipboard?: () => Promise<string>;
}): Promise<CaptureResult>;
```

Implementation requirements:

- Use `canonicalLibraryDir()` and write under `Captures/`.
- Add `capturesDir(): string` to `src/paths.ts` and use `createLibraryDocument('Captures/<filename>', { content })` or the same `resolveMarkdownPath()` + `createMarkdownFile()` path guard path. Do not call `writeMd(path.join(...))` directly.
- Use `sha256()` from `src/document-ops.ts`.
- Slug from first 60 useful content characters, lowercased, non-alphanumeric collapsed.
- ID format: `cap_YYYYMMDD_HHMMSS_<slug>`.
- Filename format: `YYYY-MM-DD-HHMMSS-<slug>.md`.
- Collision policy: if the exact filename exists, append `-2`, `-3`, etc. before `.md`; test two same-second captures with identical text.
- Default `source_locator`: `stdin` for `captureText({ source: 'text' })`, `macos-pbpaste` for clipboard.
- `captureClipboard()` default implementation uses `pbpaste` through `node:child_process` on macOS and throws `Clipboard capture failed. Use ft capture text --stdin as a fallback.` on failure.
- Clipboard captures persist raw clipboard text under `Library/Captures/`; docs and command help must warn operators not to capture secrets.

- [ ] **Step 4: wire CLI**

Add:

```bash
ft capture text --stdin --type note --json
ft capture text --stdin --type source --tags x,agent --md
ft capture clipboard --type soul --json
```

`--json` prints `CaptureResult`. `--md` prints the created markdown. Without either, print `Captured: <relPath>`.

- [ ] **Step 5: run green**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
npm run build
```

## Task 2: AgentBriefPack And Recall

**Files:**

- Create: `src/agent-brief-pack.ts`
- Create: `src/recall.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing recall test**

```ts
test('recall combines captures library commands and bookmarks into AgentBriefPack', async () => {
  await withAgenticRoots(async ({ data, library, commands }) => {
    fs.mkdirSync(path.join(library, 'Captures'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Captures', '2026-05-31-agent-memory.md'), [
      '---',
      'version: fieldtheory.capture.v1',
      'id: cap_test',
      'type: note',
      'source: text',
      'captured_at: 2026-05-31T12:00:00.000Z',
      'promotion_status: captured',
      'tags: [agent]',
      'content_sha256: abc',
      '---',
      '# Agent memory',
      '',
      'Agent memory should prefer recall packs.',
      '',
    ].join('\n'));
    fs.mkdirSync(path.join(library, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Notes', 'learning.md'), '# Learning\n\nRecall pack context lives here.\n');
    fs.mkdirSync(commands, { recursive: true });
    fs.writeFileSync(path.join(commands, 'agent-recall.md'), '# agent-recall\n\nUse this when building recall packs.\n\n## Steps\n\n1. Run recall.\n\n## Guardrails\n\n- Verify.\n');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), JSON.stringify({
      id: 'b1',
      tweetId: '1',
      url: 'https://x.com/test/status/1',
      text: 'Recall packs make agents sharper.',
      authorHandle: 'test',
      syncedAt: '2026-05-31T00:00:00Z',
      postedAt: '2026-05-31T00:00:00Z',
      links: [],
      tags: [],
      mediaObjects: [],
      ingestedVia: 'graphql',
    }) + '\n');

    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { buildRecallPack } = await import('../src/recall.js');
    await buildIndex();

    const pack = await buildRecallPack('recall packs', { now: new Date('2026-05-31T13:00:00.000Z') });
    assert.equal(pack.version, 'agent-brief-pack.v1');
    assert.equal(pack.kind, 'recall_pack');
    assert.equal(pack.query, 'recall packs');
    assert.ok(pack.evidence.some((item) => item.sourceType === 'capture'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'library'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'command'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'bookmark'));
  });
});
```

- [ ] **Step 2: implement deterministic recall**

`buildRecallPack(query, options)` must:

- Search captures with `listLibraryDocuments({ includeRelPathPrefixes: ['Captures/'] })`.
- Search Library with `searchLibraryDocuments(query, { limit, excludeDirs: [capturesDir()] })` or equivalent so captures are not double-counted as both `capture` and `library`.
- Search Commands by scanning `listCommandDocuments()` and matching name/content.
- Search bookmarks with `searchBookmarks({ query, limit })`, returning `storeStatus: missing|empty|error` plus a warning if `bookmarks.db` is absent, empty, or unreadable.
- Hydrate bookmark matches with `getBookmarkById()` before building evidence so article text, quoted tweet fields, categories, domains, and links are available.
- Score exact title/name matches highest, usage/heading hits next, body matches next, bookmark FTS score last normalized into stable order.
- Preserve per-source quotas, for example `captures=5`, `library=5`, `commands=3`, `bookmarks=8`, so bookmark volume cannot starve Library or Commands.
- Tie-break deterministically by `sourceRank`, then `updatedAt/bookmarkedAt/postedAt/syncedAt DESC`, then locator/id ascending.
- Return valid partial JSON when every store is empty or missing.

- [ ] **Step 3: wire CLI**

```bash
ft recall "agent memory" --json
ft recall "agent memory" --md
```

Markdown output must start with:

```md
# Agent Brief Pack
```

- [ ] **Step 4: run green**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
npm run build
```

## Task 3: Bookmark Source Packets

**Files:**

- Create: `src/packet.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing packet test**

```ts
test('bookmark packet maps bookmark into target-specific source packet', async () => {
  await withAgenticRoots(async ({ data }) => {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), JSON.stringify({
      id: 'b1',
      tweetId: '1',
      url: 'https://x.com/test/status/1',
      text: 'Aeon agents need source packets.',
      authorHandle: 'test',
      authorName: 'Test Author',
      syncedAt: '2026-05-31T00:00:00Z',
      postedAt: '2026-05-31T00:00:00Z',
      links: ['https://example.com'],
      tags: [],
      mediaObjects: [],
      ingestedVia: 'graphql',
    }) + '\n');
    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { buildBookmarkPacket } = await import('../src/packet.js');
    await buildIndex();

    const pack = await buildBookmarkPacket('b1', { target: 'aeon', now: new Date('2026-05-31T13:00:00.000Z') });
    assert.equal(pack.kind, 'source_packet');
    assert.equal(pack.sourceBookmarkId, 'b1');
    assert.equal(pack.sourcePacket?.target, 'aeon');
    assert.equal(pack.sourcePacket?.agentRoute, 'build_handoff');
    assert.equal(pack.sourcePacket?.whySavedStatus, 'unknown');
    assert.ok(pack.evidence[0].locator.includes('https://x.com/test/status/1'));
  });
});
```

- [ ] **Step 2: implement target routes**

| Target | `sourcePacket.target` | `sourcePacket.agentRoute` |
|---|---|---|
| `aeon` | `aeon` | `build_handoff` |
| `hermes` | `hermes` | `recon_candidate` |
| `content-os` | `content-os` | `synthesis_evidence` |

Unknown IDs must throw `Bookmark not found: <id>`.
Missing bookmark indexes must throw `Bookmark index missing; run ft sync or ft index first.` for text output and return structured failure JSON when `--json` error mode is implemented.
Packet `<id>` means bookmark record `id` for v1; `tweetId` and URL aliases are deferred until a tested resolver exists.
Do not infer why the operator saved a bookmark. Set `whySavedStatus: "unknown"` unless a capture or Library note explicitly supplies intent.

Target payload requirements:

| Target | Required payload fields |
|---|---|
| `aeon` | `repoHints`, `skillHints`, `memorySeeds`, `aeonDraftConfigPath`, `verificationCommands`, `forbiddenActions: ["create_repo","write_github_secret","dispatch_workflow"]` |
| `hermes` | `profileHint`, `kanbanTaskDryRun`, `boardHint`, `gate`, `resultEnvelope`, `forbiddenActions: ["kanban_write","profile_mutation"]` |
| `content-os` | `topicKeys`, `tags_json`, `source_metadata_json`, `links_json`, `dedupeKey`, `nextAction`, `adapterRequired: true` |

- [ ] **Step 3: wire CLI**

```bash
ft packet bookmark <id> --target aeon --json
ft packet bookmark <id> --target hermes --md
```

## Task 4: Soul Draft

**Files:**

- Create: `src/soul-draft.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing soul test**

```ts
test('soul draft writes editable soul files under explicit output root', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    fs.mkdirSync(path.join(library, 'Captures'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Captures', 'soul.md'), '# Soul capture\n\nPrefer source-backed work.\n');
    const out = path.join(root, 'soul-out');
    const { draftSoulFiles } = await import('../src/soul-draft.js');
    const result = await draftSoulFiles({ from: ['library', 'clipboard'], outDir: out, now: new Date('2026-05-31T14:00:00.000Z') });

    assert.deepEqual(result.files.map((file) => file.relPath).sort(), [
      'MEMORY.md',
      'SOUL.md',
      'STYLE.md',
      'data/source-index.json',
      'examples/good-outputs.md',
    ]);
    assert.match(fs.readFileSync(path.join(out, 'SOUL.md'), 'utf-8'), /editable draft/i);
    assert.equal(fs.existsSync(path.join(out, '.git')), false);
  });
});
```

- [ ] **Step 2: implement path-safe soul draft**

`draftSoulFiles()` must:

- Reject empty `outDir`.
- Resolve output root with `path.resolve()`.
- Create only `SOUL.md`, `STYLE.md`, `MEMORY.md`, `examples/good-outputs.md`, and `data/source-index.json`.
- Refuse to write if any output path escapes the root.
- Resolve existing output roots and parents with `realpath` where possible, reject symlinked output roots, and never follow a symlink out of the root.
- Refuse existing files unless `--force` is explicit.
- Treat `clipboard` as prior `type: soul` captures in `Library/Captures/`, not live clipboard access.
- Mark every file as editable draft, not final identity.

## Task 5: Agent Export Bundles

**Files:**

- Create: `src/agent-export.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing export tests**

```ts
test('aeon export writes local-only bundle without git or secrets', async () => {
  await withAgenticRoots(async ({ root }) => {
    const repo = path.join(root, 'gordo-export');
    const { exportAeonBundle } = await import('../src/agent-export.js');
    const result = await exportAeonBundle({ repoPath: repo, includeSoul: true, includeBriefs: true });

    assert.equal(fs.existsSync(path.join(repo, '.git')), false);
    assert.equal(fs.existsSync(path.join(repo, 'fieldtheory', 'exports')), true);
    assert.equal(fs.existsSync(path.join(repo, 'soul', 'SOUL.md')), true);
    assert.ok(result.files.every((file) => file.path.startsWith(repo)));
  });
});
```

- [ ] **Step 2: implement local exporters**

Required CLIs:

```bash
ft export aeon --repo <path> --soul --briefs --json
ft export hermes --out <path> --briefs --json
ft export soul --out <path> --json
```

Bundle layout:

```text
<repo>/
  fieldtheory/exports/<run-id>/
    manifest.json
    brief.json
    brief.md
    packets/aeon-bookmark-<safe-id>.json
    packets/aeon-bookmark-<safe-id>.md
    sources/source-index.json
    reports/export-report.json
    aeon/aeon.yml.draft
  soul/
    SOUL.md
    STYLE.md
    MEMORY.md
    examples/good-outputs.md
    data/source-index.json
```

Hermes layout:

```text
<out>/
  fieldtheory/exports/<run-id>/
    manifest.json
    brief.json
    brief.md
    packets/hermes-bookmark-<safe-id>.json
    packets/hermes-bookmark-<safe-id>.md
    hermes/task-payload.dry-run.json
    hermes/profile-handoff.md
    hermes/result-envelope.json
    sources/source-index.json
```

Export functions must not call `git`, `gh`, `vercel`, network APIs, or model engines.
Do not write root `aeon.yml`, `.github/workflows`, `.git`, secrets, or dispatch files in v1. Keep `aeon.yml.draft` inside the export bundle until a later explicit apply gate exists.
Use fixed relative paths only. Never interpolate raw bookmark text, author handles, target names, or operator input into filenames. Use `safe-id = sha256(id).slice(0, 12)` or strict `[A-Za-z0-9_-]`.
Resolve output roots/parents with `realpath` where possible, reject symlinked output roots, and refuse existing files unless `--force` is explicit.

## Task 6: Operator Surfaces And Docs

**Files:**

- Modify: `src/skill.ts`
- Modify: `src/operator-suite.ts`
- Modify: `raycast/fieldtheory/src/run-command.tsx`
- Modify: `README.md`
- Modify: `docs/workflows/operator-suite.md`
- Modify: `docs/features/agent-brief-packs.md`
- Modify: `package.json`
- Test: `tests/skill.test.ts`, `tests/operator-suite.test.ts`, `tests/cli.test.ts`

- [ ] **Step 1: update skill guidance**

Add these commands to the Field Theory skill body:

```bash
ft capture clipboard --type note --json
ft capture text --stdin --type source --json
ft recall <query> --json
ft packet bookmark <id> --target aeon --json
ft soul draft --from bookmarks,library,clipboard --out soul/
ft export aeon --repo <path> --soul --briefs --json
```

Guidance must say: agents prefer `ft recall --json` and `ft packet ... --json` before raw search/list when they need bounded context.

- [ ] **Step 2: update Raycast command list**

Add read-only CLI wrappers only:

```ts
{ title: "Recall Pack", args: ["recall", "agent memory", "--json"] },
```

Do not add `Capture Clipboard` to the default Raycast launcher because
`docs/raycast-extension.md` defines Raycast as read-only by default. Operators
can still run `ft capture ...` from the generic command runner after explicitly
choosing that command.
Do not add commands that write to Aeon, Hermes, GBrain, wiki, Vercel, or the
Library without explicit operator selection.

- [ ] **Step 3: update tests**

`tests/skill.test.ts` must assert `ft recall`, `ft packet bookmark`, and `ft capture clipboard` appear in the skill content.

`tests/operator-suite.test.ts` must assert Raycast `run-command` uses `<List isShowingDetail>` so command output is visible by default.

- [ ] **Step 4: version and release surface**

After the new CLI commands work and final gates pass, bump the package minor
version from `1.4.0` to `1.5.0`. Before any publish or release tag, add a
release checklist item for:

```bash
npm pack --dry-run
npm run build
node bin/ft.mjs --help
```

## Final Verification

Run these gates in order:

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
HOME="$(mktemp -d)" npx tsx --test tests/operator-suite.test.ts tests/skill.test.ts tests/cli.test.ts
HOME="$(mktemp -d)" npm test
npm run build
git diff --check
```

Run CLI smoke with isolated roots:

```bash
tmp="$(mktemp -d)"
export FT_DATA_DIR="$tmp/data"
export FT_LIBRARY_DIR="$tmp/library"
export FT_COMMANDS_DIR="$FT_LIBRARY_DIR/Commands"
mkdir -p "$FT_DATA_DIR" "$FT_COMMANDS_DIR"

printf 'agent note\n' | npm run dev -- capture text --stdin --type note --json

cat > "$FT_DATA_DIR/bookmarks.jsonl" <<'EOF'
{"id":"bm_test","tweetId":"1","url":"https://x.com/test/status/1","text":"Agent packet smoke fixture","authorHandle":"test","syncedAt":"2026-05-31T00:00:00Z","postedAt":"2026-05-31T00:00:00Z","links":[],"tags":[],"mediaObjects":[],"ingestedVia":"graphql"}
EOF
npm run dev -- index --force
npm run dev -- recall agent --json
npm run dev -- packet bookmark bm_test --target aeon --json
npm run dev -- packet bookmark bm_test --target hermes --md
npm run dev -- packet bookmark bm_test --target content-os --json
npm run dev -- soul draft --from bookmarks,library,clipboard --out "$tmp/soul" --json
npm run dev -- export aeon --repo "$tmp/aeon-repo" --soul --briefs --json
npm run dev -- export hermes --out "$tmp/hermes-export" --briefs --json
npm run dev -- export soul --out "$tmp/soul-export" --json
```

Do not use a bare stdin command like this, because it can hang in automation:

```bash
npm run dev -- capture text --stdin --type note --json <<'EOF'
agent note
EOF
```

Append one audit line to `/Users/rudlord/wiki/log.md`.

Commit sequence:

1. `fix(raycast): show command output detail`
2. `docs(agentic): tighten capture-first implementation plan`
3. Later implementation commits use `feat(agentic): ...` or `test(agentic): ...`

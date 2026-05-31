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
- Do not write to `~/wiki`, GBrain, Honcho, Hermes, Gordo, Vercel, Privy, or x402 endpoints from Milestone 1 commands. The only allowed wiki write in this milestone is the controller's append-only closeout line in `/Users/rudlord/wiki/log.md`.
- Do not create `.git`, GitHub secrets, workflow dispatches, or remotes from any export command.
- Do not add `.github/workflows`, `vercel.json`, Next.js app files, Privy config, wallet-gating code, or x402 enforcement in Milestone 1. Those belong to the hosted handoff after local contracts pass.
- Use TDD. Add failing tests first, run the focused test, implement, rerun focused tests, then build.
- Keep command JSON clean. Any command supporting `--json` must avoid logo/chrome output through `shouldSkipCommandChrome()`.
- Use isolated paths in tests: `FT_DATA_DIR`, `FT_LIBRARY_DIR`, `FT_COMMANDS_DIR`, and `HOME`.
- Existing file helpers are authoritative: `resolveMarkdownPath()`, `relativeMarkdownPath()`, `sha256()`, `writeMd()`, `writeJson()`, `createMarkdownFile()`.

## Second Engineering Review Hard Gates

These gates came from the second `/plan-eng-review` pass with four read-only
subagents. Treat every item below as a pre-implementation requirement, not a
nice-to-have note.

| Gate | Worker | Required plan change |
|---|---|---|
| Schema freeze | B | `docs/prd`, `docs/features`, and this plan must agree on flat capture frontmatter, `EvidenceItem.capturedAt`, required `BoundaryNote`, and target payload keys. |
| Isolated CLI tests | A/B | Every `buildCli()` test runs inside `withAgenticRoots()` before `buildCli()` is called because `buildCli()` performs migration/setup work. |
| Sensitive content | A/C | Captures reject high-confidence secrets by default. Soul/export tests seed token, key, cookie, private-key, and wallet-seed examples and prove raw values never enter generated soul/export files. |
| Bookmark index checks | B/C | Recall and packet check `twitterBookmarksIndexPath()` before calling `searchBookmarks()` or `getBookmarkById()`, so missing indexes become valid partial JSON or clear packet errors. |
| Output containment | C | Soul/export use a shared realpath-aware writer and tests reject `../` escapes, sibling-prefix escapes, symlink roots, symlink children, and overwrite without `--force`. |
| Existing Git repos | C | `ft export aeon --repo <path>` refuses an existing `.git` repo unless `--allow-existing-repo` is explicit; even then it may write only `fieldtheory/exports/<run-id>/` and optional `soul/` files. |
| Export inputs | C | Export APIs must accept explicit `query` and `bookmarkIds` or produce an empty-but-honest brief with `resultEnvelope.status: "partial"` and no fake packet files. |
| Raycast/package release | D | Final gates include Raycast source/scaffold agreement, Raycast lint/build when tooling is installed, package + lockfile version bump, packed-bin smoke, and `npm run release:check`. |
| Hosted handoff | D | After Milestone 1 passes, refresh `docs/handoff/hosted-suite-milestone-2.md` with real smoke output for the sample pack and export manifest, forbidden writes, Privy assumptions, and x402 architecture-only status. |

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

For `source_packet` packs, `boundaries` is required and must contain at least
one `BoundaryNote` whose `authority` is `dry-run` or `local-only`. Target
payloads must not duplicate `forbiddenActions`; the authoritative list is
`SourcePacket.forbiddenActions` plus any matching `BoundaryNote.forbiddenActions`.
V1 target values are only `aeon`, `hermes`, and `content-os`. Dispatch targets
such as `hermes-kanban`, `orbel`, and `legolas` stay outside the v1
`AgentBriefTarget` enum until a separate dispatch contract exists.

## Worker Order

Do not run the write tasks below in parallel until Task 0a and Task 0b land.
After those tasks, workers may split by write scope:

| Worker | Owns | Must not touch |
|---|---|---|
| A | Task 0a harness isolation, `src/capture.ts`, `src/sensitive-content.ts`, capture CLI tests | recall, packet, exports |
| B | `src/agent-brief-pack.ts`, `src/recall.ts`, recall tests, pack validation helpers | Raycast, exports |
| C | `src/packet.ts`, `src/output-guard.ts`, `src/soul-draft.ts`, `src/agent-export.ts`, packet/export tests | skill/Raycast copy |
| D | `src/skill.ts`, `src/operator-suite.ts`, Raycast wrapper, docs, smoke/release scripts | core capture/recall implementation |

Controller sequence:

1. Task 0a and Task 0b
2. Task 1
3. Task 2
4. Task 3
5. Task 3.5
6. Task 4 and Task 5
7. Task 6
8. Final verification and release note

Before Task 0a starts, the controller must confirm docs agree on this contract:

- `docs/prd/capture-first-agentic-suite.md`
- `docs/features/agent-brief-packs.md`
- `docs/superpowers/plans/2026-05-31-fieldtheory-capture-first-agentic-suite.md`

## Task 0a: Test Harness And CLI Guards

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
test('agentic command groups are registered', async () => {
  await withAgenticRoots(async () => {
    const program = buildCli();
    for (const name of ['capture', 'recall', 'packet', 'soul', 'export']) {
      assert.ok(program.commands.find((command) => command.name() === name), `${name} command should be registered`);
    }
  });
});
```

Do not call `buildCli()` outside `withAgenticRoots()`. `buildCli()` performs
runtime setup/migration work and must not see real operator paths in tests.

- [ ] **Step 2b: add parser and clean JSON guard tests**

Append:

```ts
test('agentic command options are registered', async () => {
  await withAgenticRoots(async () => {
    const program = buildCli();
    const capture = program.commands.find((command) => command.name() === 'capture');
    const captureText = capture?.commands.find((command) => command.name() === 'text');
    assert.ok(captureText?.options.some((option) => option.long === '--stdin'));
    assert.ok(captureText?.options.some((option) => option.long === '--type'));
    assert.ok(captureText?.options.some((option) => option.long === '--json'));
    assert.ok(captureText?.options.some((option) => option.long === '--md'));

    const recall = program.commands.find((command) => command.name() === 'recall');
    for (const flag of ['--json', '--md', '--captures', '--library', '--commands', '--bookmarks']) {
      assert.ok(recall?.options.some((option) => option.long === flag), `missing ft recall ${flag}`);
    }

    const packet = program.commands.find((command) => command.name() === 'packet');
    const bookmark = packet?.commands.find((command) => command.name() === 'bookmark');
    for (const flag of ['--target', '--json', '--md']) {
      assert.ok(bookmark?.options.some((option) => option.long === flag), `missing ft packet bookmark ${flag}`);
    }

    const soul = program.commands.find((command) => command.name() === 'soul');
    const draft = soul?.commands.find((command) => command.name() === 'draft');
    for (const flag of ['--from', '--out', '--json', '--force']) {
      assert.ok(draft?.options.some((option) => option.long === flag), `missing ft soul draft ${flag}`);
    }

    const exportCommand = program.commands.find((command) => command.name() === 'export');
    const aeon = exportCommand?.commands.find((command) => command.name() === 'aeon');
    for (const flag of ['--repo', '--query', '--bookmark', '--soul', '--briefs', '--json', '--force', '--allow-existing-repo']) {
      assert.ok(aeon?.options.some((option) => option.long === flag), `missing ft export aeon ${flag}`);
    }
  });
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

## Task 0b: AgentBriefPack Validation Helpers

**Files:**

- Create: `src/agent-brief-pack.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing validation tests**

Append:

```ts
test('validateAgentBriefPack rejects uncited claims and source packets without boundaries', async () => {
  await withAgenticRoots(async () => {
    const { validateAgentBriefPack } = await import('../src/agent-brief-pack.js');
    const basePack = {
      id: 'pack_test',
      version: 'agent-brief-pack.v1',
      kind: 'source_packet',
      generatedAt: '2026-05-31T13:00:00.000Z',
      input: { sourceBookmarkId: 'b1', target: 'aeon' },
      limits: { captures: 5, library: 5, commands: 3, bookmarks: 8 },
      storeStatus: [],
      summary: 'Test summary',
      summaryClaims: [{ text: 'Uncited claim', evidenceIds: [] }],
      evidence: [],
      typedSlots: [],
      suggestedCommands: [],
      sourcePacket: {
        target: 'aeon',
        agentRoute: 'build_handoff',
        sourceId: 'b1',
        whySavedStatus: 'unknown',
        confidence: 0,
        forbiddenActions: ['create_repo'],
        payload: {},
      },
      boundaries: [],
      promotionCandidates: [],
      resultEnvelope: { status: 'partial', resultCount: 0, warnings: [], generatedBy: 'fieldtheory' },
    };

    const issues = validateAgentBriefPack(basePack as never);
    assert.ok(issues.some((issue) => issue.includes('summaryClaims[0]')));
    assert.ok(issues.some((issue) => issue.includes('source_packet requires at least one boundary')));
  });
});
```

- [ ] **Step 2: implement shared helpers**

`src/agent-brief-pack.ts` exports the interfaces from the shared contract plus:

```ts
export function validateAgentBriefPack(pack: AgentBriefPack): string[];
export function assertValidAgentBriefPack(pack: AgentBriefPack): void;
export function formatAgentBriefPackMarkdown(pack: AgentBriefPack): string;
```

Validation requirements:

- `version` must equal `agent-brief-pack.v1`.
- `kind` must be one of `recall_pack`, `source_packet`, or `dispatch_brief`.
- Every `summaryClaims`, `typedSlots`, `suggestedCommands`, and
  `promotionCandidates` entry must have at least one `evidenceIds` entry unless
  `operatorAuthored: true`.
- Every evidence ID referenced by those arrays must exist in `evidence`.
- `source_packet` packs must include `sourcePacket` and at least one
  `BoundaryNote`.
- `SourcePacket.forbiddenActions` is authoritative. Reject target payloads that
  contain a nested `forbiddenActions` key.
- Markdown output starts with `# Agent Brief Pack` and includes source locators,
  boundaries, warnings, and promotion candidates.

- [ ] **Step 3: run green**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
npm run build
```

## Task 1: Capture Substrate

**Files:**

- Create: `src/capture.ts`
- Create: `src/sensitive-content.ts`
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
    assert.match(body, /source_locator: stdin/);
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

test('capture text suffixes same-second filename and id collisions', async () => {
  await withAgenticRoots(async () => {
    const { captureText } = await import('../src/capture.js');
    const now = new Date('2026-05-31T12:00:00.000Z');
    const first = await captureText({ text: 'Repeated capture slug.', type: 'note', now });
    const second = await captureText({ text: 'Repeated capture slug.', type: 'note', now });
    assert.equal(first.relPath, 'Captures/2026-05-31-120000-repeated-capture-slug.md');
    assert.equal(second.relPath, 'Captures/2026-05-31-120000-repeated-capture-slug-2.md');
    assert.equal(first.capture.id, 'cap_20260531_120000_repeated_capture_slug');
    assert.equal(second.capture.id, 'cap_20260531_120000_repeated_capture_slug_2');
  });
});

test('capture rejects high-confidence secret-like text', async () => {
  await withAgenticRoots(async () => {
    const { captureText } = await import('../src/capture.js');
    await assert.rejects(
      () => captureText({ text: 'ghp_1234567890abcdefghijklmnopqrstuvwx', type: 'note' }),
      /refusing to capture secret-like content/i,
    );
  });
});
```

- [ ] **Step 2: run red**

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
```

Expected: module or function missing.

- [ ] **Step 3: implement `src/capture.ts`**

Create `src/sensitive-content.ts` first:

```ts
export interface SensitiveFinding {
  kind: "github_token" | "bearer_token" | "api_key" | "auth_token" | "private_key" | "wallet_seed_phrase";
  label: string;
}

export function detectSensitiveContent(content: string): SensitiveFinding[];
export function assertNoSensitiveContent(content: string, context: string): void;
export function redactSensitiveContent(content: string): { content: string; findings: SensitiveFinding[] };
```

`assertNoSensitiveContent()` throws `Refusing to capture secret-like content:
<kind>` when findings are present.

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
- Use `detectSensitiveContent()` from `src/sensitive-content.ts`. Reject
  high-confidence secret-like content before writing any capture. The v1 CLI
  does not include `--allow-sensitive`; operators must remove secrets before
  capture.
- Slug from first 60 useful content characters, lowercased, non-alphanumeric collapsed.
- ID format: `cap_YYYYMMDD_HHMMSS_<slug>`, with the same collision suffix as
  the filename converted to `_2`, `_3`, etc.
- Filename format: `YYYY-MM-DD-HHMMSS-<slug>.md`.
- Collision policy: if the exact filename exists, append `-2`, `-3`, etc. before `.md`; test two same-second captures with identical text.
- Default `source_locator`: `stdin` for `captureText({ source: 'text' })`, `macos-pbpaste` for clipboard.
- `captureClipboard()` default implementation uses `pbpaste` through `node:child_process` on macOS and throws `Clipboard capture failed. Use ft capture text --stdin as a fallback.` on failure.
- Clipboard captures persist raw clipboard text under `Library/Captures/` only
  after sensitive-content preflight passes; docs and command help must warn
  operators not to capture secrets.

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

- Modify: `src/agent-brief-pack.ts`
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
      'source_locator: stdin',
      'content_sha256: abc',
      '---',
      '# Agent memory',
      '',
      'Agent memory should prefer recall packs.',
      '',
    ].join('\n'));
    fs.mkdirSync(path.join(library, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Notes', 'learning.md'), '# Learning\n\nRecall packs context lives here.\n');
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
    const { assertValidAgentBriefPack } = await import('../src/agent-brief-pack.js');
    await buildIndex();

    const pack = await buildRecallPack('recall packs', { now: new Date('2026-05-31T13:00:00.000Z') });
    assertValidAgentBriefPack(pack);
    assert.equal(pack.version, 'agent-brief-pack.v1');
    assert.equal(pack.kind, 'recall_pack');
    assert.equal(pack.query, 'recall packs');
    assert.ok(pack.evidence.some((item) => item.sourceType === 'capture'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'library'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'command'));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'bookmark'));
    assert.ok(pack.storeStatus.every((entry) => ['available', 'missing', 'empty', 'error'].includes(entry.status)));
  });
});

test('recall returns partial pack when bookmark index is missing', async () => {
  await withAgenticRoots(async ({ library }) => {
    fs.mkdirSync(path.join(library, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Notes', 'agent.md'), '# Agent\n\nRecall packs can work locally.\n');
    const { buildRecallPack } = await import('../src/recall.js');
    const pack = await buildRecallPack('recall packs', { now: new Date('2026-05-31T13:00:00.000Z') });
    assert.equal(pack.resultEnvelope.status, 'partial');
    assert.ok(pack.storeStatus.some((entry) => entry.store === 'bookmarks' && entry.status === 'missing'));
    assert.ok(pack.evidence.every((item) => item.sourceType !== 'bookmark'));
  });
});
```

- [ ] **Step 2: implement deterministic recall**

`buildRecallPack(query, options)` must:

- Search captures with a dedicated `searchCaptureDocuments(query, limits)` helper.
  It may use `listLibraryDocuments({ includeRelPathPrefixes: ['Captures/'] })`
  for discovery, but it must read/filter capture content by query before adding
  evidence so unrelated captures do not leak into recall packs.
- Search Library with `searchLibraryDocuments(query, { limit, excludeDirs: [capturesDir()] })` or equivalent so captures are not double-counted as both `capture` and `library`.
- Search Commands by scanning `listCommandDocuments()` and matching name/content.
- Before any bookmark search, check `fs.existsSync(twitterBookmarksIndexPath())`.
  If absent, return `storeStatus: missing` and a warning without calling
  `searchBookmarks()`. Search bookmarks with `searchBookmarks({ query, limit })`
  only after the index exists, returning `storeStatus: empty|error` plus a
  warning when the DB is empty or unreadable.
- Hydrate bookmark matches with `getBookmarkById()` before building evidence so article text, quoted tweet fields, categories, domains, and links are available.
- Score exact title/name matches highest, usage/heading hits next, body matches next, bookmark FTS score last normalized into stable order.
- Preserve per-source quotas, for example `captures=5`, `library=5`, `commands=3`, `bookmarks=8`, so bookmark volume cannot starve Library or Commands.
- Tie-break deterministically by `sourceRank`, then `updatedAt/bookmarkedAt/postedAt/syncedAt DESC`, then locator/id ascending.
- Return valid partial JSON when every store is empty or missing.

- [ ] **Step 3: wire CLI**

```bash
ft recall "agent memory" --json --captures 5 --library 5 --commands 3 --bookmarks 8
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
    assert.ok(pack.sourcePacket?.forbiddenActions.includes('create_repo'));
    assert.equal('forbiddenActions' in (pack.sourcePacket?.payload ?? {}), false);
    assert.ok(pack.boundaries.some((boundary) => boundary.authority === 'dry-run'));
    assert.ok(pack.evidence[0].locator.includes('https://x.com/test/status/1'));
  });
});

test('bookmark packet emits exact dry-run payloads for each target', async () => {
  await withAgenticRoots(async ({ data }) => {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), JSON.stringify({
      id: 'b1',
      tweetId: '1',
      url: 'https://x.com/test/status/1',
      text: 'Content OS needs source packets.',
      authorHandle: 'test',
      syncedAt: '2026-05-31T00:00:00Z',
      postedAt: '2026-05-31T00:00:00Z',
      links: ['https://example.com'],
      tags: ['agents'],
      mediaObjects: [],
      ingestedVia: 'graphql',
    }) + '\n');
    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { buildBookmarkPacket } = await import('../src/packet.js');
    await buildIndex();

    const hermes = await buildBookmarkPacket('b1', { target: 'hermes', now: new Date('2026-05-31T13:00:00.000Z') });
    assert.equal(hermes.sourcePacket?.agentRoute, 'recon_candidate');
    assert.ok(hermes.sourcePacket?.forbiddenActions.includes('kanban_write'));
    assert.equal('forbiddenActions' in (hermes.sourcePacket?.payload ?? {}), false);
    assert.ok('kanbanTaskDryRun' in (hermes.sourcePacket?.payload ?? {}));

    const contentOs = await buildBookmarkPacket('b1', { target: 'content-os', now: new Date('2026-05-31T13:00:00.000Z') });
    assert.equal(contentOs.sourcePacket?.agentRoute, 'synthesis_evidence');
    assert.ok('topicKeys' in (contentOs.sourcePacket?.payload ?? {}));
    assert.ok('sourceIdentity' in (contentOs.sourcePacket?.payload ?? {}));
    assert.ok('source_metadata_json' in (contentOs.sourcePacket?.payload ?? {}));
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
Missing bookmark indexes must be detected with `fs.existsSync(twitterBookmarksIndexPath())` before calling `getBookmarkById()`. Text output throws `Bookmark index missing; run ft sync or ft index first.` and `--json` prints a structured failure envelope without a stack trace.
Packet `<id>` means bookmark record `id` for v1; `tweetId` and URL aliases are deferred until a tested resolver exists.
Do not infer why the operator saved a bookmark. Set `whySavedStatus: "unknown"` unless a capture or Library note explicitly supplies intent.

Target payload requirements:

| Target | Required payload fields |
|---|---|
| `aeon` | `repoHints`, `skillHints`, `memorySeeds`, `aeonDraftConfigPath`, `verificationCommands` |
| `hermes` | `profileHint`, `kanbanTaskDryRun`, `boardHint`, `gate`, `resultEnvelope` |
| `content-os` | `topicKeys`, `tags_json`, `source_metadata_json`, `links_json`, `dedupeKey`, `sourceIdentity`, `nextAction`, `adapterRequired: true` |

Forbidden actions are never nested inside `payload`. Use
`sourcePacket.forbiddenActions` and matching `BoundaryNote.forbiddenActions`.

- [ ] **Step 3: wire CLI**

```bash
ft packet bookmark <id> --target aeon --json
ft packet bookmark <id> --target hermes --md
```

`ft packet bookmark` is dry-run by design in v1. Do not add or document a
separate `--dry-run` flag until a live apply command exists.

## Task 3.5: Output And Sensitive Content Guards

**Files:**

- Create: `src/output-guard.ts`
- Modify: `src/sensitive-content.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] **Step 1: write failing guard tests**

Append:

```ts
test('output guard rejects escapes symlink roots and sibling prefixes', async () => {
  await withAgenticRoots(async ({ root }) => {
    const { resolveOutputRoot, assertInsideOutputRoot } = await import('../src/output-guard.js');
    const out = path.join(root, 'out');
    fs.mkdirSync(out, { recursive: true });
    const resolved = resolveOutputRoot(out);
    assert.doesNotThrow(() => assertInsideOutputRoot(resolved, path.join(out, 'fieldtheory', 'exports', 'manifest.json')));
    assert.throws(() => assertInsideOutputRoot(resolved, path.join(root, 'out-evil', 'manifest.json')), /outside output root/i);

    const symlinkRoot = path.join(root, 'linked-out');
    fs.symlinkSync(out, symlinkRoot, 'dir');
    assert.throws(() => resolveOutputRoot(symlinkRoot), /symlinked output root/i);
  });
});

test('sensitive content detector catches tokens keys cookies and seed phrases', async () => {
  const { detectSensitiveContent } = await import('../src/sensitive-content.js');
  const findings = detectSensitiveContent([
    'ghp_1234567890abcdefghijklmnopqrstuvwx',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    'api_key=sk-test-1234567890abcdef',
    'auth_token=1234567890abcdef',
    '-----BEGIN PRIVATE KEY-----',
    'seed phrase abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  ].join('\n'));
  assert.ok(findings.length >= 6);
});
```

- [ ] **Step 2: implement shared guards**

`src/output-guard.ts` exports:

```ts
export interface OutputRoot {
  requested: string;
  resolved: string;
  realParent: string;
}

export function resolveOutputRoot(outDir: string): OutputRoot;
export function assertInsideOutputRoot(root: OutputRoot, filePath: string): void;
export function writeFixedBundleFile(root: OutputRoot, relPath: string, content: string, options?: { force?: boolean }): string;
export function safeId(value: string): string;
```

Requirements:

- Reject empty output paths.
- Resolve the output root with `path.resolve()`.
- Use `fs.lstatSync()` where possible to reject a symlinked output root.
- Resolve existing parents with `realpathSync.native()` where possible.
- Use `isPathInside()` path semantics, never string prefix checks.
- Reject hidden paths, absolute relative paths, `..` segments, and existing files
  unless `force` is true.
- `safeId()` returns `sha256(value).slice(0, 12)`.

`src/sensitive-content.ts` exports:

```ts
export interface SensitiveFinding {
  kind: "github_token" | "bearer_token" | "api_key" | "auth_token" | "private_key" | "wallet_seed_phrase";
  label: string;
}

export function detectSensitiveContent(content: string): SensitiveFinding[];
export function assertNoSensitiveContent(content: string, context: string): void;
export function redactSensitiveContent(content: string): { content: string; findings: SensitiveFinding[] };
```

Capture uses `assertNoSensitiveContent()`. Soul/export may either refuse or
redact, but tests must prove raw secret values do not appear in output files and
that any redaction is reported in the manifest or result envelope.

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
    fs.writeFileSync(path.join(library, 'Captures', 'soul.md'), [
      '---',
      'version: fieldtheory.capture.v1',
      'id: cap_soul',
      'type: soul',
      'source: text',
      'captured_at: 2026-05-31T12:00:00.000Z',
      'promotion_status: captured',
      'tags: [soul]',
      'source_locator: stdin',
      'content_sha256: abc',
      '---',
      '# Soul capture',
      '',
      'Prefer source-backed work.',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(library, 'Captures', 'not-soul.md'), [
      '---',
      'version: fieldtheory.capture.v1',
      'id: cap_note',
      'type: note',
      'source: text',
      'captured_at: 2026-05-31T12:00:00.000Z',
      'promotion_status: captured',
      'tags: [note]',
      'source_locator: stdin',
      'content_sha256: def',
      '---',
      '# Note capture',
      '',
      'This should not become identity material.',
      '',
    ].join('\n'));
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
    const soulBody = fs.readFileSync(path.join(out, 'SOUL.md'), 'utf-8');
    assert.match(soulBody, /editable draft/i);
    assert.match(soulBody, /Prefer source-backed work/);
    assert.doesNotMatch(soulBody, /not become identity material/);
    const sourceIndex = JSON.parse(fs.readFileSync(path.join(out, 'data', 'source-index.json'), 'utf-8'));
    assert.equal(sourceIndex.sources[0].type, 'soul');
    assert.equal(sourceIndex.sources[0].draftStatus, 'editable');
    assert.equal(fs.existsSync(path.join(out, '.git')), false);
  });
});

test('soul draft refuses secret-like source material', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    fs.mkdirSync(path.join(library, 'Captures'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Captures', 'secret-soul.md'), [
      '---',
      'version: fieldtheory.capture.v1',
      'id: cap_secret_soul',
      'type: soul',
      'source: text',
      'captured_at: 2026-05-31T12:00:00.000Z',
      'promotion_status: captured',
      'tags: [soul]',
      'source_locator: stdin',
      'content_sha256: secret',
      '---',
      '# Secret soul',
      '',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      '',
    ].join('\n'));
    const { draftSoulFiles } = await import('../src/soul-draft.js');
    await assert.rejects(
      () => draftSoulFiles({ from: ['clipboard'], outDir: path.join(root, 'soul-out') }),
      /secret-like content/i,
    );
  });
});
```

- [ ] **Step 2: implement path-safe soul draft**

`draftSoulFiles()` must:

- Reject empty `outDir`.
- Use `resolveOutputRoot()` and `writeFixedBundleFile()` from
  `src/output-guard.ts`.
- Create only `SOUL.md`, `STYLE.md`, `MEMORY.md`, `examples/good-outputs.md`, and `data/source-index.json`.
- Refuse to write if any output path escapes the root.
- Resolve existing output roots and parents with `realpath` where possible, reject symlinked output roots, and never follow a symlink out of the root.
- Refuse existing files unless `--force` is explicit.
- Treat `clipboard` as prior `type: soul` captures in `Library/Captures/`, not live clipboard access.
- Ignore captures without valid flat `fieldtheory.capture.v1` frontmatter, and
  ignore non-`soul` captures for the `clipboard` source.
- Run `assertNoSensitiveContent()` on every selected source before writing.
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
    const result = await exportAeonBundle({
      repoPath: repo,
      query: 'agent memory',
      bookmarkIds: [],
      includeSoul: true,
      includeBriefs: true,
    });

    assert.equal(fs.existsSync(path.join(repo, '.git')), false);
    assert.equal(fs.existsSync(path.join(repo, 'fieldtheory', 'exports')), true);
    assert.equal(fs.existsSync(path.join(repo, 'soul', 'SOUL.md')), true);
    assert.equal(result.manifest.resultEnvelope.status, 'partial');
    assert.ok(result.files.every((file) => {
      const rel = path.relative(repo, file.path);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    }));
    assert.equal(result.files.some((file) => file.relPath.includes('/packets/')), false);
  });
});

test('aeon export refuses existing git repo without explicit gate', async () => {
  await withAgenticRoots(async ({ root }) => {
    const repo = path.join(root, 'gordo-export');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    const { exportAeonBundle } = await import('../src/agent-export.js');
    await assert.rejects(
      () => exportAeonBundle({ repoPath: repo, query: 'agent memory', bookmarkIds: [] }),
      /existing git repo/i,
    );
  });
});

test('exports refuse secret-like source material', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    fs.mkdirSync(path.join(library, 'Captures'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Captures', 'secret.md'), 'api_key=sk-test-1234567890abcdef\n');
    const { exportHermesBundle } = await import('../src/agent-export.js');
    await assert.rejects(
      () => exportHermesBundle({ outDir: path.join(root, 'hermes'), query: 'api key', bookmarkIds: [], includeBriefs: true }),
      /secret-like content/i,
    );
  });
});
```

- [ ] **Step 2: implement local exporters**

Required CLIs:

```bash
ft export aeon --repo <path> --query <query> --bookmark <id> --soul --briefs --json
ft export hermes --out <path> --query <query> --bookmark <id> --briefs --json
ft export soul --out <path> --json
```

Bundle layout:

```text
<repo>/
  fieldtheory/exports/<run-id>/
    manifest.json
    brief.json
    brief.md
    packets/aeon-bookmark-<safe-id>.json  # only when --bookmark is provided
    packets/aeon-bookmark-<safe-id>.md    # only when --bookmark is provided
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
    packets/hermes-bookmark-<safe-id>.json  # only when --bookmark is provided
    packets/hermes-bookmark-<safe-id>.md    # only when --bookmark is provided
    hermes/task-payload.dry-run.json
    hermes/profile-handoff.md
    hermes/result-envelope.json
    sources/source-index.json
```

Export functions must not call `git`, `gh`, `vercel`, network APIs, or model engines.
Do not write root `aeon.yml`, `.github/workflows`, `.git`, secrets, or dispatch files in v1. Keep `aeon.yml.draft` inside the export bundle until a later explicit apply gate exists.
If `--repo` points at an existing `.git` repo, refuse unless
`--allow-existing-repo` is passed. With `--allow-existing-repo`, writes are still
limited to `fieldtheory/exports/<run-id>/` and optional `soul/` files.
Use fixed relative paths only. Never interpolate raw bookmark text, author handles, target names, or operator input into filenames. Use `safe-id = sha256(id).slice(0, 12)` or strict `[A-Za-z0-9_-]`.
Resolve output roots/parents with `realpath` where possible, reject symlinked output roots, and refuse existing files unless `--force` is explicit.
Export APIs accept `query` and `bookmarkIds`. If `bookmarkIds` is empty, emit an
empty-but-honest brief with `resultEnvelope.status: "partial"` and no packet
files. Do not create placeholder packets.
Run `assertNoSensitiveContent()` or a redaction pass over every generated file
before writing. Tests must prove the raw secret strings from fixtures do not
appear in any soul/export file.

## Task 6: Operator Surfaces And Docs

**Files:**

- Modify: `src/skill.ts`
- Modify: `src/operator-suite.ts`
- Modify: `raycast/fieldtheory/src/run-command.tsx`
- Modify: `README.md`
- Modify: `docs/workflows/operator-suite.md`
- Modify: `docs/features/agent-brief-packs.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/handoff/hosted-suite-milestone-2.md`
- Test: `tests/skill.test.ts`, `tests/operator-suite.test.ts`, `tests/cli.test.ts`

- [ ] **Step 1: update skill guidance**

Add these commands to the Field Theory skill body:

```bash
ft capture clipboard --type note --json
ft capture text --stdin --type source --json
ft recall <query> --json
ft packet bookmark <id> --target aeon --json
ft soul draft --from bookmarks,library,clipboard --out soul/
ft export aeon --repo <path> --query <query> --bookmark <id> --soul --briefs --json
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

Also add a scaffold agreement test: run `scaffoldRaycastExtension()` into a temp
directory and assert the generated `src/run-command.tsx` and curated command
list match the checked-in Raycast extension.

- [ ] **Step 4: version and release surface**

After the new CLI commands work and final gates pass, bump the package minor
version from `1.4.0` to `1.5.0` in both `package.json` and `package-lock.json`.
Add a concrete root release script:

```json
"release:check": "npm run build && npm pack --dry-run && node bin/ft.mjs --help"
```

Before any publish or release tag, run:

```bash
npm run release:check
```

- [ ] **Step 5: refresh hosted-suite handoff artifact**

Update `docs/handoff/hosted-suite-milestone-2.md` with real smoke output in
these sections:

- `Contract Version`: `agent-brief-pack.v1` and `fieldtheory.capture.v1`.
- `Sample AgentBriefPack`: one compact JSON example from the smoke fixtures.
- `Sample Export Manifest`: one compact JSON manifest from Aeon/Hermes export.
- `Forbidden Writes`: no Vercel deploy, no Privy config, no wallet secrets, no
  GitHub workflow dispatch, no Hermes/GBrain/wiki writes from M1 commands.
- `Privy Assumptions`: GitHub login plus Base EVM and Solana wallets are planned
  but not implemented.
- `x402 Status`: architecture handoff only; no payment enforcement until a
  later explicit apply gate.
- `M2 Entry Gate`: M1 tests, smoke, package, and Raycast release checks must be
  green before hosted work starts.

## Final Verification

Run these gates in order:

```bash
HOME="$(mktemp -d)" npx tsx --test tests/agentic-suite.test.ts
HOME="$(mktemp -d)" npx tsx --test tests/operator-suite.test.ts tests/skill.test.ts tests/cli.test.ts
HOME="$(mktemp -d)" npm test
npm run build
npm run release:check
git diff --check
```

Raycast release checks:

```bash
npm --prefix raycast/fieldtheory install
npm --prefix raycast/fieldtheory run lint
npm --prefix raycast/fieldtheory run build
```

If the Raycast CLI is unavailable locally, record that as a release blocker or
run those checks on a machine with Raycast tooling before publishing.

Run CLI smoke with isolated roots:

```bash
tmp="$(mktemp -d)"
export FT_DATA_DIR="$tmp/data"
export FT_LIBRARY_DIR="$tmp/library"
export FT_COMMANDS_DIR="$FT_LIBRARY_DIR/Commands"
mkdir -p "$FT_DATA_DIR" "$FT_COMMANDS_DIR"

printf 'agent note\n' | npm run --silent dev -- capture text --stdin --type note --json

cat > "$FT_DATA_DIR/bookmarks.jsonl" <<'EOF'
{"id":"bm_test","tweetId":"1","url":"https://x.com/test/status/1","text":"Agent packet smoke fixture","authorHandle":"test","syncedAt":"2026-05-31T00:00:00Z","postedAt":"2026-05-31T00:00:00Z","links":[],"tags":[],"mediaObjects":[],"ingestedVia":"graphql"}
EOF
npm run --silent dev -- index --force
npm run --silent dev -- recall agent --json
npm run --silent dev -- packet bookmark bm_test --target aeon --json
npm run --silent dev -- packet bookmark bm_test --target hermes --md
npm run --silent dev -- packet bookmark bm_test --target content-os --json
npm run --silent dev -- soul draft --from bookmarks,library,clipboard --out "$tmp/soul" --json
npm run --silent dev -- export aeon --repo "$tmp/aeon-repo" --query agent --bookmark bm_test --soul --briefs --json
npm run --silent dev -- export hermes --out "$tmp/hermes-export" --query agent --bookmark bm_test --briefs --json
npm run --silent dev -- export soul --out "$tmp/soul-export" --json
```

Confirm no Milestone 1 commit adds `.github/workflows`, `vercel.json`, Next.js
app files, Privy config, wallet secrets, or x402 enforcement code.

Do not use a bare stdin command like this, because it can hang in automation:

```bash
npm run --silent dev -- capture text --stdin --type note --json <<'EOF'
agent note
EOF
```

Append one audit line to `/Users/rudlord/wiki/log.md`.

Commit sequence:

1. `fix(raycast): show command output detail`
2. `docs(agentic): tighten capture-first implementation plan`
3. Later implementation commits use `feat(agentic): ...` or `test(agentic): ...`

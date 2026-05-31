import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCli } from '../src/cli.js';

async function withAgenticRoots(
  fn: (roots: { root: string; data: string; library: string; commands: string; home: string }) => Promise<void>,
): Promise<void> {
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

test('agentic command groups are registered', async () => {
  await withAgenticRoots(async () => {
    const program = buildCli();
    for (const name of ['capture', 'recall', 'packet', 'soul', 'export']) {
      assert.ok(program.commands.find((command) => command.name() === name), `${name} command should be registered`);
    }
  });
});

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

test('validateAgentBriefPack rejects boundary evidence references that do not exist', async () => {
  await withAgenticRoots(async () => {
    const { validateAgentBriefPack } = await import('../src/agent-brief-pack.js');
    const pack = {
      id: 'pack_boundary',
      version: 'agent-brief-pack.v1',
      kind: 'source_packet',
      generatedAt: '2026-05-31T13:00:00.000Z',
      input: { sourceBookmarkId: 'b1', target: 'aeon' },
      limits: { captures: 5, library: 5, commands: 3, bookmarks: 8 },
      storeStatus: [],
      summary: 'Test summary',
      summaryClaims: [],
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
      boundaries: [{
        id: 'boundary_test',
        authority: 'dry-run',
        gate: 'operator export',
        rule: 'No writeback',
        reason: 'Local only',
        forbiddenActions: ['create_repo'],
        evidenceIds: ['missing_evidence'],
      }],
      promotionCandidates: [],
      resultEnvelope: { status: 'partial', resultCount: 0, warnings: [], generatedBy: 'fieldtheory' },
    };

    const issues = validateAgentBriefPack(pack as never);
    assert.ok(issues.some((issue) => issue.includes('boundaries[0] references missing evidence id: missing_evidence')));
  });
});

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
    assert.match(body, /tags: \[agent, capture\]/);
    assert.match(body, /content_sha256: [a-f0-9]{64}/);
    assert.match(body, /Field Theory should learn from operator clips\./);
  });
});

test('recall CLI emits JSON AgentBriefPack output', async () => {
  await withAgenticRoots(async () => {
    const { captureText } = await import('../src/capture.js');
    await captureText({
      text: 'Operator clips should flow into recall packs.',
      type: 'note',
      now: new Date('2026-05-31T12:00:00.000Z'),
      tags: ['agent'],
    });

    const output = await captureStdout(async () => {
      const program = buildCli();
      await program.parseAsync(['node', 'ft', 'recall', 'operator clips', '--json']);
    });
    const pack = JSON.parse(output);

    assert.equal(pack.version, 'agent-brief-pack.v1');
    assert.equal(pack.kind, 'recall_pack');
    assert.equal(pack.query, 'operator clips');
    assert.ok(pack.evidence.some((item: { sourceType: string; locator: string }) => (
      item.sourceType === 'capture' && item.locator.startsWith('Captures/')
    )));
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

test('capture clipboard uses injected text source and macOS locator', async () => {
  await withAgenticRoots(async () => {
    const { captureClipboard } = await import('../src/capture.js');
    const result = await captureClipboard({
      type: 'idea',
      now: new Date('2026-05-31T12:00:00.000Z'),
      readClipboard: async () => 'Clipboard idea for an agent handoff.',
    });

    assert.equal(result.capture.source, 'clipboard');
    assert.equal(result.capture.source_locator, 'macos-pbpaste');
    assert.equal(result.capture.type, 'idea');
  });
});

test('sensitive content detector catches capture-blocking secret forms', async () => {
  const { detectSensitiveContent, redactSensitiveContent } = await import('../src/sensitive-content.js');
  const samples = [
    ['github_token', 'ghp_1234567890abcdefghijklmnopqrstuvwx'],
    ['bearer_token', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890'],
    ['api_key', 'api_key = "abcdefghijklmnopqrstuvwxyz1234567890"'],
    ['auth_token', 'auth_token: "abcdefghijklmnopqrstuvwxyz1234567890"'],
    ['cookie', 'Cookie: ct0=abcdefghijklmnopqrstuvwxyz1234567890; auth_token=abcdefghijklmnopqrstuvwxyz1234567890'],
    ['private_key', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['wallet_seed_phrase', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'],
    ['wallet_seed_phrase', 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'],
  ];

  for (const [kind, content] of samples) {
    assert.ok(
      detectSensitiveContent(content).some((finding) => finding.kind === kind),
      `${kind} should be detected`,
    );
  }

  const redacted = redactSensitiveContent('keep these harmless words then zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong and keep these too');
  assert.equal(
    redacted.content,
    'keep these harmless words then [REDACTED_WALLET_SEED_PHRASE] and keep these too',
  );
  const multipleSeeds = redactSensitiveContent([
    'first abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'second zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  ].join('\n'));
  assert.equal(multipleSeeds.content.includes('abandon abandon'), false);
  assert.equal(multipleSeeds.content.includes('zoo zoo'), false);
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

function writeCaptureFixture(filePath: string, input: { id: string; type: string; title: string; body: string; hash?: string; source?: string }): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    '---',
    'version: fieldtheory.capture.v1',
    `id: ${input.id}`,
    `type: ${input.type}`,
    `source: ${input.source ?? 'text'}`,
    'captured_at: 2026-05-31T12:00:00.000Z',
    'promotion_status: captured',
    `tags: [${input.type}]`,
    'source_locator: stdin',
    `content_sha256: ${input.hash ?? 'abc'}`,
    '---',
    `# ${input.title}`,
    '',
    input.body,
    '',
  ].join('\n'));
}

test('soul draft writes editable soul files under explicit output root', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    writeCaptureFixture(path.join(library, 'Captures', 'soul.md'), {
      id: 'cap_soul',
      type: 'soul',
      title: 'Soul capture',
      body: 'Prefer source-backed work.',
    });
    writeCaptureFixture(path.join(library, 'Captures', 'not-soul.md'), {
      id: 'cap_note',
      type: 'note',
      title: 'Note capture',
      body: 'This should not become identity material.',
      hash: 'def',
    });
    writeCaptureFixture(path.join(library, 'Captures', 'clipboard-note.md'), {
      id: 'cap_clipboard_note',
      type: 'note',
      source: 'clipboard',
      title: 'Clipboard note',
      body: 'Clipboard captures can shape memory without becoming identity.',
      hash: 'clip',
    });

    const out = path.join(root, 'soul-out');
    const { draftSoulFiles } = await import('../src/soul-draft.js');
    const result = await draftSoulFiles({
      from: ['library', 'clipboard'],
      outDir: out,
      now: new Date('2026-05-31T14:00:00.000Z'),
    });

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
    assert.doesNotMatch(soulBody, /Clipboard captures can shape memory/);
    const memoryBody = fs.readFileSync(path.join(out, 'MEMORY.md'), 'utf-8');
    assert.match(memoryBody, /Clipboard captures can shape memory/);
    const sourceIndex = JSON.parse(fs.readFileSync(path.join(out, 'data', 'source-index.json'), 'utf-8'));
    assert.ok(sourceIndex.sources.some((source: { type: string; id: string }) => source.type === 'soul' && source.id === 'cap_soul'));
    assert.ok(sourceIndex.sources.some((source: { type: string; id: string }) => source.type === 'capture' && source.id === 'cap_clipboard_note'));
    assert.equal(sourceIndex.sources[0].draftStatus, 'editable');
    assert.equal(fs.existsSync(path.join(out, '.git')), false);
  });
});

test('soul draft refuses secret-like source material', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    writeCaptureFixture(path.join(library, 'Captures', 'secret-soul.md'), {
      id: 'cap_secret_soul',
      type: 'soul',
      title: 'Secret soul',
      body: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      hash: 'secret',
    });

    const { draftSoulFiles } = await import('../src/soul-draft.js');
    await assert.rejects(
      () => draftSoulFiles({ from: ['clipboard'], outDir: path.join(root, 'soul-out') }),
      /secret-like content/i,
    );
  });
});

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
      now: new Date('2026-05-31T15:00:00.000Z'),
    });

    assert.equal(fs.existsSync(path.join(repo, '.git')), false);
    assert.equal(fs.existsSync(path.join(repo, 'fieldtheory', 'exports')), true);
    assert.equal(fs.existsSync(path.join(repo, 'soul')), false);
    assert.equal(fs.existsSync(path.join(repo, 'fieldtheory', 'exports', result.runId, 'soul', 'SOUL.md')), true);
    assert.equal(result.manifest.resultEnvelope.status, 'partial');
    const manifestPath = path.join(repo, 'fieldtheory', 'exports', result.runId, 'manifest.json');
    assert.equal(fs.existsSync(manifestPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')), result.manifest);
    assert.equal(result.files.some((file) => file.relPath.endsWith('/manifest.json')), true);
    assert.equal(result.manifest.files.some((file) => file.relPath.endsWith('/manifest.json')), false);
    assert.ok(result.files.every((file) => {
      const rel = path.relative(repo, file.path);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    }));
    assert.equal(result.files.some((file) => file.relPath.includes('/packets/')), false);
  });
});

test('soul export persists its manifest beside generated soul files', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    writeCaptureFixture(path.join(library, 'Captures', 'export-soul.md'), {
      id: 'cap_export_soul',
      type: 'soul',
      title: 'Export soul',
      body: 'Use Field Theory packets before agent writeback.',
      hash: 'hash',
    });

    const out = path.join(root, 'soul-export');
    const { exportSoulBundle } = await import('../src/agent-export.js');
    const result = await exportSoulBundle({
      outDir: out,
      from: ['clipboard'],
      now: new Date('2026-05-31T15:00:00.000Z'),
    });

    const manifestPath = path.join(out, 'manifest.json');
    assert.equal(fs.existsSync(path.join(out, 'SOUL.md')), true);
    assert.equal(fs.existsSync(manifestPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')), result.manifest);
    assert.equal(result.manifest.version, 'fieldtheory.agent-export.v1');
    assert.equal(result.manifest.target, 'soul');
    assert.equal(result.files.some((file) => file.relPath === 'manifest.json'), true);
    assert.equal(result.manifest.files.some((file) => file.relPath === 'manifest.json'), false);
  });
});

test('hermes export writes dry-run bundle and persisted manifest', async () => {
  await withAgenticRoots(async ({ root, data }) => {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), JSON.stringify({
      id: 'bm_hermes',
      tweetId: '1',
      url: 'https://x.com/test/status/1',
      text: 'Hermes should receive dry-run Field Theory packets.',
      authorHandle: 'test',
      syncedAt: '2026-05-31T00:00:00Z',
      postedAt: '2026-05-31T00:00:00Z',
      links: [],
      tags: [],
      mediaObjects: [],
      ingestedVia: 'graphql',
    }) + '\n');

    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { exportHermesBundle } = await import('../src/agent-export.js');
    await buildIndex();

    const out = path.join(root, 'hermes-export');
    const result = await exportHermesBundle({
      outDir: out,
      query: 'Hermes packets',
      bookmarkIds: ['bm_hermes'],
      includeBriefs: true,
      now: new Date('2026-05-31T15:00:00.000Z'),
    });

    const exportRoot = path.join(out, 'fieldtheory', 'exports', result.runId);
    const manifestPath = path.join(exportRoot, 'manifest.json');
    const taskPayloadPath = path.join(exportRoot, 'hermes', 'task-payload.dry-run.json');
    assert.equal(fs.existsSync(manifestPath), true);
    assert.equal(fs.existsSync(taskPayloadPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')), result.manifest);
    assert.equal(result.manifest.target, 'hermes');
    assert.equal(result.manifest.forbiddenWrites.includes('kanban_write'), true);
    assert.equal(JSON.parse(fs.readFileSync(taskPayloadPath, 'utf-8')).dryRun, true);
    assert.equal(result.files.some((file) => file.relPath.endsWith('/manifest.json')), true);
    assert.equal(result.manifest.files.some((file) => file.relPath.endsWith('/manifest.json')), false);
  });
});

test('export soul CLI emits JSON and writes a manifest file', async () => {
  await withAgenticRoots(async ({ root, library }) => {
    writeCaptureFixture(path.join(library, 'Captures', 'cli-soul.md'), {
      id: 'cap_cli_soul',
      type: 'soul',
      title: 'CLI soul',
      body: 'CLI export should persist manifest evidence.',
      hash: 'hash',
    });

    const out = path.join(root, 'cli-soul-export');
    const output = await captureStdout(async () => {
      const program = buildCli();
      await program.parseAsync(['node', 'ft', 'export', 'soul', '--out', out, '--json']);
    });
    const result = JSON.parse(output);

    assert.equal(result.manifest.target, 'soul');
    assert.equal(fs.existsSync(path.join(out, 'manifest.json')), true);
    assert.equal(result.files.some((file: { relPath: string }) => file.relPath === 'manifest.json'), true);
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
    await assert.rejects(
      () => exportAeonBundle({ repoPath: path.join(repo, 'fieldtheory-exports'), query: 'agent memory', bookmarkIds: [] }),
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
      () => exportHermesBundle({
        outDir: path.join(root, 'hermes'),
        query: 'api key',
        bookmarkIds: [],
        includeBriefs: true,
      }),
      /secret-like content/i,
    );
  });
});

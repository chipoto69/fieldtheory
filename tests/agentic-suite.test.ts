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

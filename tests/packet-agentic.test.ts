import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function withAgenticRoots(
  fn: (roots: { root: string; data: string; library: string; commands: string; home: string }) => Promise<void>,
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-packet-agentic-'));
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

function writeBookmarkJsonl(data: string, record: Record<string, unknown>): void {
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), `${JSON.stringify(record)}\n`);
}

async function seedBookmarkIndex(data: string): Promise<void> {
  writeBookmarkJsonl(data, {
    id: 'b1',
    tweetId: '1',
    url: 'https://x.com/test/status/1',
    text: 'Aeon agents need source packets.',
    authorHandle: 'test',
    authorName: 'Test Author',
    syncedAt: '2026-05-31T00:00:00Z',
    postedAt: '2026-05-31T00:00:00Z',
    links: ['https://example.com'],
    tags: ['agents'],
    mediaObjects: [],
    ingestedVia: 'graphql',
  });
  const { buildIndex } = await import('../src/bookmarks-db.js');
  await buildIndex();
}

test('bookmark packet maps bookmark into a valid source packet', async () => {
  await withAgenticRoots(async ({ data }) => {
    await seedBookmarkIndex(data);
    const { assertValidAgentBriefPack } = await import('../src/agent-brief-pack.js');
    const { buildBookmarkPacket } = await import('../src/packet.js');

    const pack = await buildBookmarkPacket('b1', { target: 'aeon', now: new Date('2026-05-31T13:00:00.000Z') });

    assert.equal(pack.kind, 'source_packet');
    assert.equal(pack.sourceBookmarkId, 'b1');
    assert.equal(pack.sourcePacket?.target, 'aeon');
    assert.equal(pack.sourcePacket?.agentRoute, 'build_handoff');
    assert.equal(pack.sourcePacket?.sourceId, 'b1');
    assert.equal(pack.sourcePacket?.whySavedStatus, 'unknown');
    assert.ok(pack.sourcePacket?.forbiddenActions.includes('create_repo'));
    assert.ok(pack.sourcePacket?.forbiddenActions.includes('dispatch_workflow'));
    assert.equal('forbiddenActions' in (pack.sourcePacket?.payload ?? {}), false);
    assert.ok(pack.boundaries.some((boundary) => boundary.authority === 'dry-run'));
    assert.ok(pack.evidence[0]?.locator.includes('https://x.com/test/status/1'));
    assertValidAgentBriefPack(pack);
  });
});

test('bookmark packet emits exact top-level payload keys for each target', async () => {
  await withAgenticRoots(async ({ data }) => {
    await seedBookmarkIndex(data);
    const { buildBookmarkPacket } = await import('../src/packet.js');
    const now = new Date('2026-05-31T13:00:00.000Z');

    const aeon = await buildBookmarkPacket('b1', { target: 'aeon', now });
    assert.deepEqual(Object.keys(aeon.sourcePacket?.payload ?? {}).sort(), [
      'aeonDraftConfigPath',
      'memorySeeds',
      'repoHints',
      'skillHints',
      'verificationCommands',
    ]);

    const hermes = await buildBookmarkPacket('b1', { target: 'hermes', now });
    assert.equal(hermes.sourcePacket?.agentRoute, 'recon_candidate');
    assert.ok(hermes.sourcePacket?.forbiddenActions.includes('kanban_write'));
    assert.deepEqual(Object.keys(hermes.sourcePacket?.payload ?? {}).sort(), [
      'boardHint',
      'gate',
      'kanbanTaskDryRun',
      'profileHint',
      'resultEnvelope',
    ]);

    const contentOs = await buildBookmarkPacket('b1', { target: 'content-os', now });
    assert.equal(contentOs.sourcePacket?.agentRoute, 'synthesis_evidence');
    assert.deepEqual(Object.keys(contentOs.sourcePacket?.payload ?? {}).sort(), [
      'adapterRequired',
      'dedupeKey',
      'links_json',
      'nextAction',
      'sourceIdentity',
      'source_metadata_json',
      'tags_json',
      'topicKeys',
    ]);
    assert.equal(contentOs.sourcePacket?.payload.adapterRequired, true);
  });
});

test('bookmark packet checks for missing bookmark index before lookup', async () => {
  await withAgenticRoots(async () => {
    const { buildBookmarkPacket } = await import('../src/packet.js');

    await assert.rejects(
      buildBookmarkPacket('missing', { target: 'aeon', now: new Date('2026-05-31T13:00:00.000Z') }),
      /Bookmark index missing; run ft sync or ft index first\./,
    );
  });
});

test('bookmark packet reports unknown bookmark ids clearly', async () => {
  await withAgenticRoots(async ({ data }) => {
    await seedBookmarkIndex(data);
    const { buildBookmarkPacket } = await import('../src/packet.js');

    await assert.rejects(
      buildBookmarkPacket('unknown-id', { target: 'aeon', now: new Date('2026-05-31T13:00:00.000Z') }),
      /Bookmark not found: unknown-id/,
    );
  });
});

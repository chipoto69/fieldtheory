import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function withAgenticRoots(
  fn: (roots: { root: string; data: string; library: string; commands: string; home: string }) => Promise<void>,
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-recall-agentic-'));
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

function writeCapture(filePath: string, input: { id: string; title: string; text: string; capturedAt: string }): void {
  fs.writeFileSync(filePath, [
    '---',
    'version: fieldtheory.capture.v1',
    `id: ${input.id}`,
    'type: note',
    'source: text',
    `captured_at: ${input.capturedAt}`,
    'promotion_status: captured',
    'tags: [agent]',
    'source_locator: stdin',
    'content_sha256: abc',
    '---',
    `# ${input.title}`,
    '',
    input.text,
    '',
  ].join('\n'));
}

test('buildRecallPack combines only query-matching sources into a valid AgentBriefPack', async () => {
  await withAgenticRoots(async ({ data, library, commands }) => {
    fs.mkdirSync(path.join(library, 'Captures'), { recursive: true });
    writeCapture(path.join(library, 'Captures', '2026-05-31-agent-memory.md'), {
      id: 'cap_match',
      title: 'Agent memory',
      text: 'Agent memory should prefer recall packs.',
      capturedAt: '2026-05-31T12:00:00.000Z',
    });
    writeCapture(path.join(library, 'Captures', '2026-05-31-unrelated.md'), {
      id: 'cap_unrelated',
      title: 'Unrelated',
      text: 'This talks only about invoices and storage.',
      capturedAt: '2026-05-31T12:10:00.000Z',
    });
    fs.mkdirSync(path.join(library, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Notes', 'learning.md'), '# Learning\n\nRecall packs context lives here.\n');
    fs.mkdirSync(commands, { recursive: true });
    fs.writeFileSync(
      path.join(commands, 'agent-recall.md'),
      '# agent-recall\n\nUse this when building recall packs.\n\n## Steps\n\n1. Run recall.\n\n## Guardrails\n\n- Verify.\n',
    );
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'bookmarks.jsonl'), JSON.stringify({
      id: 'b1',
      tweetId: '1',
      url: 'https://x.com/test/status/1',
      text: 'Recall packs make agents sharper.',
      authorHandle: 'test',
      syncedAt: '2026-05-31T00:00:00Z',
      postedAt: '2026-05-31T00:00:00Z',
      links: ['https://example.com/recall'],
      tags: [],
      mediaObjects: [],
      ingestedVia: 'graphql',
    }) + '\n');

    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { buildRecallPack } = await import('../src/recall.js');
    const { assertValidAgentBriefPack } = await import('../src/agent-brief-pack.js');
    await buildIndex();

    const pack = await buildRecallPack('recall packs', {
      now: new Date('2026-05-31T13:00:00.000Z'),
      limits: { captures: 5, library: 5, commands: 3, bookmarks: 8 },
    });

    assertValidAgentBriefPack(pack);
    assert.equal(pack.version, 'agent-brief-pack.v1');
    assert.equal(pack.kind, 'recall_pack');
    assert.equal(pack.query, 'recall packs');
    assert.equal(pack.resultEnvelope.status, 'complete');
    assert.ok(pack.evidence.some((item) => item.sourceType === 'capture' && item.id.includes('cap_match')));
    assert.ok(!pack.evidence.some((item) => item.sourceType === 'capture' && item.id.includes('cap_unrelated')));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'library' && item.locator.endsWith('Notes/learning.md')));
    assert.ok(!pack.evidence.some((item) => item.sourceType === 'library' && item.locator.includes('Captures/')));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'command' && item.locator.endsWith('agent-recall.md')));
    assert.ok(pack.evidence.some((item) => item.sourceType === 'bookmark' && item.locator === 'https://x.com/test/status/1'));
    assert.deepEqual(pack.evidence.map((item) => item.rank), [1, 2, 3, 4]);
    assert.ok(pack.storeStatus.every((entry) => ['available', 'missing', 'empty', 'error'].includes(entry.status)));
  });
});

test('buildRecallPack returns a valid partial pack when the bookmark index is missing', async () => {
  await withAgenticRoots(async ({ library }) => {
    fs.mkdirSync(path.join(library, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(library, 'Notes', 'agent.md'), '# Agent\n\nRecall packs can work locally.\n');

    const { buildRecallPack } = await import('../src/recall.js');
    const { assertValidAgentBriefPack } = await import('../src/agent-brief-pack.js');
    const pack = await buildRecallPack('recall packs', { now: new Date('2026-05-31T13:00:00.000Z') });

    assertValidAgentBriefPack(pack);
    assert.equal(pack.resultEnvelope.status, 'partial');
    assert.ok(pack.storeStatus.some((entry) => entry.store === 'bookmarks' && entry.status === 'missing'));
    assert.ok(pack.resultEnvelope.warnings.some((warning) => warning.includes('Bookmark index missing')));
    assert.ok(pack.evidence.every((item) => item.sourceType !== 'bookmark'));
  });
});

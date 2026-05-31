import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function withTempRoot(fn: (root: string) => Promise<void> | void): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-output-guard-'));
  try {
    await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('resolveOutputRoot rejects empty paths and symlinked roots', async () => {
  const { resolveOutputRoot } = await import('../src/output-guard.js');

  assert.throws(() => resolveOutputRoot(''), /empty output path/i);
  assert.throws(() => resolveOutputRoot('   '), /empty output path/i);

  await withTempRoot((root) => {
    const out = path.join(root, 'out');
    const symlinkRoot = path.join(root, 'linked-out');
    fs.mkdirSync(out, { recursive: true });
    fs.symlinkSync(out, symlinkRoot, 'dir');

    assert.throws(() => resolveOutputRoot(symlinkRoot), /symlinked output root/i);
  });
});

test('assertInsideOutputRoot rejects sibling-prefix and symlink child escapes', async () => {
  const { resolveOutputRoot, assertInsideOutputRoot } = await import('../src/output-guard.js');

  await withTempRoot((rootDir) => {
    const out = path.join(rootDir, 'out');
    const outside = path.join(rootDir, 'outside');
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });

    const root = resolveOutputRoot(out);
    assert.doesNotThrow(() => assertInsideOutputRoot(root, path.join(out, 'fieldtheory', 'exports', 'manifest.json')));
    assert.throws(
      () => assertInsideOutputRoot(root, path.join(rootDir, 'out-evil', 'manifest.json')),
      /outside output root/i,
    );

    const link = path.join(out, 'linked-child');
    fs.symlinkSync(outside, link, 'dir');
    assert.throws(() => assertInsideOutputRoot(root, path.join(link, 'manifest.json')), /outside output root/i);
  });
});

test('writeFixedBundleFile rejects unsafe relative paths and overwrite without force', async () => {
  const { resolveOutputRoot, writeFixedBundleFile } = await import('../src/output-guard.js');

  await withTempRoot((rootDir) => {
    const out = path.join(rootDir, 'out');
    fs.mkdirSync(out, { recursive: true });
    const root = resolveOutputRoot(out);

    for (const relPath of ['.hidden/file.txt', 'visible/.hidden.txt', '../escape.txt', '/absolute.txt', 'nested/../escape.txt']) {
      assert.throws(() => writeFixedBundleFile(root, relPath, 'nope'), /unsafe output path/i, relPath);
    }

    const written = writeFixedBundleFile(root, 'bundle/manifest.json', '{"ok":true}\n');
    assert.equal(written, path.join(out, 'bundle', 'manifest.json'));
    assert.equal(fs.readFileSync(written, 'utf8'), '{"ok":true}\n');

    assert.throws(() => writeFixedBundleFile(root, 'bundle/manifest.json', '{}\n'), /refusing to overwrite/i);
    writeFixedBundleFile(root, 'bundle/manifest.json', '{}\n', { force: true });
    assert.equal(fs.readFileSync(written, 'utf8'), '{}\n');
  });
});

test('writeFixedBundleFile creates a nested output root through existing parents', async () => {
  const { resolveOutputRoot, writeFixedBundleFile } = await import('../src/output-guard.js');

  await withTempRoot((rootDir) => {
    const root = resolveOutputRoot(path.join(rootDir, 'missing', 'nested', 'out'));
    const written = writeFixedBundleFile(root, 'bundle/file.txt', 'created\n');

    assert.equal(written, path.join(rootDir, 'missing', 'nested', 'out', 'bundle', 'file.txt'));
    assert.equal(fs.readFileSync(written, 'utf8'), 'created\n');
  });
});

test('safeId returns the first twelve characters of the sha256 digest', async () => {
  const { safeId } = await import('../src/output-guard.js');

  assert.equal(safeId('field theory'), '693b4cbd9d87');
  assert.equal(safeId('field theory').length, 12);
});

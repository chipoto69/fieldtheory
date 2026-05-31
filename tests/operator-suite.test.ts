import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OPERATOR_SUITE_ARCHITECTURE_MD,
  OPERATOR_SUITE_WORKFLOWS_MD,
  formatOperatorSuiteStatus,
  getOperatorSuiteStatus,
  getRaycastManifest,
  scaffoldRaycastExtension,
} from '../src/operator-suite.js';

test('operator suite status exposes CLI, MCP, skill, plugin, and Raycast surfaces', () => {
  const status = getOperatorSuiteStatus(new Date('2026-01-02T03:04:05.000Z'));
  assert.equal(status.name, 'Field Theory Operator Suite');
  assert.equal(status.generatedAt, '2026-01-02T03:04:05.000Z');
  assert.ok(status.surfaces.some((surface) => surface.includes('ft suite')));
  assert.ok(status.components.some((component) => component.id === 'mcp-adapter'));
  assert.ok(status.components.some((component) => component.id === 'skill-surface'));
  assert.ok(status.components.some((component) => component.id === 'plugin-registry'));
  assert.ok(status.components.some((component) => component.id === 'raycast-extension'));
});

test('operator suite text status is concise and command-oriented', () => {
  const text = formatOperatorSuiteStatus(getOperatorSuiteStatus(new Date('2026-01-02T03:04:05.000Z')));
  assert.match(text, /^Field Theory Operator Suite v/);
  assert.match(text, /ft suite status --json/);
  assert.match(text, /Raycast: raycast\/fieldtheory/);
});

test('operator suite docs include visual diagrams and authority boundaries', () => {
  assert.match(OPERATOR_SUITE_ARCHITECTURE_MD, /```mermaid/);
  assert.match(OPERATOR_SUITE_ARCHITECTURE_MD, /MCP adapter boundary/);
  assert.match(OPERATOR_SUITE_ARCHITECTURE_MD, /Write Authority/);
  assert.match(OPERATOR_SUITE_ARCHITECTURE_MD, /classDef agent/);
  assert.match(OPERATOR_SUITE_WORKFLOWS_MD, /Workflow Loop/);
  assert.match(OPERATOR_SUITE_WORKFLOWS_MD, /fieldtheory\.search/);
});

test('raycast manifest wraps the CLI instead of declaring store authority', () => {
  const manifest = getRaycastManifest();
  assert.equal(manifest.name, 'fieldtheory');
  const commands = manifest.commands as Array<{ name: string }>;
  assert.deepEqual(commands.map((command) => command.name), ['search-bookmarks', 'operator-suite', 'run-command']);
  assert.ok(JSON.stringify(manifest).includes('ft CLI'));
});

test('raycast scaffold writes extension files and respects existing files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-raycast-'));
  try {
    const first = scaffoldRaycastExtension(tmpDir);
    assert.ok(first.written.some((file) => file.endsWith('package.json')));
    assert.equal(first.skipped.length, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, 'src', 'operator-suite.tsx')), true);

    const second = scaffoldRaycastExtension(tmpDir);
    assert.equal(second.written.length, 0);
    assert.ok(second.skipped.length >= first.written.length);

    const forced = scaffoldRaycastExtension(tmpDir, { force: true });
    assert.ok(forced.written.length >= first.written.length);
    assert.equal(forced.skipped.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('raycast run-command shows command output detail by default', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-raycast-detail-'));
  try {
    scaffoldRaycastExtension(tmpDir, { force: true });
    const scaffoldedRunCommand = fs.readFileSync(path.join(tmpDir, 'src', 'run-command.tsx'), 'utf-8');
    const committedRunCommand = fs.readFileSync(path.join(process.cwd(), 'raycast', 'fieldtheory', 'src', 'run-command.tsx'), 'utf-8');

    assert.match(scaffoldedRunCommand, /<List\s+isShowingDetail>/);
    assert.match(committedRunCommand, /<List\s+isShowingDetail>/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

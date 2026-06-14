import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillWithFrontmatter, skillBody } from '../src/skill.js';

describe('skill content', () => {
  it('skillWithFrontmatter includes YAML frontmatter', () => {
    const content = skillWithFrontmatter();
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.includes('name: fieldtheory'));
    assert.ok(content.includes('description:'));
    // Frontmatter closes
    assert.ok(content.indexOf('---', 4) > 0);
  });

  it('skillBody has no frontmatter', () => {
    const content = skillBody();
    assert.ok(!content.startsWith('---'));
    assert.ok(content.startsWith('# Field Theory'));
  });

  it('both versions include key commands', () => {
    for (const content of [skillWithFrontmatter(), skillBody()]) {
      assert.ok(content.includes('ft paths --json'));
      assert.ok(content.includes('ft status --json'));
      assert.ok(content.includes('ft search'));
      assert.ok(content.includes('ft list'));
      assert.ok(content.includes('ft stats'));
      assert.ok(content.includes('ft show'));
      assert.ok(content.includes('ft seeds search'));
      assert.ok(content.includes('ft possible run'));
      assert.ok(content.includes('ft possible grid'));
      assert.ok(content.includes('ft possible prompt'));
      assert.ok(content.includes('ft possible nightly install'));
      assert.ok(content.includes('ft capture clipboard --type note --json'));
      assert.ok(content.includes('ft recall <query> --json'));
      assert.ok(content.includes('ft packet bookmark <id> --target aeon --json'));
      assert.ok(content.includes('ft soul draft --from bookmarks,library,clipboard --out soul/'));
      assert.ok(content.includes('ft export aeon --repo <path> --query <query> --bookmark <id> --soul --briefs --json'));
      assert.ok(content.includes('ft library search'));
      assert.ok(content.includes('ft library show'));
      assert.ok(content.includes('ft commands list'));
      assert.ok(content.includes('ft commands validate'));
      assert.ok(content.includes('ft suite status --json'));
      assert.ok(content.includes('ft suite architecture'));
      assert.ok(content.includes('ft suite workflows'));
      assert.ok(content.includes('ft suite raycast manifest'));
    }
  });

  it('skill teaches natural-language roadmap requests', () => {
    const content = skillWithFrontmatter();
    assert.ok(content.includes('XYZ type of bookmarks'));
    assert.ok(content.includes('roadmap plotted in the grid'));
    assert.ok(content.includes('these projects'));
    assert.ok(content.includes('generate -> critique -> score'));
  });

  it('skill content ends with newline', () => {
    assert.ok(skillWithFrontmatter().endsWith('\n'));
    assert.ok(skillBody().endsWith('\n'));
  });

  it('checked-in Claude command matches generated skill content', () => {
    const checkedIn = readFileSync(new URL('../.claude/commands/fieldtheory.md', import.meta.url), 'utf8');
    assert.equal(checkedIn, skillWithFrontmatter());
  });
});

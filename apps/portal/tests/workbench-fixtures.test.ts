import test from "node:test";
import assert from "node:assert/strict";
import { summarizeExportManifest, validateAgentBriefPack, validateExportManifest } from "../src/lib/contracts";
import { workbenchFixtures } from "../src/lib/workbench-fixtures";

test("operator workbench fixtures are valid no-secret examples for brief, Aeon, and Hermes flows", () => {
  const ids = new Set(workbenchFixtures.map((fixture) => fixture.id));
  assert.ok(ids.has("brief-source-packet"));
  assert.ok(ids.has("aeon-export"));
  assert.ok(ids.has("hermes-export"));

  for (const fixture of workbenchFixtures) {
    const serialized = JSON.stringify(fixture.payload);
    assert.doesNotMatch(serialized, /bearer|password|private[_-]?key|mnemonic|seed phrase|sk-[a-z0-9]{20,}/i);
    assert.equal(fixture.label.length > 0, true);
    assert.equal(fixture.description.length > 0, true);

    if (fixture.payload.version === "agent-brief-pack.v1") {
      const report = validateAgentBriefPack(fixture.payload);
      assert.equal(report.valid, true, fixture.id);
      continue;
    }

    assert.equal(fixture.payload.version, "fieldtheory.agent-export.v1");
    const report = validateExportManifest(fixture.payload);
    assert.equal(report.valid, true, fixture.id);
    const summary = summarizeExportManifest(fixture.payload);
    assert.ok(summary, fixture.id);
    assert.equal(summary.target, fixture.target);
  }
});

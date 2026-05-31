import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentBriefPack, validateExportManifest } from "../src/lib/contracts";
import { validAeonManifest, validBriefPack } from "./fixtures";

test("AgentBriefPack validator accepts a cited source packet", () => {
  const report = validateAgentBriefPack(validBriefPack());
  assert.equal(report.valid, true);
  assert.deepEqual(report.issues, []);
});

test("AgentBriefPack validator rejects missing evidence references and payload forbiddenActions", () => {
  const pack = validBriefPack();
  pack.summaryClaims = [{ text: "Uncited", evidenceIds: ["missing"] }];
  pack.sourcePacket.payload = { forbiddenActions: ["create_repo"] };

  const report = validateAgentBriefPack(pack);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path.includes("summaryClaims")));
  assert.ok(report.issues.some((issue) => issue.path === "sourcePacket.payload.forbiddenActions"));
});

test("AgentBriefPack validator rejects secret-like content before persistence", () => {
  const pack = validBriefPack();
  pack.evidence[0].excerpt = "bearer abcdefghijklmnopqrstuvwxyz123456";

  const report = validateAgentBriefPack(pack);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === "$"));
});

test("export manifest validator accepts a run-scoped Aeon manifest", () => {
  const report = validateExportManifest(validAeonManifest());
  assert.equal(report.valid, true);
  assert.deepEqual(report.issues, []);
});

test("export manifest validator requires relPath and ignores absolute path metadata", () => {
  const manifest = validAeonManifest();
  manifest.files[0].path = "/var/folders/private/source/brief.json";
  let report = validateExportManifest(manifest);
  assert.equal(report.valid, true);

  delete manifest.files[0].relPath;
  report = validateExportManifest(manifest);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === "files[0].relPath"));
});

test("export manifest validator rejects traversal, hidden paths, and secret-like inputs", () => {
  const manifest = validAeonManifest();
  manifest.inputs = { token: "sk-abcdefghijklmnopqrstuvwxyz123456" };
  manifest.files[0].relPath = "fieldtheory/exports/aeon-20260531T130000Z/../secret.json";
  manifest.files[1].relPath = "fieldtheory/exports/aeon-20260531T130000Z/.git/config";

  const report = validateExportManifest(manifest);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.message.includes("hidden, dot, traversal")));
  assert.ok(report.issues.some((issue) => issue.path === "inputs"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { summarizeExportManifest, validateAgentBriefPack, validateExportManifest } from "../src/lib/contracts";
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

test("AgentBriefPack validator rejects wallet seed phrases before persistence", () => {
  const pack = validBriefPack();
  pack.evidence[0].excerpt = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

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

test("export manifest validator rejects inconsistent contract metadata", () => {
  const emptyRunId = validAeonManifest();
  emptyRunId.runId = "";
  let report = validateExportManifest(emptyRunId);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === "runId"));

  const missingContracts = validAeonManifest();
  missingContracts.contracts = null;
  report = validateExportManifest(missingContracts);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === "contracts"));

  const backslashTraversal = validAeonManifest();
  backslashTraversal.files[0].relPath = "fieldtheory\\exports\\aeon-20260531T130000Z\\..\\secret.json";
  report = validateExportManifest(backslashTraversal);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === "files[0].relPath"));
});

test("export manifest validator rejects result envelope secrets before summaries persist", () => {
  const tokenManifest = validAeonManifest();
  tokenManifest.resultEnvelope.warnings = ["bearer abcdefghijklmnopqrstuvwxyz123456"];

  const tokenReport = validateExportManifest(tokenManifest);
  assert.equal(tokenReport.valid, false);
  assert.ok(tokenReport.issues.some((issue) => issue.path === "resultEnvelope"));

  const seedManifest = validAeonManifest();
  seedManifest.resultEnvelope.warnings = [
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  ];

  const seedReport = validateExportManifest(seedManifest);
  assert.equal(seedReport.valid, false);
  assert.ok(seedReport.issues.some((issue) => issue.path === "resultEnvelope"));
});

test("export manifest summaries retain only result envelope counters", () => {
  const manifest = validAeonManifest();
  manifest.resultEnvelope.warnings = ["private but not secret operator note"];
  manifest.resultEnvelope.details = "raw local context should not persist";

  const summary = summarizeExportManifest(manifest);
  assert.ok(summary);
  assert.deepEqual(summary.resultEnvelope, {
    status: "complete",
    resultCount: 1,
    warningCount: 1,
    generatedBy: "fieldtheory",
  });
  assert.equal(JSON.stringify(summary).includes("private but not secret"), false);
  assert.equal(JSON.stringify(summary).includes("raw local context"), false);
});

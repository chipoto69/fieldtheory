import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildHostedReleaseEvidence,
  sanitizeEvidenceText,
  writeHostedReleaseEvidence,
} from "../scripts/collect-hosted-release-evidence.mjs";

test("hosted release evidence bundle records ready production proof without leaking secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-evidence-ready-"));
  const inputs = await writeReadyInputs(root);
  const outDir = join(root, "evidence");

  const report = await writeHostedReleaseEvidence({
    deploymentUrl: "https://fieldtheory.example/",
    rollbackRef: "https://fieldtheory-previous.example",
    outDir,
    artifacts: inputs,
  });

  assert.equal(report.version, "fieldtheory.hosted-release-evidence.v1");
  assert.equal(report.status, "ready");
  assert.equal(report.deployment.url, "https://fieldtheory.example");
  assert.equal(report.deployment.id, "dpl_ready123");
  assert.equal(report.rollback.firstProductionRelease, false);
  assert.equal(report.blockers.length, 0);
  assert.ok(report.checks.every((check: Record<string, unknown>) => check.status === "pass"));

  const manifest = await readFile(join(outDir, "manifest.json"), "utf8");
  const readme = await readFile(join(outDir, "README.md"), "utf8");
  const privy = await readFile(join(outDir, "production-privy-identity.json"), "utf8");
  const db = await readFile(join(outDir, "production-db-schema.txt"), "utf8");
  const serialized = manifest + readme + privy + db;

  assert.match(manifest, /"status": "ready"/);
  assert.match(readme, /protected production workflow/);
  assert.doesNotMatch(manifest, /fieldtheory-evidence-ready-/);
  assert.doesNotMatch(serialized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(serialized, /0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd/);
  assert.doesNotMatch(serialized, /github-subject-123/);
  assert.doesNotMatch(serialized, /operator-user/);
  assert.doesNotMatch(serialized, /privy-user-a/);
  assert.match(serialized, /postgres:\/\/<redacted>/);
  assert.match(serialized, /"walletAddress":"<redacted>"/);
});

test("hosted release evidence blocks missing artifacts and redacts noisy provided evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-evidence-blocked-"));
  const vercelInspect = join(root, "vercel-inspect.txt");
  await writeFile(vercelInspect, [
    "deployment dpl_blocked123",
    "Bearer ghp_abcdefghijklmnopqrstuvwxyz123456",
    "DATABASE_URL=postgres://user:password@example.com/fieldtheory",
    "walletAddress=0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd",
    "linkedAccountSubject=github-subject-123",
  ].join("\n"));
  const outDir = join(root, "evidence");

  const report = await writeHostedReleaseEvidence({
    deploymentUrl: "https://fieldtheory.example",
    rollbackRef: "",
    outDir,
    artifacts: { vercelInspect },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker: Record<string, unknown>) => blocker.id === "public_smoke"));
  assert.ok(report.blockers.some((blocker: Record<string, unknown>) => blocker.id === "authenticated_smoke"));
  assert.ok(report.blockers.some((blocker: Record<string, unknown>) => blocker.id === "rollback_ref"));

  const inspect = await readFile(join(outDir, "vercel-inspect.txt"), "utf8");
  const manifest = await readFile(join(outDir, "manifest.json"), "utf8");
  const serialized = inspect + manifest;
  assert.doesNotMatch(serialized, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(serialized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(serialized, /0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd/);
  assert.doesNotMatch(serialized, /github-subject-123/);
  assert.match(serialized, /Bearer <redacted>/);
});

test("hosted release evidence allows an explicit first production release posture", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-evidence-first-"));
  const inputs = await writeReadyInputs(root);

  const report = await buildHostedReleaseEvidence({
    deploymentUrl: "https://fieldtheory.example",
    firstProductionRelease: true,
    artifacts: inputs,
  });

  assert.equal(report.status, "ready");
  assert.equal(report.rollback.ref, undefined);
  assert.equal(report.rollback.firstProductionRelease, true);
  assert.ok(report.checks.some((check: Record<string, unknown>) => (
    check.id === "rollback_ref"
    && check.status === "pass"
    && String(check.detail).includes("First production release")
  )));
});

test("hosted release evidence rejects unsafe deployment URLs before writing ready proof", async () => {
  const report = await buildHostedReleaseEvidence({
    deploymentUrl: "https://token:secret@fieldtheory.example?token=bad",
    deploymentId: "dpl_unsafe",
    rollbackRef: "dpl_previous",
    artifacts: {},
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker: Record<string, unknown>) => (
    blocker.id === "deployment_url"
    && String(blocker.detail).includes("credentials")
  )));
});

test("release evidence sanitizer handles JSON and shell-shaped secrets", () => {
  const sanitized = sanitizeEvidenceText(JSON.stringify({
    token: "token-secret",
    walletAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd",
    linkedAccountSubject: "github-subject-123",
    databaseUrl: "postgres://user:password@example.com/fieldtheory",
    username: "operator-user",
  }) + "\nBearer ghp_abcdefghijklmnopqrstuvwxyz123456");

  assert.doesNotMatch(sanitized, /token-secret/);
  assert.doesNotMatch(sanitized, /0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd/);
  assert.doesNotMatch(sanitized, /github-subject-123/);
  assert.doesNotMatch(sanitized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(sanitized, /operator-user/);
  assert.match(sanitized, /Bearer <redacted>/);
});

async function writeReadyInputs(root: string): Promise<Record<string, string>> {
  const paths = {
    vercelInspect: join(root, "vercel-inspect.txt"),
    publicSmoke: join(root, "public-smoke.json"),
    authenticatedSmoke: join(root, "authenticated-smoke.json"),
    dbSchema: join(root, "db-schema.json"),
    privyIdentity: join(root, "privy-identity.json"),
  };
  await writeFile(paths.vercelInspect, "Deployment dpl_ready123\nURL https://fieldtheory.example\n");
  await writeFile(paths.publicSmoke, JSON.stringify(smokeReport(false, [
    "health",
    "contracts",
    "x402_discovery",
    "agents_unauthenticated",
  ])));
  await writeFile(paths.authenticatedSmoke, JSON.stringify(smokeReport(true, [
    "health",
    "contracts",
    "x402_discovery",
    "agents_unauthenticated",
    "agents_authenticated",
    "brief_validate_authenticated",
    "agent_run_authenticated",
    "agent_run_readback_authenticated",
  ])));
  await writeFile(paths.dbSchema, JSON.stringify({
    databaseUrl: "postgres://user:password@example.com/fieldtheory",
    fieldtheory_schema_version: [{ version: 2, applied_at: "2026-06-14T00:00:00.000Z" }],
  }));
  await writeFile(paths.privyIdentity, JSON.stringify({
    actor: {
      id: "privy-user-a",
      username: "operator-user",
      walletAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd",
      linkedAccountSubject: "github-subject-123",
      identities: ["github", "evm", "solana"],
      identityPolicyStatus: "satisfied",
      identityPolicy: {
        required: ["github", "base_evm:8453", "solana:mainnet-beta"],
        missing: [],
      },
    },
  }));
  return paths;
}

function smokeReport(authenticated: boolean, ids: string[]): Record<string, unknown> {
  return {
    version: "fieldtheory.hosted-smoke.v1",
    status: "passed",
    summary: { authenticated },
    checks: ids.map((id) => ({ id, status: "pass", title: id, detail: "ok" })),
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  REQUIRED_GITHUB_SECRETS,
  REQUIRED_LOCAL_FILES,
  evaluateHostedDeployReadiness,
  formatReadinessMarkdown,
} from "../scripts/check-hosted-deploy-readiness.mjs";

test("hosted deploy readiness passes only with local artifacts, Vercel link, GitHub gates, and disabled x402", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: [...REQUIRED_GITHUB_SECRETS],
      variables: [
        { name: "X402_ENABLED", value: "false" },
        { name: "FIELD_THEORY_REQUIRE_LINKED_IDENTITIES", value: "true" },
        { name: "FIELD_THEORY_BASE_CHAIN_ID", value: "8453" },
        { name: "NEXT_PUBLIC_BASE_CHAIN_ID", value: "8453" },
        { name: "FIELD_THEORY_SOLANA_CLUSTER", value: "mainnet-beta" },
        { name: "NEXT_PUBLIC_SOLANA_CLUSTER", value: "mainnet-beta" },
        { name: "FIELD_THEORY_FIRST_PRODUCTION_RELEASE", value: "true" },
      ],
    },
  });

  assert.equal(report.status, "ready");
  assert.equal(report.blockers.length, 0);
  assert.ok(report.checks.every((check) => check.status === "pass" || check.status === "warn"));
});

test("hosted deploy readiness blocks missing rollback posture", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    repo: "chipoto69/fieldtheory",
    environment: "production",
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: [...REQUIRED_GITHUB_SECRETS],
      variables: [
        { name: "X402_ENABLED", value: "false" },
        { name: "FIELD_THEORY_REQUIRE_LINKED_IDENTITIES", value: "true" },
        { name: "FIELD_THEORY_BASE_CHAIN_ID", value: "8453" },
        { name: "NEXT_PUBLIC_BASE_CHAIN_ID", value: "8453" },
        { name: "FIELD_THEORY_SOLANA_CLUSTER", value: "mainnet-beta" },
        { name: "NEXT_PUBLIC_SOLANA_CLUSTER", value: "mainnet-beta" },
      ],
    },
  });

  assert.equal(report.status, "blocked");
  const blocker = report.blockers.find((item) => item.id === "rollback_posture");
  assert.ok(blocker);
  assert.match(blocker.detail, /FIELD_THEORY_FIRST_PRODUCTION_RELEASE/);
  const action = report.operatorActions.find((item) => item.id === "rollback_posture");
  assert.ok(action);
  assert.match(action.command ?? "", /FIELD_THEORY_FIRST_PRODUCTION_RELEASE/);
  assert.match(action.command ?? "", /FIELD_THEORY_ROLLBACK_REF/);
});

test("hosted deploy readiness blocks missing linked identity production policy", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: [...REQUIRED_GITHUB_SECRETS],
      variables: [{ name: "X402_ENABLED", value: "false" }],
    },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker) => blocker.id === "linked_identity_policy"));
  const action = report.operatorActions.find((item) => item.id === "linked_identity_policy");
  assert.ok(action);
  assert.match(action.command ?? "", /FIELD_THEORY_REQUIRE_LINKED_IDENTITIES/);
  assert.match(action.command ?? "", /FIELD_THEORY_BASE_CHAIN_ID/);
  assert.match(action.command ?? "", /FIELD_THEORY_SOLANA_CLUSTER/);
});

test("hosted deploy readiness blocks mismatched linked identity public mirrors", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: [...REQUIRED_GITHUB_SECRETS],
      variables: [
        { name: "X402_ENABLED", value: "false" },
        { name: "FIELD_THEORY_REQUIRE_LINKED_IDENTITIES", value: "true" },
        { name: "FIELD_THEORY_BASE_CHAIN_ID", value: "8453" },
        { name: "NEXT_PUBLIC_BASE_CHAIN_ID", value: "84532" },
        { name: "FIELD_THEORY_SOLANA_CLUSTER", value: "mainnet-beta" },
        { name: "NEXT_PUBLIC_SOLANA_CLUSTER", value: "devnet" },
      ],
    },
  });

  assert.equal(report.status, "blocked");
  const blocker = report.blockers.find((item) => item.id === "linked_identity_policy");
  assert.ok(blocker);
  assert.match(blocker.detail, /NEXT_PUBLIC_BASE_CHAIN_ID must match FIELD_THEORY_BASE_CHAIN_ID/);
  assert.match(blocker.detail, /NEXT_PUBLIC_SOLANA_CLUSTER must match FIELD_THEORY_SOLANA_CLUSTER/);
});

test("hosted deploy readiness blocks missing secrets, missing Vercel link, and enabled x402 without leaking values", async () => {
  const root = await makeReadyRepo({ vercelLink: false });
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    env: {
      VERCEL_TOKEN: "vercel_token_secret_value",
      DATABASE_URL: "postgres://user:password@example.com/fieldtheory",
      PRIVY_APP_SECRET: "privy_secret_value",
      X402_ENABLED: "true",
    },
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: ["VERCEL_TOKEN", "DATABASE_URL"],
      variables: [{ name: "X402_ENABLED", value: "true" }],
    },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker) => blocker.id === "vercel_project_link"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "github_required_secrets"));
  assert.ok(report.blockers.some((blocker) => blocker.id === "x402_disabled"));

  const serialized = JSON.stringify(report) + "\n" + formatReadinessMarkdown(report);
  assert.doesNotMatch(serialized, /vercel_token_secret_value/);
  assert.doesNotMatch(serialized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(serialized, /privy_secret_value/);
});

test("hosted deploy readiness emits secret-safe operator actions for blockers", async () => {
  const root = await makeReadyRepo({ vercelLink: false });
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    repo: "chipoto69/fieldtheory",
    environment: "production",
    branch: "main",
    env: {
      VERCEL_TOKEN: "vercel_token_secret_value",
      DATABASE_URL: "postgres://user:password@example.com/fieldtheory",
      PRIVY_APP_SECRET: "privy_secret_value",
      X402_ENABLED: "true",
    },
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: [],
      secrets: ["VERCEL_TOKEN"],
      variables: [],
    },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.operatorActions.some((action) => (
    action.id === "vercel_project_link"
    && action.command === "cd apps/portal && vercel link"
  )));
  assert.ok(report.operatorActions.some((action) => (
    action.id === "github_required_checks"
    && action.command?.includes("hosted:setup-github-env")
    && action.command.includes("--protect-main")
  )));
  assert.ok(report.operatorActions.some((action) => (
    action.id === "github_required_secrets"
    && action.command?.includes("gh secret set")
    && action.command.includes("PRIVY_APP_SECRET")
  )));
  assert.ok(report.operatorActions.some((action) => (
    action.id === "x402_disabled"
    && action.command === "gh variable set X402_ENABLED --repo chipoto69/fieldtheory --env production --body false"
  )));

  const serialized = JSON.stringify(report) + "\n" + formatReadinessMarkdown(report);
  assert.match(serialized, /## Operator Actions/);
  assert.doesNotMatch(serialized, /vercel_token_secret_value/);
  assert.doesNotMatch(serialized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(serialized, /privy_secret_value/);
});

test("hosted deploy readiness redacts tokens wallets subjects and database URLs from remote errors", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    github: {
      checked: true,
      error: "Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 token=vercel_secret secret:privy_secret DATABASE_URL=postgres://user:password@example.com/fieldtheory walletAddress=0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd linkedAccountSubject=github-subject-123",
      secrets: [],
      variables: [],
      requiredStatusChecks: [],
    },
  });

  const serialized = JSON.stringify(report) + "\n" + formatReadinessMarkdown(report);
  assert.doesNotMatch(serialized, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(serialized, /vercel_secret/);
  assert.doesNotMatch(serialized, /privy_secret/);
  assert.doesNotMatch(serialized, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(serialized, /0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd/);
  assert.doesNotMatch(serialized, /github-subject-123/);
  assert.match(serialized, /Bearer <redacted>/);
  assert.match(serialized, /postgres:\/\/<redacted>/);
});

test("hosted deploy readiness scopes secret operator commands to missing names", async () => {
  const root = await makeReadyRepo();
  const presentSecrets = REQUIRED_GITHUB_SECRETS.filter((name) => ![
    "DATABASE_URL",
    "PRIVY_APP_SECRET",
  ].includes(name));
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    repo: "chipoto69/fieldtheory",
    environment: "production",
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: presentSecrets,
      variables: [{ name: "X402_ENABLED", value: "false" }],
    },
  });

  const action = report.operatorActions.find((item) => item.id === "github_required_secrets");
  assert.ok(action);
  assert.match(action.command ?? "", /DATABASE_URL/);
  assert.match(action.command ?? "", /PRIVY_APP_SECRET/);
  assert.doesNotMatch(action.command ?? "", /VERCEL_ORG_ID/);
  assert.doesNotMatch(action.command ?? "", /VERCEL_PROJECT_ID/);
});

test("local Vercel and macOS metadata are ignored", () => {
  const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(gitignore, /^apps\/portal\/\.vercel\/$/m);
  assert.match(gitignore, /^\.DS_Store$/m);
});

test("hosted deploy readiness reports missing required local release artifacts", async () => {
  const root = await makeReadyRepo();
  const missingFile = join(root, "docs/handoff/x402-milestone-3.md");
  await writeFile(missingFile, "");
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    requiredLocalFiles: [...REQUIRED_LOCAL_FILES, "missing/production-runbook.md"],
    github: {
      checked: false,
      secrets: [],
      variables: [],
      requiredStatusChecks: [],
    },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker) => blocker.id === "local_artifacts"));
  assert.ok(
    report.blockers.some((blocker) => blocker.detail.includes("missing/production-runbook.md")),
  );
});

test("hosted deploy readiness requires explicit x402 disabled policy", async () => {
  const root = await makeReadyRepo();
  const report = await evaluateHostedDeployReadiness({
    repoRoot: root,
    github: {
      checked: true,
      environmentExists: true,
      deploymentBranchPolicy: "main",
      branchProtected: true,
      requiredStatusChecks: ["preview"],
      secrets: [...REQUIRED_GITHUB_SECRETS],
      variables: [],
    },
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((blocker) => blocker.id === "x402_disabled"));
});

async function makeReadyRepo(options: { vercelLink?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-readiness-"));
  for (const relPath of REQUIRED_LOCAL_FILES) {
    await writeProjectFile(root, relPath, stubContent(relPath));
  }
  await writeProjectFile(
    root,
    "package.json",
    JSON.stringify({
      scripts: {
        "release:check": "npm run build && npm pack --dry-run && node bin/ft.mjs --help",
        "verify:hosted": "npm run portal:test && npm run portal:typecheck && npm run portal:build",
        "hosted:setup-github-env": "node scripts/setup-github-production-env.mjs",
        "hosted:check-readiness": "node scripts/check-hosted-deploy-readiness.mjs",
        "hosted:smoke": "node scripts/smoke-hosted-deployment.mjs",
        "hosted:collect-evidence": "node scripts/collect-hosted-release-evidence.mjs",
      },
    }),
  );
  if (options.vercelLink !== false) {
    await writeProjectFile(
      root,
      "apps/portal/.vercel/project.json",
      JSON.stringify({ orgId: "team_test", projectId: "prj_test" }),
    );
  }
  return root;
}

async function writeProjectFile(root: string, relPath: string, content: string): Promise<void> {
  const path = join(root, relPath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function stubContent(relPath: string): string {
  if (relPath.endsWith(".json")) return "{}\n";
  if (relPath.endsWith(".yml")) return "name: test\n";
  if (relPath.endsWith(".ts")) return "export {}\n";
  return "# test\n";
}

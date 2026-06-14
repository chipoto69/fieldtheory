import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("production environment bootstrap sets linked identity policy variables", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-gh-env-"));
  const binDir = join(root, "bin");
  const logPath = join(root, "gh-calls.jsonl");
  await mkdir(binDir, { recursive: true });
  const ghPath = join(binDir, "gh");
  await writeFile(ghPath, fakeGhScript(), { mode: 0o755 });
  await chmod(ghPath, 0o755);

  const result = spawnSync(process.execPath, [
    "scripts/setup-github-production-env.mjs",
    "--repo",
    "chipoto69/fieldtheory",
    "--apply",
    "--allow-missing-secrets",
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      GH_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /linked_identity_variable=FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true/);
  assert.match(result.stdout, /linked_identity_variable=FIELD_THEORY_BASE_CHAIN_ID=8453/);
  assert.match(result.stdout, /linked_identity_variable=NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta/);

  const calls = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);

  assert.ok(calls.some((args) => args.join(" ") === "variable set X402_ENABLED --repo chipoto69/fieldtheory --env production --body false"));
  assert.ok(calls.some((args) => args.join(" ") === "variable set FIELD_THEORY_REQUIRE_LINKED_IDENTITIES --repo chipoto69/fieldtheory --env production --body true"));
  assert.ok(calls.some((args) => args.join(" ") === "variable set FIELD_THEORY_BASE_CHAIN_ID --repo chipoto69/fieldtheory --env production --body 8453"));
  assert.ok(calls.some((args) => args.join(" ") === "variable set NEXT_PUBLIC_BASE_CHAIN_ID --repo chipoto69/fieldtheory --env production --body 8453"));
  assert.ok(calls.some((args) => args.join(" ") === "variable set FIELD_THEORY_SOLANA_CLUSTER --repo chipoto69/fieldtheory --env production --body mainnet-beta"));
  assert.ok(calls.some((args) => args.join(" ") === "variable set NEXT_PUBLIC_SOLANA_CLUSTER --repo chipoto69/fieldtheory --env production --body mainnet-beta"));
});

test("production environment bootstrap redacts noisy gh failure output", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldtheory-gh-env-leak-"));
  const binDir = join(root, "bin");
  await mkdir(binDir, { recursive: true });
  const ghPath = join(binDir, "gh");
  await writeFile(ghPath, fakeGhLeakScript(), { mode: 0o755 });
  await chmod(ghPath, 0o755);

  const result = spawnSync(process.execPath, [
    "scripts/setup-github-production-env.mjs",
    "--repo",
    "chipoto69/fieldtheory",
    "--apply",
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
  });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result.stderr, /postgres:\/\/user:password@example\.com/);
  assert.doesNotMatch(result.stderr, /0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd/);
  assert.doesNotMatch(result.stderr, /github-subject-123/);
  assert.match(result.stderr, /Bearer <redacted>/);
  assert.match(result.stderr, /postgres:\/\/<redacted>/);
});

function fakeGhScript(): string {
  return `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.GH_LOG, JSON.stringify(args) + "\\n");

if (args[0] === "--version") {
  console.log("gh version 2.0.0");
  process.exit(0);
}

if (args[0] === "api") {
  const endpoint = args.find((arg) => arg.startsWith("repos/")) ?? "";
  if (endpoint.includes("deployment-branch-policies") && !args.includes("POST")) {
    console.log(JSON.stringify({ branch_policies: [{ name: "main" }] }));
    process.exit(0);
  }
  if (endpoint.includes("/branches/main")) {
    console.log(JSON.stringify({ protected: true }));
    process.exit(0);
  }
  if (endpoint.includes("/environments/production")) {
    console.log(JSON.stringify({ name: "production" }));
    process.exit(0);
  }
  console.log("{}");
  process.exit(0);
}

if (args[0] === "secret" && args[1] === "list") {
  console.log(JSON.stringify([
    { name: "VERCEL_TOKEN" },
    { name: "VERCEL_ORG_ID" },
    { name: "VERCEL_PROJECT_ID" },
    { name: "DATABASE_URL" },
    { name: "PRIVY_APP_ID" },
    { name: "NEXT_PUBLIC_PRIVY_APP_ID" },
    { name: "PRIVY_APP_SECRET" }
  ]));
  process.exit(0);
}

if (args[0] === "variable" && args[1] === "list") {
  console.log(JSON.stringify([
    { name: "X402_ENABLED", value: "false" },
    { name: "FIELD_THEORY_REQUIRE_LINKED_IDENTITIES", value: "true" },
    { name: "FIELD_THEORY_BASE_CHAIN_ID", value: "8453" },
    { name: "NEXT_PUBLIC_BASE_CHAIN_ID", value: "8453" },
    { name: "FIELD_THEORY_SOLANA_CLUSTER", value: "mainnet-beta" },
    { name: "NEXT_PUBLIC_SOLANA_CLUSTER", value: "mainnet-beta" }
  ]));
  process.exit(0);
}

if (args[0] === "variable" && args[1] === "set") {
  process.exit(0);
}

console.log("{}");
process.exit(0);
`;
}

function fakeGhLeakScript(): string {
  return `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("gh version 2.0.0");
  process.exit(0);
}
console.error("Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 DATABASE_URL=postgres://user:password@example.com/fieldtheory walletAddress=0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd linkedAccountSubject=github-subject-123");
process.exit(1);
`;
}

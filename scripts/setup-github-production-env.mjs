#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const REQUIRED_SECRETS = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
];

const OPTIONAL_SECRETS = ["PRIVY_JWT_VERIFICATION_KEY"];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const allowMissingSecrets = args.has("--allow-missing-secrets");
const protectMain = args.has("--protect-main");
const repo = readOption("--repo") ?? process.env.GITHUB_REPOSITORY ?? "chipoto69/fieldtheory";
const environment = readOption("--environment") ?? "production";
const branch = readOption("--branch") ?? "main";

main();

function main() {
  requireGh();
  console.log(`repo=${repo}`);
  console.log(`environment=${environment}`);
  console.log(`branch_policy=${branch}`);
  console.log(`mode=${apply ? "apply" : "dry-run"}`);

  if (apply) {
    ensureEnvironment();
    ensureBranchPolicy();
    ensureX402Variable();
    if (protectMain) ensureBranchProtection();
  } else {
    console.log("dry-run: would create/update the GitHub environment and X402_ENABLED=false variable.");
    console.log("dry-run: would add a deployment branch policy for main if it is missing.");
    if (protectMain) console.log("dry-run: would enable branch protection requiring the preview check on main.");
  }

  const environmentState = readEnvironment();
  const branchState = readBranch();
  const secrets = listSecrets();
  const variables = listVariables();
  const requiredMissing = REQUIRED_SECRETS.filter((name) => !secrets.includes(name));
  const optionalMissing = OPTIONAL_SECRETS.filter((name) => !secrets.includes(name));
  const x402 = variables.find((variable) => variable.name === "X402_ENABLED");

  console.log(`environment_exists=${environmentState.exists}`);
  console.log(`branch_protected=${branchState.protected}`);
  console.log(`required_secrets_present=${requiredMissing.length === 0}`);
  console.log(`required_secrets_missing=${requiredMissing.join(",") || "none"}`);
  console.log(`optional_secrets_missing=${optionalMissing.join(",") || "none"}`);
  console.log(`x402_variable=${x402 ? `${x402.name}=${x402.value}` : "missing"}`);

  if (apply && x402?.value !== "false") {
    fail("X402_ENABLED was not set to false.");
  }
  if (requiredMissing.length > 0 && allowMissingSecrets) {
    console.log("missing secrets allowed: environment bootstrap is complete, but production deploy remains blocked.");
  }
  if (requiredMissing.length > 0 && !allowMissingSecrets) {
    process.exitCode = 2;
  }
}

function ensureEnvironment() {
  gh([
    "api",
    "--method",
    "PUT",
    `repos/${repo}/environments/${environment}`,
    "-F",
    "deployment_branch_policy[protected_branches]=false",
    "-F",
    "deployment_branch_policy[custom_branch_policies]=true",
  ]);
}

function ensureBranchPolicy() {
  const policies = ghJson([
    "api",
    `repos/${repo}/environments/${environment}/deployment-branch-policies`,
  ], { allowFailure: true });
  const branches = Array.isArray(policies?.branch_policies) ? policies.branch_policies : [];
  if (branches.some((policy) => policy?.name === branch)) return;
  gh([
    "api",
    "--method",
    "POST",
    `repos/${repo}/environments/${environment}/deployment-branch-policies`,
    "-f",
    `name=${branch}`,
  ]);
}

function ensureX402Variable() {
  gh(["variable", "set", "X402_ENABLED", "--repo", repo, "--env", environment, "--body", "false"]);
}

function ensureBranchProtection() {
  gh([
    "api",
    "--method",
    "PUT",
    `repos/${repo}/branches/${branch}/protection`,
    "--input",
    "-",
  ], {
    input: JSON.stringify({
      required_status_checks: {
        strict: true,
        contexts: ["preview"],
      },
      enforce_admins: true,
      required_pull_request_reviews: null,
      restrictions: null,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
    }),
  });
}

function readEnvironment() {
  const value = ghJson(["api", `repos/${repo}/environments/${environment}`], { allowFailure: true });
  return { exists: Boolean(value?.name) };
}

function readBranch() {
  const value = ghJson(["api", `repos/${repo}/branches/${branch}`], { allowFailure: true });
  return { protected: Boolean(value?.protected) };
}

function listSecrets() {
  const result = ghJson(["secret", "list", "--repo", repo, "--env", environment, "--json", "name"], {
    allowFailure: true,
  });
  return Array.isArray(result) ? result.map((secret) => secret.name).filter(Boolean) : [];
}

function listVariables() {
  const result = ghJson(["variable", "list", "--repo", repo, "--env", environment, "--json", "name,value"], {
    allowFailure: true,
  });
  return Array.isArray(result) ? result : [];
}

function requireGh() {
  const result = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) fail("GitHub CLI is required on PATH.");
}

function gh(args, options = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8", input: options.input });
  if (result.status !== 0 && !options.allowFailure) {
    fail(result.stderr.trim() || result.stdout.trim() || `gh ${args.join(" ")} failed`);
  }
  return result;
}

function ghJson(args, options = {}) {
  const result = gh(args, options);
  if (result.status !== 0) return undefined;
  const text = result.stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from gh ${args.join(" ")}`);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
  return value;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

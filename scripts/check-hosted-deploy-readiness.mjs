#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_GITHUB_SECRETS = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
];

export const OPTIONAL_GITHUB_SECRETS = ["PRIVY_JWT_VERIFICATION_KEY"];

const PRODUCTION_IDENTITY_POLICY = {
  required: "true",
  baseChainId: "8453",
  solanaCluster: "mainnet-beta",
};

export const REQUIRED_PACKAGE_SCRIPTS = [
  "release:check",
  "verify:hosted",
  "hosted:setup-github-env",
  "hosted:check-readiness",
  "hosted:smoke",
];

export const REQUIRED_LOCAL_FILES = [
  ".github/workflows/vercel-preview.yml",
  ".github/workflows/vercel-production.yml",
  "apps/portal/vercel.json",
  "apps/portal/app/api/health/route.ts",
  "apps/portal/app/api/x402/discovery/route.ts",
  "apps/portal/src/lib/x402-discovery.v1.json",
  "apps/portal/tests/fixtures/x402-discovery.v1.json",
  "apps/portal/tests/fixtures/x402-audit-events.v1.json",
  "scripts/smoke-hosted-deployment.mjs",
  "docs/handoff/x402-milestone-3.md",
  "docs/release/milestone-2-hosted-readiness.md",
  "docs/deploy/vercel-github-actions.md",
  "docs/setup/hosted-suite-environment.md",
];

const VERCEL_PROJECT_FILE = "apps/portal/.vercel/project.json";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = options.repoRoot ?? process.cwd();
  const github = options.remote
    ? collectGithubState({
        repo: options.repo,
        environment: options.environment,
        branch: options.branch,
      })
    : { checked: false, secrets: [], variables: [], requiredStatusChecks: [] };
  const report = await evaluateHostedDeployReadiness({
    repoRoot,
    env: process.env,
    github,
    repo: options.repo,
    environment: options.environment,
    branch: options.branch,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReadinessMarkdown(report));
  }

  if (options.strict && report.status !== "ready") {
    process.exitCode = 2;
  }
}

export async function evaluateHostedDeployReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const env = options.env ?? process.env;
  const repo = options.repo ?? "chipoto69/fieldtheory";
  const environment = options.environment ?? "production";
  const branch = options.branch ?? "main";
  const requiredLocalFiles = options.requiredLocalFiles ?? REQUIRED_LOCAL_FILES;
  const checks = [];

  const localMissing = await missingFiles(repoRoot, requiredLocalFiles);
  addCheck(checks, {
    id: "local_artifacts",
    title: "Required hosted release artifacts exist",
    status: localMissing.length === 0 ? "pass" : "block",
    detail: localMissing.length === 0 ? "All required files are present." : `Missing: ${localMissing.join(", ")}`,
  });

  const scripts = await readPackageScripts(repoRoot);
  const missingScripts = REQUIRED_PACKAGE_SCRIPTS.filter((name) => !scripts[name]);
  addCheck(checks, {
    id: "package_scripts",
    title: "Required hosted package scripts exist",
    status: missingScripts.length === 0 ? "pass" : "block",
    detail: missingScripts.length === 0 ? "Release, hosted verify, environment setup, readiness, and smoke scripts are present." : `Missing scripts: ${missingScripts.join(", ")}`,
  });

  const vercelProject = await readVercelProject(repoRoot);
  addCheck(checks, {
    id: "vercel_project_link",
    title: "Local Vercel project metadata exists",
    status: vercelProject.linked ? "pass" : "block",
    detail: vercelProject.linked
      ? `${VERCEL_PROJECT_FILE} is present with project metadata.`
      : `${VERCEL_PROJECT_FILE} is missing or incomplete; run Vercel project linking before production.`,
  });

  const github = normalizeGithubState(options.github);
  if (!github.checked) {
    addCheck(checks, {
      id: "github_remote_state",
      title: "GitHub production environment was checked",
      status: "block",
      detail: "Remote GitHub environment was not checked. Run with --remote before production promotion.",
    });
  } else if (github.error) {
    addCheck(checks, {
      id: "github_remote_state",
      title: "GitHub production environment was checked",
      status: "block",
      detail: `Remote GitHub check failed: ${github.error}`,
    });
  } else {
    addCheck(checks, {
      id: "github_environment",
      title: "GitHub production environment exists",
      status: github.environmentExists ? "pass" : "block",
      detail: github.environmentExists ? "Production environment exists." : "Production environment is missing.",
    });
    addCheck(checks, {
      id: "github_deployment_branch",
      title: "GitHub production deploy branch is main",
      status: github.deploymentBranchPolicy === "main" ? "pass" : "block",
      detail:
        github.deploymentBranchPolicy === "main"
          ? "Production deployment branch policy is main."
          : `Production deployment branch policy is ${github.deploymentBranchPolicy || "missing"}.`,
    });
    addCheck(checks, {
      id: "github_branch_protection",
      title: "Main branch protection is enabled",
      status: github.branchProtected ? "pass" : "block",
      detail: github.branchProtected ? "Main branch is protected." : "Main branch protection is missing.",
    });
    const missingStatuses = ["preview"].filter((name) => !github.requiredStatusChecks.includes(name));
    addCheck(checks, {
      id: "github_required_checks",
      title: "Main branch requires preview check",
      status: missingStatuses.length === 0 ? "pass" : "block",
      detail:
        missingStatuses.length === 0
          ? "Required status checks include preview."
          : `Missing required status checks: ${missingStatuses.join(", ")}`,
    });
    const missingSecrets = REQUIRED_GITHUB_SECRETS.filter((name) => !github.secrets.includes(name));
    addCheck(checks, {
      id: "github_required_secrets",
      title: "GitHub production secrets are configured",
      status: missingSecrets.length === 0 ? "pass" : "block",
      detail:
        missingSecrets.length === 0
          ? "All required production secret names are present."
          : `Missing secret names: ${missingSecrets.join(", ")}`,
    });
    const missingOptionalSecrets = OPTIONAL_GITHUB_SECRETS.filter((name) => !github.secrets.includes(name));
    addCheck(checks, {
      id: "github_optional_secrets",
      title: "Optional GitHub production secrets",
      status: missingOptionalSecrets.length === 0 ? "pass" : "warn",
      detail:
        missingOptionalSecrets.length === 0
          ? "Optional production secret names are present."
          : `Optional secret names missing: ${missingOptionalSecrets.join(", ")}`,
    });
  }

  const x402 = resolveX402Value(github.variables, env);
  addCheck(checks, {
    id: "x402_disabled",
    title: "x402 enforcement is disabled",
    status: x402 === "false" ? "pass" : "block",
    detail:
      x402 === "true"
        ? "X402_ENABLED is true; production must keep x402 disabled until the enforcement gate passes."
        : x402 === "false"
          ? "X402_ENABLED is false."
          : "X402_ENABLED is unset; production readiness requires an explicit false policy.",
  });

  const identityPolicy = resolveLinkedIdentityPolicy(github.variables, env);
  addCheck(checks, {
    id: "linked_identity_policy",
    title: "Linked GitHub/Base/Solana identity policy is required",
    status: identityPolicy.issues.length === 0 ? "pass" : "block",
    detail:
      identityPolicy.issues.length === 0
        ? "Linked identity policy requires GitHub, Base EVM chain 8453, and Solana mainnet-beta."
        : `Invalid linked identity production policy: ${identityPolicy.issues.join("; ")}`,
  });

  const blockers = checks
    .filter((check) => check.status === "block")
    .map((check) => ({ id: check.id, title: check.title, detail: check.detail }));
  const warnings = checks
    .filter((check) => check.status === "warn")
    .map((check) => ({ id: check.id, title: check.title, detail: check.detail }));
  const operatorActions = buildOperatorActions(checks, { repo, environment, branch });

  return {
    version: "fieldtheory.hosted-deploy-readiness.v1",
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    summary: {
      blockerCount: blockers.length,
      warningCount: warnings.length,
      actionCount: operatorActions.length,
      checkedRemote: Boolean(github.checked),
    },
    checks,
    blockers,
    warnings,
    operatorActions,
  };
}

export function formatReadinessMarkdown(report) {
  const lines = [
    "# Hosted Deploy Readiness",
    "",
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    "",
  ];
  if (report.blockers.length > 0) {
    lines.push("## Blockers", "");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker.title}: ${blocker.detail}`);
    }
    lines.push("");
  }
  if (report.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.title}: ${warning.detail}`);
    }
    lines.push("");
  }
  if (Array.isArray(report.operatorActions) && report.operatorActions.length > 0) {
    lines.push("## Operator Actions", "");
    for (const action of report.operatorActions) {
      lines.push(`- [${action.severity}] ${action.title}: ${action.action}`);
      if (action.command) lines.push(`  Command: \`${action.command}\``);
      if (action.docs) lines.push(`  Docs: ${action.docs}`);
    }
    lines.push("");
  }
  lines.push("## Checks", "");
  for (const check of report.checks) {
    lines.push(`- [${check.status}] ${check.title}: ${check.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildOperatorActions(checks, context) {
  return checks
    .filter((check) => check.status === "block" || check.status === "warn")
    .map((check) => operatorActionForCheck(check, context))
    .filter(Boolean);
}

function operatorActionForCheck(check, context) {
  const base = {
    id: check.id,
    severity: check.status,
    title: check.title,
  };

  switch (check.id) {
    case "local_artifacts":
      return {
        ...base,
        action: "Restore the required release artifacts before deployment readiness is evaluated again.",
        docs: "docs/release/milestone-2-hosted-readiness.md",
      };
    case "package_scripts":
      return {
        ...base,
        action: "Restore the hosted release scripts in the root package.json before CI or deployment setup continues.",
        docs: "docs/setup/hosted-suite-environment.md",
      };
    case "vercel_project_link":
      return {
        ...base,
        action: "Link the portal to the intended Vercel project locally; do not commit .vercel metadata.",
        command: "cd apps/portal && vercel link",
        docs: "docs/setup/hosted-suite-environment.md",
      };
    case "github_remote_state":
      return {
        ...base,
        action: "Restore GitHub CLI authentication, then rerun the remote readiness auditor.",
        command: `gh auth login -h github.com && ${readinessCommand(context)}`,
        docs: "docs/deploy/vercel-github-actions.md",
      };
    case "github_environment":
    case "github_deployment_branch":
    case "github_branch_protection":
    case "github_required_checks":
      return {
        ...base,
        action: "Apply the non-secret GitHub production environment and protected-main bootstrap.",
        command: setupGithubEnvironmentCommand(context),
        docs: "docs/deploy/vercel-github-actions.md",
      };
    case "github_required_secrets":
      return {
        ...base,
        action: "Set the missing GitHub production secret names with operator-owned values, and mirror matching values in Vercel.",
        command: secretSetCommand(missingSecretNamesFromDetail(check.detail, REQUIRED_GITHUB_SECRETS), context),
        docs: "docs/setup/hosted-suite-environment.md",
      };
    case "github_optional_secrets":
      return {
        ...base,
        action: "Set the optional Privy verification key only if the production Privy dashboard policy uses it.",
        command: secretSetCommand(missingSecretNamesFromDetail(check.detail, OPTIONAL_GITHUB_SECRETS), context),
        docs: "docs/setup/hosted-suite-environment.md",
      };
    case "x402_disabled":
      return {
        ...base,
        action: "Set the GitHub production environment variable to keep x402 enforcement explicitly disabled.",
        command: `gh variable set X402_ENABLED --repo ${shellToken(context.repo)} --env ${shellToken(context.environment)} --body false`,
        docs: "docs/handoff/x402-milestone-3.md",
      };
    case "linked_identity_policy":
      return {
        ...base,
        action: "Set the non-secret GitHub production variables for required GitHub/Base/Solana linked identities, and mirror the same values in Vercel.",
        command: linkedIdentityPolicyCommand(context),
        docs: "docs/setup/hosted-suite-environment.md",
      };
    default:
      return {
        ...base,
        action: "Resolve this readiness check before production promotion.",
        docs: "docs/release/milestone-2-hosted-readiness.md",
      };
  }
}

function setupGithubEnvironmentCommand(context) {
  return [
    "npm run hosted:setup-github-env --",
    "--repo",
    shellToken(context.repo),
    "--environment",
    shellToken(context.environment),
    "--branch",
    shellToken(context.branch),
    "--apply",
    "--allow-missing-secrets",
    "--protect-main",
  ].join(" ");
}

function readinessCommand(context) {
  return [
    "npm run hosted:check-readiness --",
    "--repo",
    shellToken(context.repo),
    "--environment",
    shellToken(context.environment),
    "--branch",
    shellToken(context.branch),
    "--remote",
    "--strict",
    "--json",
  ].join(" ");
}

function secretSetCommand(names, context) {
  return `for name in ${names.map(shellToken).join(" ")}; do gh secret set "$name" --repo ${shellToken(context.repo)} --env ${shellToken(context.environment)}; done`;
}

function missingSecretNamesFromDetail(detail, fallbackNames) {
  const match = String(detail ?? "").match(/(?:Missing secret names|Optional secret names missing):\s*([^.;]+)/);
  if (!match) return fallbackNames;
  const names = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : fallbackNames;
}

function linkedIdentityPolicyCommand(context) {
  return [
    variableSetCommand("FIELD_THEORY_REQUIRE_LINKED_IDENTITIES", PRODUCTION_IDENTITY_POLICY.required, context),
    variableSetCommand("FIELD_THEORY_BASE_CHAIN_ID", PRODUCTION_IDENTITY_POLICY.baseChainId, context),
    variableSetCommand("NEXT_PUBLIC_BASE_CHAIN_ID", PRODUCTION_IDENTITY_POLICY.baseChainId, context),
    variableSetCommand("FIELD_THEORY_SOLANA_CLUSTER", PRODUCTION_IDENTITY_POLICY.solanaCluster, context),
    variableSetCommand("NEXT_PUBLIC_SOLANA_CLUSTER", PRODUCTION_IDENTITY_POLICY.solanaCluster, context),
  ].join(" && ");
}

function variableSetCommand(name, value, context) {
  return `gh variable set ${shellToken(name)} --repo ${shellToken(context.repo)} --env ${shellToken(context.environment)} --body ${shellToken(value)}`;
}

function parseArgs(args) {
  return {
    repo: readOption(args, "--repo") ?? process.env.GITHUB_REPOSITORY ?? "chipoto69/fieldtheory",
    environment: readOption(args, "--environment") ?? "production",
    branch: readOption(args, "--branch") ?? "main",
    repoRoot: readOption(args, "--repo-root"),
    remote: args.includes("--remote"),
    strict: args.includes("--strict"),
    json: args.includes("--json"),
  };
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

async function missingFiles(repoRoot, paths) {
  const missing = [];
  for (const relPath of paths) {
    try {
      await access(join(repoRoot, relPath), fsConstants.F_OK);
    } catch {
      missing.push(relPath);
    }
  }
  return missing;
}

async function readPackageScripts(repoRoot) {
  try {
    const text = await readFile(join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(text);
    return pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  } catch {
    return {};
  }
}

async function readVercelProject(repoRoot) {
  try {
    const text = await readFile(join(repoRoot, VERCEL_PROJECT_FILE), "utf8");
    const project = JSON.parse(text);
    return { linked: Boolean(project?.projectId && project?.orgId) };
  } catch {
    return { linked: false };
  }
}

function normalizeGithubState(github = {}) {
  return {
    checked: Boolean(github.checked),
    error: sanitizeDetail(github.error),
    environmentExists: Boolean(github.environmentExists),
    deploymentBranchPolicy: typeof github.deploymentBranchPolicy === "string" ? github.deploymentBranchPolicy : undefined,
    branchProtected: Boolean(github.branchProtected),
    requiredStatusChecks: arrayOfStrings(github.requiredStatusChecks),
    secrets: arrayOfStrings(github.secrets),
    variables: Array.isArray(github.variables) ? github.variables.map(normalizeVariable).filter(Boolean) : [],
  };
}

function normalizeVariable(variable) {
  if (!variable || typeof variable !== "object") return undefined;
  if (typeof variable.name !== "string") return undefined;
  const value = typeof variable.value === "string" ? variable.value : "";
  return { name: variable.name, value };
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function resolveX402Value(variables, env) {
  const remote = variables.find((variable) => variable.name === "X402_ENABLED")?.value;
  const value = remote ?? env?.X402_ENABLED;
  if (value === "true") return "true";
  if (value === "false") return "false";
  return "unset";
}

function resolveLinkedIdentityPolicy(variables, env) {
  const required = variableValue(variables, env, "FIELD_THEORY_REQUIRE_LINKED_IDENTITIES");
  const baseChainId = variableValue(variables, env, "FIELD_THEORY_BASE_CHAIN_ID");
  const publicBaseChainId = variableValue(variables, env, "NEXT_PUBLIC_BASE_CHAIN_ID");
  const solanaCluster = variableValue(variables, env, "FIELD_THEORY_SOLANA_CLUSTER");
  const publicSolanaCluster = variableValue(variables, env, "NEXT_PUBLIC_SOLANA_CLUSTER");
  const issues = [];

  if (required !== PRODUCTION_IDENTITY_POLICY.required) {
    issues.push("FIELD_THEORY_REQUIRE_LINKED_IDENTITIES must be true");
  }
  if (baseChainId !== PRODUCTION_IDENTITY_POLICY.baseChainId) {
    issues.push(`FIELD_THEORY_BASE_CHAIN_ID must be ${PRODUCTION_IDENTITY_POLICY.baseChainId}`);
  }
  if (publicBaseChainId !== baseChainId) {
    issues.push("NEXT_PUBLIC_BASE_CHAIN_ID must match FIELD_THEORY_BASE_CHAIN_ID");
  }
  if (solanaCluster !== PRODUCTION_IDENTITY_POLICY.solanaCluster) {
    issues.push(`FIELD_THEORY_SOLANA_CLUSTER must be ${PRODUCTION_IDENTITY_POLICY.solanaCluster}`);
  }
  if (publicSolanaCluster !== solanaCluster) {
    issues.push("NEXT_PUBLIC_SOLANA_CLUSTER must match FIELD_THEORY_SOLANA_CLUSTER");
  }

  return { issues };
}

function variableValue(variables, env, name) {
  const remote = variables.find((variable) => variable.name === name)?.value;
  const value = remote ?? env?.[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function addCheck(checks, check) {
  checks.push({
    id: check.id,
    title: check.title,
    status: check.status,
    detail: sanitizeDetail(check.detail),
  });
}

function sanitizeDetail(value) {
  return String(value ?? "")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgres://<redacted>")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s"'<>/]+@/gi, "$1<redacted>@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|vercel)_[A-Za-z0-9_]+/g, "<redacted-token>")
    .replace(/\b0x[a-fA-F0-9]{40}\b/g, "0x<redacted>")
    .replace(/\b(linkedAccountSubject|(?:linked[-_ ]?account[-_ ]?)?subject|wallet(?:Address)?|address|actor|username|user)\s*[:=]\s*([^\s,;}\]]+)/gi, "$1=<redacted>")
    .replace(/\b(token|secret|password|key)\s*[:=]\s*([^\s,;}\]]+)/gi, "$1=<redacted>");
}

function collectGithubState({ repo, environment, branch }) {
  const ghAvailable = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (ghAvailable.status !== 0) {
    return {
      checked: true,
      error: "GitHub CLI is not available on PATH.",
      secrets: [],
      variables: [],
      requiredStatusChecks: [],
    };
  }

  const env = ghJson(["api", `repos/${repo}/environments/${environment}`], { allowFailure: true });
  const branchState = ghJson(["api", `repos/${repo}/branches/${branch}`], { allowFailure: true });
  const protection = ghJson(["api", `repos/${repo}/branches/${branch}/protection`], { allowFailure: true });
  const secrets = ghJson(["secret", "list", "--repo", repo, "--env", environment, "--json", "name"], {
    allowFailure: true,
  });
  const variables = ghJson(["variable", "list", "--repo", repo, "--env", environment, "--json", "name,value"], {
    allowFailure: true,
  });
  const branchPolicy = readDeploymentBranchPolicy(repo, environment, branch, env);

  return {
    checked: true,
    environmentExists: Boolean(env?.name),
    deploymentBranchPolicy: branchPolicy,
    branchProtected: Boolean(branchState?.protected),
    requiredStatusChecks: readRequiredStatusChecks(protection),
    secrets: Array.isArray(secrets) ? secrets.map((secret) => secret.name).filter(Boolean) : [],
    variables: Array.isArray(variables) ? variables : [],
  };
}

function readDeploymentBranchPolicy(repo, environment, branch, env) {
  if (!env?.deployment_branch_policy) return undefined;
  if (env.deployment_branch_policy.protected_branches) return "protected_branches";
  if (!env.deployment_branch_policy.custom_branch_policies) return undefined;
  const policies = ghJson(["api", `repos/${repo}/environments/${environment}/deployment-branch-policies`], {
    allowFailure: true,
  });
  const branches = Array.isArray(policies?.branch_policies) ? policies.branch_policies : [];
  return branches.some((policy) => policy?.name === branch) ? branch : "missing";
}

function readRequiredStatusChecks(protection) {
  const statusChecks = protection?.required_status_checks;
  if (!statusChecks) return [];
  if (Array.isArray(statusChecks.contexts)) return statusChecks.contexts.filter(Boolean);
  if (Array.isArray(statusChecks.checks)) {
    return statusChecks.checks.map((check) => check?.context).filter(Boolean);
  }
  return [];
}

function shellToken(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function ghJson(args, options = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    if (options.allowFailure) return undefined;
    throw new Error(sanitizeDetail(result.stderr.trim() || result.stdout.trim() || `gh ${args.join(" ")} failed`));
  }
  const text = result.stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    if (options.allowFailure) return undefined;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Expected JSON from gh ${args.join(" ")}: ${message}`);
  }
}

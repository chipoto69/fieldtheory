#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBaseUrl } from "./smoke-hosted-deployment.mjs";

export const HOSTED_RELEASE_EVIDENCE_VERSION = "fieldtheory.hosted-release-evidence.v1";

const DEFAULT_OUT_DIR = "docs/release/evidence/hosted-production";
const REQUIRED_PUBLIC_SMOKE_CHECKS = [
  "health",
  "contracts",
  "x402_discovery",
  "agents_unauthenticated",
];
const REQUIRED_AUTH_SMOKE_CHECKS = [
  "agents_authenticated",
  "brief_validate_authenticated",
  "agent_run_authenticated",
  "agent_run_readback_authenticated",
];
const OUTPUT_FILES = {
  vercelInspect: "vercel-inspect.txt",
  publicSmoke: "production-smoke-public.json",
  authenticatedSmoke: "production-smoke-authenticated.json",
  dbSchema: "production-db-schema.txt",
  privyIdentity: "production-privy-identity.json",
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await writeHostedReleaseEvidence({
    deploymentUrl: options.deploymentUrl ?? process.env.FIELD_THEORY_PRODUCTION_URL,
    deploymentId: options.deploymentId ?? process.env.FIELD_THEORY_VERCEL_DEPLOYMENT_ID,
    rollbackRef: options.rollbackRef ?? process.env.FIELD_THEORY_ROLLBACK_REF,
    firstProductionRelease: options.firstProductionRelease || process.env.FIELD_THEORY_FIRST_PRODUCTION_RELEASE === "true",
    outDir: options.out ?? DEFAULT_OUT_DIR,
    allowHttp: options.allowHttp,
    artifacts: {
      vercelInspect: options.vercelInspect,
      publicSmoke: options.publicSmoke,
      authenticatedSmoke: options.authenticatedSmoke,
      dbSchema: options.dbSchema,
      privyIdentity: options.privyIdentity,
    },
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatHostedReleaseEvidenceMarkdown(report));
  }

  if (report.status !== "ready") process.exitCode = 2;
}

export async function writeHostedReleaseEvidence(options) {
  const outDir = resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const report = await buildHostedReleaseEvidence(options);
  await mkdir(outDir, { recursive: true });

  for (const artifact of report.artifacts) {
    if (artifact.status === "present" && artifact.body !== undefined) {
      await writeFile(join(outDir, artifact.file), artifact.body);
    }
  }

  const manifest = {
    version: report.version,
    status: report.status,
    generatedAt: report.generatedAt,
    deployment: report.deployment,
    rollback: report.rollback,
    summary: report.summary,
    checks: report.checks,
    blockers: report.blockers,
    artifacts: report.artifacts.map(({ body: _body, ...artifact }) => artifact),
  };
  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, "README.md"), formatHostedReleaseEvidenceMarkdown(report));
  return report;
}

export async function buildHostedReleaseEvidence(options) {
  const checks = [];
  const artifacts = [];
  let deploymentUrl;
  let deploymentId = cleanOptional(options.deploymentId);
  const firstProductionRelease = options.firstProductionRelease === true;

  try {
    const normalized = normalizeBaseUrl(options.deploymentUrl, { allowHttp: options.allowHttp });
    deploymentUrl = `${normalized.origin}${normalized.pathname.replace(/\/$/, "")}`;
    addCheck(checks, {
      id: "deployment_url",
      title: "Production deployment URL is explicit and secret-free",
      status: "pass",
      detail: "Deployment URL is normalized and contains no credentials, query, or fragment.",
    });
  } catch (error) {
    addCheck(checks, {
      id: "deployment_url",
      title: "Production deployment URL is explicit and secret-free",
      status: "block",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const vercelInspect = await collectArtifact({
    id: "vercel_inspect",
    title: "Vercel inspect output records deployment metadata",
    inputPath: options.artifacts?.vercelInspect,
    outputFile: OUTPUT_FILES.vercelInspect,
    validate: (text) => {
      const parsedId = extractDeploymentId(text);
      if (!deploymentId && parsedId) deploymentId = parsedId;
      return deploymentId
        ? pass(`Deployment id recorded as ${deploymentId}.`)
        : block("Vercel inspect evidence must include a deployment id, or pass --deployment-id.");
    },
  });
  artifacts.push(vercelInspect.artifact);
  checks.push(vercelInspect.check);

  addCheck(checks, {
    id: "deployment_id",
    title: "Vercel deployment id is recorded",
    status: deploymentId ? "pass" : "block",
    detail: deploymentId
      ? "Deployment id is available for rollback and audit."
      : "Missing deployment id. Provide --deployment-id or a Vercel inspect file containing dpl_*.",
  });

  const publicSmoke = await collectArtifact({
    id: "public_smoke",
    title: "Public hosted smoke passed",
    inputPath: options.artifacts?.publicSmoke,
    outputFile: OUTPUT_FILES.publicSmoke,
    validate: validatePublicSmoke,
  });
  artifacts.push(publicSmoke.artifact);
  checks.push(publicSmoke.check);

  const authenticatedSmoke = await collectArtifact({
    id: "authenticated_smoke",
    title: "Authenticated hosted smoke passed",
    inputPath: options.artifacts?.authenticatedSmoke,
    outputFile: OUTPUT_FILES.authenticatedSmoke,
    validate: validateAuthenticatedSmoke,
  });
  artifacts.push(authenticatedSmoke.artifact);
  checks.push(authenticatedSmoke.check);

  const dbSchema = await collectArtifact({
    id: "db_schema",
    title: "Target production database schema version is proven",
    inputPath: options.artifacts?.dbSchema,
    outputFile: OUTPUT_FILES.dbSchema,
    validate: validateDbSchema,
  });
  artifacts.push(dbSchema.artifact);
  checks.push(dbSchema.check);

  const privyIdentity = await collectArtifact({
    id: "privy_identity",
    title: "Privy linked identity policy is satisfied",
    inputPath: options.artifacts?.privyIdentity,
    outputFile: OUTPUT_FILES.privyIdentity,
    validate: validatePrivyIdentity,
  });
  artifacts.push(privyIdentity.artifact);
  checks.push(privyIdentity.check);

  const rollbackRef = cleanOptional(options.rollbackRef);
  addCheck(checks, {
    id: "rollback_ref",
    title: "Rollback posture is recorded",
    status: rollbackRef || firstProductionRelease ? "pass" : "block",
    detail: rollbackRef
      ? "Previous known-good rollback deployment reference is present."
      : firstProductionRelease
        ? "First production release is explicitly marked; this deployment becomes the rollback baseline after promotion."
        : "Missing rollback posture. Pass --rollback-ref with the previous known-good deployment, or --first-production-release for the initial launch.",
  });

  const blockers = checks.filter((check) => check.status === "block");
  const report = {
    version: HOSTED_RELEASE_EVIDENCE_VERSION,
    status: blockers.length === 0 ? "ready" : "blocked",
    generatedAt: new Date().toISOString(),
    deployment: {
      url: deploymentUrl,
      id: deploymentId,
    },
    rollback: {
      ref: rollbackRef,
      firstProductionRelease,
    },
    summary: {
      checkCount: checks.length,
      blockerCount: blockers.length,
      artifactCount: artifacts.filter((artifact) => artifact.status === "present").length,
    },
    checks,
    blockers: blockers.map(({ id, title, detail }) => ({ id, title, detail })),
    artifacts,
  };
  return report;
}

export function formatHostedReleaseEvidenceMarkdown(report) {
  const lines = [
    "# Hosted Release Evidence",
    "",
    "```text",
    "operator secrets",
    "  -> protected production workflow",
    "  -> deployment URL + deployment id",
    "  -> public smoke JSON",
    "  -> target DB schema proof",
    "  -> Privy linked identity proof",
    "  -> rollback posture",
    "  -> release manifest",
    "```",
    "",
    `Status: ${report.status}`,
    `Deployment URL: ${report.deployment.url ?? "missing"}`,
    `Deployment ID: ${report.deployment.id ?? "missing"}`,
    `Rollback Ref: ${report.rollback.ref ?? "missing"}`,
    `First Production Release: ${report.rollback.firstProductionRelease ? "yes" : "no"}`,
    "",
  ];

  if (report.blockers.length > 0) {
    lines.push("## Blockers", "");
    for (const blocker of report.blockers) lines.push(`- ${blocker.title}: ${blocker.detail}`);
    lines.push("");
  }

  lines.push("## Checks", "");
  for (const check of report.checks) lines.push(`- ${check.status}: ${check.title} - ${check.detail}`);
  lines.push("", "## Artifacts", "");
  for (const artifact of report.artifacts) {
    lines.push(`- ${artifact.status}: ${artifact.label} -> ${artifact.file}`);
  }
  return `${lines.join("\n")}\n`;
}

async function collectArtifact({ id, title, inputPath, outputFile, validate }) {
  if (!inputPath) {
    return {
      check: {
        id,
        title,
        status: "block",
        detail: `Missing artifact input for ${outputFile}.`,
      },
      artifact: {
        id,
        label: title,
        file: outputFile,
        status: "missing",
      },
    };
  }

  try {
    const raw = await readFile(inputPath, "utf8");
    const sanitized = sanitizeEvidenceText(raw);
    const result = validate(raw);
    return {
      check: {
        id,
        title,
        status: result.status,
        detail: result.detail,
      },
      artifact: {
        id,
        label: title,
        file: outputFile,
        status: "present",
        body: ensureTrailingNewline(sanitized),
      },
    };
  } catch (error) {
    return {
      check: {
        id,
        title,
        status: "block",
        detail: `Unable to read ${outputFile}: ${error instanceof Error ? error.message : String(error)}`,
      },
      artifact: {
        id,
        label: title,
        file: outputFile,
        status: "missing",
      },
    };
  }
}

function validatePublicSmoke(text) {
  const json = parseJson(text);
  if (!json) return block("Public smoke artifact must be JSON.");
  const requiredChecks = REQUIRED_PUBLIC_SMOKE_CHECKS;
  if (!hasSmokeShape(json, false, requiredChecks)) {
    return block(`Public smoke must pass ${requiredChecks.join(", ")} with authenticated=false.`);
  }
  return pass("Public smoke passed health/contracts/x402/fail-closed auth checks.");
}

function validateAuthenticatedSmoke(text) {
  const json = parseJson(text);
  if (!json) return block("Authenticated smoke artifact must be JSON.");
  const requiredChecks = REQUIRED_AUTH_SMOKE_CHECKS;
  if (!hasSmokeShape(json, true, requiredChecks)) {
    return block(`Authenticated smoke must pass ${requiredChecks.join(", ")} with authenticated=true.`);
  }
  return pass("Authenticated smoke passed operator, import, dry-run, and readback checks.");
}

function hasSmokeShape(json, authenticated, requiredChecks) {
  if (json.version !== "fieldtheory.hosted-smoke.v1") return false;
  if (json.status !== "passed") return false;
  if (json.summary?.authenticated !== authenticated) return false;
  const checks = new Map((Array.isArray(json.checks) ? json.checks : []).map((check) => [check.id, check.status]));
  return requiredChecks.every((id) => checks.get(id) === "pass");
}

function validateDbSchema(text) {
  const json = parseJson(text);
  if (json && containsSchemaVersionTwo(json)) return pass("Target database schema version 2 is present.");
  if (/fieldtheory_schema_version/i.test(text) && /\b2\b/.test(text)) {
    return pass("Target database schema readback mentions fieldtheory_schema_version version 2.");
  }
  return block("DB schema proof must show fieldtheory_schema_version version 2.");
}

function validatePrivyIdentity(text) {
  const json = parseJson(text);
  if (json) {
    const actor = json.actor ?? json;
    const policy = actor.identityPolicy ?? json.identityPolicy ?? {};
    const required = Array.isArray(policy.required) ? policy.required : [];
    const missing = Array.isArray(policy.missing) ? policy.missing : [];
    const ok = actor.identityPolicyStatus === "satisfied"
      && required.includes("github")
      && required.includes("base_evm:8453")
      && required.includes("solana:mainnet-beta")
      && missing.length === 0;
    return ok
      ? pass("Privy linked identity policy is satisfied for GitHub, Base 8453, and Solana mainnet-beta.")
      : block("Privy identity proof must show identityPolicyStatus=satisfied, no missing identities, and GitHub/Base/Solana requirements.");
  }

  const ok = /identityPolicyStatus\W+satisfied/i.test(text)
    && /github/i.test(text)
    && /base_evm:8453/i.test(text)
    && /solana:mainnet-beta/i.test(text);
  return ok
    ? pass("Privy linked identity policy text names satisfied GitHub/Base/Solana requirements.")
    : block("Privy identity proof must show a satisfied GitHub/Base/Solana policy.");
}

function containsSchemaVersionTwo(value) {
  if (value === 2) return true;
  if (Array.isArray(value)) return value.some((item) => containsSchemaVersionTwo(item));
  if (value && typeof value === "object") {
    if (value.version === 2) return true;
    if (Array.isArray(value.fieldtheory_schema_version)) {
      return value.fieldtheory_schema_version.some((item) => item?.version === 2);
    }
    return Object.values(value).some((item) => containsSchemaVersionTwo(item));
  }
  return false;
}

export function sanitizeEvidenceText(value) {
  return String(value ?? "")
    .replace(/"id"\s*:\s*"(?:privy|did:privy|user)[^"]*"/gi, "\"id\":\"<redacted>\"")
    .replace(/"((?:linkedAccountSubject|subject|walletAddress|address|actor|username|user))"\s*:\s*"[^"]*"/gi, "\"$1\":\"<redacted>\"")
    .replace(/"([^"]*(?:token|secret|password|key)[^"]*)"\s*:\s*"[^"]*"/gi, "\"$1\":\"<redacted>\"")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgres://<redacted>")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s"'<>/]+@/gi, "$1<redacted>@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|vercel)_[A-Za-z0-9_]+/g, "<redacted-token>")
    .replace(/\b0x[a-fA-F0-9]{40}\b/g, "0x<redacted>")
    .replace(/\b(linkedAccountSubject|(?:linked[-_ ]?account[-_ ]?)?subject|wallet(?:Address)?|address|actor|username|user)\s*[:=]\s*([^\s,;}\]]+)/gi, "$1=<redacted>")
    .replace(/\b(token|secret|password|key)\s*[:=]\s*([^\s,;}\]]+)/gi, "$1=<redacted>");
}

function extractDeploymentId(text) {
  return text.match(/\bdpl_[A-Za-z0-9]+\b/)?.[0];
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pass(detail) {
  return { status: "pass", detail };
}

function block(detail) {
  return { status: "block", detail };
}

function addCheck(checks, check) {
  checks.push(check);
}

function cleanOptional(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-http") {
      options.allowHttp = true;
    } else if (arg === "--first-production-release") {
      options.firstProductionRelease = true;
    } else if (arg === "--deployment-url") {
      options.deploymentUrl = readValue(args, ++index, arg);
    } else if (arg === "--deployment-id") {
      options.deploymentId = readValue(args, ++index, arg);
    } else if (arg === "--rollback-ref") {
      options.rollbackRef = readValue(args, ++index, arg);
    } else if (arg === "--out") {
      options.out = readValue(args, ++index, arg);
    } else if (arg === "--vercel-inspect") {
      options.vercelInspect = readValue(args, ++index, arg);
    } else if (arg === "--public-smoke") {
      options.publicSmoke = readValue(args, ++index, arg);
    } else if (arg === "--authenticated-smoke") {
      options.authenticatedSmoke = readValue(args, ++index, arg);
    } else if (arg === "--db-schema") {
      options.dbSchema = readValue(args, ++index, arg);
    } else if (arg === "--privy-identity") {
      options.privyIdentity = readValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

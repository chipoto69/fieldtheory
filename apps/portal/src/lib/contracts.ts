import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  contractVersion?: string;
  kind?: string;
}

export interface ExportManifestSummary {
  target: "aeon" | "hermes" | "soul";
  runId: string;
  fileRelPaths: string[];
  fileHashes: string[];
  forbiddenWrites: string[];
  resultEnvelope: Record<string, unknown>;
}

const BRIEF_VERSION = "agent-brief-pack.v1";
const EXPORT_VERSION = "fieldtheory.agent-export.v1";
const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
const REMOTE_FORBIDDEN = new Set([
  "create_repo",
  "push_remote",
  "write_github_secret",
  "dispatch_workflow",
  "write_root_aeon_yml",
  "write_github_workflow",
  "kanban_write",
  "profile_mutation",
  "external_dispatch",
  "gbrain_write",
  "wiki_canon_write",
  "honcho_write",
  "target_agent_write",
  "network_call",
  "x402_settle",
  "payment_settlement",
]);

export function validateAgentBriefPack(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { valid: false, issues: [{ path: "$", message: "AgentBriefPack must be an object." }] };
  }

  requireLiteral(input, issues, "version", BRIEF_VERSION);
  requireOneOf(input, issues, "kind", ["recall_pack", "source_packet", "dispatch_brief"]);
  for (const key of [
    "input",
    "limits",
    "storeStatus",
    "evidence",
    "boundaries",
    "promotionCandidates",
    "resultEnvelope",
    "summaryClaims",
    "typedSlots",
    "suggestedCommands",
  ]) {
    if (!(key in input)) issues.push({ path: key, message: `${key} is required.` });
  }

  const evidence = arrayAt(input, "evidence", issues);
  const evidenceIds = new Set<string>();
  for (const [index, item] of evidence.entries()) {
    if (!isRecord(item)) {
      issues.push({ path: `evidence[${index}]`, message: "Evidence item must be an object." });
      continue;
    }
    const id = item.id;
    if (typeof id !== "string" || id.length === 0) {
      issues.push({ path: `evidence[${index}].id`, message: "Evidence id must be a non-empty string." });
    } else {
      evidenceIds.add(id);
    }
  }

  validateReferences(input, issues, evidenceIds, "summaryClaims");
  validateReferences(input, issues, evidenceIds, "typedSlots");
  validateReferences(input, issues, evidenceIds, "suggestedCommands");
  validateReferences(input, issues, evidenceIds, "promotionCandidates");
  validateReferences(input, issues, evidenceIds, "boundaries");

  if (input.kind === "source_packet") {
    if (!isRecord(input.sourcePacket)) {
      issues.push({ path: "sourcePacket", message: "source_packet requires sourcePacket." });
    }
    if (arrayAt(input, "boundaries", issues).length === 0) {
      issues.push({ path: "boundaries", message: "source_packet requires at least one boundary." });
    }
  }

  if (isRecord(input.sourcePacket)) {
    if (!Array.isArray(input.sourcePacket.forbiddenActions)) {
      issues.push({ path: "sourcePacket.forbiddenActions", message: "sourcePacket.forbiddenActions must be an array." });
    }
    if (isRecord(input.sourcePacket.payload) && "forbiddenActions" in input.sourcePacket.payload) {
      issues.push({
        path: "sourcePacket.payload.forbiddenActions",
        message: "Use sourcePacket.forbiddenActions instead of payload.forbiddenActions.",
      });
    }
  }

  if (looksSecretLike(JSON.stringify(input))) {
    issues.push({ path: "$", message: "AgentBriefPack contains secret-like content." });
  }

  return {
    valid: issues.length === 0,
    issues,
    contractVersion: typeof input.version === "string" ? input.version : undefined,
    kind: typeof input.kind === "string" ? input.kind : undefined,
  };
}

export function validateExportManifest(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { valid: false, issues: [{ path: "$", message: "Export manifest must be an object." }] };
  }

  requireLiteral(input, issues, "version", EXPORT_VERSION);
  requireOneOf(input, issues, "target", ["aeon", "hermes", "soul"]);
  for (const key of ["runId", "generatedAt", "contracts", "forbiddenWrites", "files", "resultEnvelope"]) {
    if (!(key in input)) issues.push({ path: key, message: `${key} is required.` });
  }
  if (isRecord(input.contracts)) {
    requireLiteral(input, issues, "contracts.brief", BRIEF_VERSION);
    requireLiteral(input, issues, "contracts.capture", "fieldtheory.capture.v1");
  }

  for (const [index, action] of arrayAt(input, "forbiddenWrites", issues).entries()) {
    if (typeof action !== "string" || action.length === 0) {
      issues.push({ path: `forbiddenWrites[${index}]`, message: "Forbidden write must be a non-empty string." });
      continue;
    }
    if (!REMOTE_FORBIDDEN.has(action)) {
      issues.push({ path: `forbiddenWrites[${index}]`, message: `Unknown or unsafe forbidden write marker: ${action}.` });
    }
  }

  const target = typeof input.target === "string" ? input.target : "";
  const runId = typeof input.runId === "string" ? input.runId : "";
  const expectedPrefix = `fieldtheory/exports/${runId}/`;
  for (const [index, file] of arrayAt(input, "files", issues).entries()) {
    if (!isRecord(file)) {
      issues.push({ path: `files[${index}]`, message: "File entry must be an object." });
      continue;
    }
    const relPath = typeof file.relPath === "string" ? file.relPath : "";
    if (!relPath) {
      issues.push({ path: `files[${index}].relPath`, message: "File entry requires relPath." });
      continue;
    }
    validateSafeRelPath(relPath, `files[${index}].relPath`, issues);
    if (target === "aeon" || target === "hermes") {
      if (!runId || !relPath.startsWith(expectedPrefix)) {
        issues.push({ path: `files[${index}].relPath`, message: `File must live under ${expectedPrefix}.` });
      }
    } else if (target === "soul" && relPath.startsWith("fieldtheory/exports/")) {
      issues.push({ path: `files[${index}].relPath`, message: "Soul export files must be standalone, not nested under agent export runs." });
    }
    if (looksSecretLike(JSON.stringify(file))) {
      issues.push({ path: `files[${index}]`, message: "File metadata contains secret-like content." });
    }
  }

  if (looksSecretLike(JSON.stringify(input.inputs ?? {}))) {
    issues.push({ path: "inputs", message: "Inputs contain secret-like content." });
  }
  if (looksSecretLike(JSON.stringify(input.resultEnvelope ?? {}))) {
    issues.push({ path: "resultEnvelope", message: "Result envelope contains secret-like content." });
  }

  return {
    valid: issues.length === 0,
    issues,
    contractVersion: typeof input.version === "string" ? input.version : undefined,
    kind: typeof input.target === "string" ? input.target : undefined,
  };
}

export function summarizeExportManifest(input: unknown): ExportManifestSummary | undefined {
  if (!isRecord(input)) return undefined;
  if (input.version !== EXPORT_VERSION) return undefined;
  if (input.target !== "aeon" && input.target !== "hermes" && input.target !== "soul") return undefined;
  if (typeof input.runId !== "string" || input.runId.length === 0) return undefined;
  if (!Array.isArray(input.files) || !Array.isArray(input.forbiddenWrites)) return undefined;

  const fileRelPaths: string[] = [];
  const fileHashes: string[] = [];
  for (const file of input.files) {
    if (!isRecord(file) || typeof file.relPath !== "string") return undefined;
    fileRelPaths.push(file.relPath);
    if (typeof file.sha256 === "string") fileHashes.push(file.sha256);
  }

  return {
    target: input.target,
    runId: input.runId,
    fileRelPaths,
    fileHashes,
    forbiddenWrites: input.forbiddenWrites.filter((action): action is string => typeof action === "string"),
    resultEnvelope: isRecord(input.resultEnvelope) ? input.resultEnvelope : {},
  };
}

function validateReferences(input: Record<string, unknown>, issues: ValidationIssue[], evidenceIds: Set<string>, key: string): void {
  const items = arrayAt(input, key, issues);
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      issues.push({ path: `${key}[${index}]`, message: `${key} item must be an object.` });
      continue;
    }
    if (item.operatorAuthored === true) continue;
    const refs = item.evidenceIds;
    if (!Array.isArray(refs) || refs.length === 0) {
      issues.push({ path: `${key}[${index}].evidenceIds`, message: "Must cite evidenceIds or set operatorAuthored." });
      continue;
    }
    for (const [refIndex, ref] of refs.entries()) {
      if (typeof ref !== "string" || !evidenceIds.has(ref)) {
        issues.push({ path: `${key}[${index}].evidenceIds[${refIndex}]`, message: `Missing evidence id: ${String(ref)}.` });
      }
    }
  }
}

function validateSafeRelPath(relPath: string, pathLabel: string, issues: ValidationIssue[]): void {
  if (relPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(relPath)) {
    issues.push({ path: pathLabel, message: "Path must be relative." });
  }
  const segments = relPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment === ".git" || segment.startsWith("."))) {
    issues.push({ path: pathLabel, message: "Path contains hidden, dot, traversal, or .git metadata segments." });
  }
}

function requireLiteral(input: Record<string, unknown>, issues: ValidationIssue[], key: string, expected: string): void {
  const value = key.includes(".") ? key.split(".").reduce<unknown>((acc, part) => (isRecord(acc) ? acc[part] : undefined), input) : input[key];
  if (value !== expected) issues.push({ path: key, message: `${key} must be ${expected}.` });
}

function requireOneOf(input: Record<string, unknown>, issues: ValidationIssue[], key: string, values: string[]): void {
  if (!values.includes(String(input[key]))) {
    issues.push({ path: key, message: `${key} must be one of: ${values.join(", ")}.` });
  }
}

function arrayAt(input: Record<string, unknown>, key: string, issues: ValidationIssue[]): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    if (key in input) issues.push({ path: key, message: `${key} must be an array.` });
    return [];
  }
  return value;
}

function looksSecretLike(value: string): boolean {
  return /\b(sk-[a-zA-Z0-9_-]{16,}|xox[baprs]-|ghp_[a-zA-Z0-9_]{20,}|auth_token|ct0|mnemonic|seed phrase|private[_-]?key|bearer [a-zA-Z0-9._-]{16,})\b/i.test(value)
    || hasWalletSeedPhrase(value);
}

function hasWalletSeedPhrase(content: string): boolean {
  const words = [...content.matchAll(/\b[a-z]{3,8}\b/gi)].map((match) => match[0].toLowerCase());
  for (const wordCount of BIP39_WORD_COUNTS) {
    for (let index = 0; index <= words.length - wordCount; index += 1) {
      if (validateMnemonic(words.slice(index, index + wordCount).join(" "), wordlist)) return true;
    }
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

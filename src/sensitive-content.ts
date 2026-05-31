import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export interface SensitiveFinding {
  kind: 'github_token' | 'bearer_token' | 'api_key' | 'auth_token' | 'cookie' | 'private_key' | 'wallet_seed_phrase';
  label: string;
}

type SensitiveKind = SensitiveFinding['kind'];

interface SensitivePattern {
  kind: SensitiveKind;
  label: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SensitivePattern[] = [
  {
    kind: 'github_token',
    label: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{20,}_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    kind: 'bearer_token',
    label: 'Bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/gi,
  },
  {
    kind: 'api_key',
    label: 'API key',
    pattern: /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}["']?/gi,
  },
  {
    kind: 'auth_token',
    label: 'Auth token',
    pattern: /\bauth[_-]?token\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}["']?/gi,
  },
  {
    kind: 'cookie',
    label: 'Cookie header',
    pattern: /\b(?:cookie|set-cookie)\s*:\s*[^\r\n]*(?:auth_token|ct0|session|csrf|token|cookie)[^\r\n]*/gi,
  },
  {
    kind: 'cookie',
    label: 'Cookie value',
    pattern: /\b(?:ct0|auth_token|twid|guest_id|personalization_id|sessionid|csrf(?:_token)?)\s*=\s*["']?[^;\s"']{12,}/gi,
  },
  {
    kind: 'private_key',
    label: 'Private key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
];

const BIP39_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

function uniqueFindings(findings: SensitiveFinding[]): SensitiveFinding[] {
  const seen = new Set<SensitiveKind>();
  return findings.filter((finding) => {
    if (seen.has(finding.kind)) return false;
    seen.add(finding.kind);
    return true;
  });
}

function detectWalletSeedPhrase(content: string): SensitiveFinding | null {
  const words = content.toLowerCase().match(/\b[a-z]{3,8}\b/g) ?? [];
  for (const wordCount of BIP39_WORD_COUNTS) {
    for (let i = 0; i <= words.length - wordCount; i += 1) {
      const phrase = words.slice(i, i + wordCount).join(' ');
      if (validateMnemonic(phrase, wordlist)) {
        return { kind: 'wallet_seed_phrase', label: 'Wallet seed phrase' };
      }
    }
  }
  return null;
}

export function detectSensitiveContent(content: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  for (const { kind, label, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ kind, label });
  }
  const seedPhrase = detectWalletSeedPhrase(content);
  if (seedPhrase) findings.push(seedPhrase);
  return uniqueFindings(findings);
}

export function assertNoSensitiveContent(content: string, context: string): void {
  const findings = detectSensitiveContent(content);
  if (findings.length > 0) {
    throw new Error(`Refusing to capture secret-like content: ${findings.map((finding) => finding.kind).join(', ')} in ${context}`);
  }
}

export function redactSensitiveContent(content: string): { content: string; findings: SensitiveFinding[] } {
  const findings = detectSensitiveContent(content);
  let redacted = content;
  for (const { kind, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, `[REDACTED_${kind.toUpperCase()}]`);
  }
  if (findings.some((finding) => finding.kind === 'wallet_seed_phrase')) {
    redacted = redacted.replace(/\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/gi, '[REDACTED_WALLET_SEED_PHRASE]');
  }
  return { content: redacted, findings };
}

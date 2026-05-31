export interface SensitiveFinding {
  kind: 'github_token' | 'bearer_token' | 'api_key' | 'auth_token' | 'private_key' | 'wallet_seed_phrase';
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
    kind: 'private_key',
    label: 'Private key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
];

const BIP39_WORDS = new Set([
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
]);

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
  for (let i = 0; i <= words.length - 12; i += 1) {
    const phrase = words.slice(i, i + 12);
    if (phrase.every((word) => BIP39_WORDS.has(word))) {
      return { kind: 'wallet_seed_phrase', label: 'Wallet seed phrase' };
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

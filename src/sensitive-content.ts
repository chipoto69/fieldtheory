import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export interface SensitiveFinding {
  kind: 'github_token' | 'bearer_token' | 'api_key' | 'auth_token' | 'cookie' | 'private_key' | 'wallet_seed_phrase';
  label: string;
  text?: string;
  start?: number;
  end?: number;
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

interface WordSpan {
  word: string;
  start: number;
  end: number;
}

function uniqueFindings(findings: SensitiveFinding[]): SensitiveFinding[] {
  const seen = new Set<SensitiveKind>();
  return findings.filter((finding) => {
    if (seen.has(finding.kind)) return false;
    seen.add(finding.kind);
    return true;
  });
}

function detectWalletSeedPhrases(content: string): SensitiveFinding[] {
  const candidates: SensitiveFinding[] = [];
  const words: WordSpan[] = [...content.matchAll(/\b[a-z]{3,8}\b/gi)].map((match) => ({
    word: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  for (const wordCount of BIP39_WORD_COUNTS) {
    for (let i = 0; i <= words.length - wordCount; i += 1) {
      const phraseWords = words.slice(i, i + wordCount);
      const phrase = phraseWords.map((item) => item.word).join(' ');
      if (validateMnemonic(phrase, wordlist)) {
        const start = phraseWords[0].start;
        const end = phraseWords[phraseWords.length - 1].end;
        candidates.push({
          kind: 'wallet_seed_phrase',
          label: 'Wallet seed phrase',
          text: content.slice(start, end),
          start,
          end,
        });
      }
    }
  }
  const ranges: Array<{ start: number; end: number }> = [];
  return candidates
    .sort((left, right) => {
      if ((left.start ?? 0) !== (right.start ?? 0)) return (left.start ?? 0) - (right.start ?? 0);
      return (right.end ?? 0) - (right.start ?? 0) - ((left.end ?? 0) - (left.start ?? 0));
    })
    .filter((finding) => {
      const start = finding.start ?? 0;
      const end = finding.end ?? 0;
      if (ranges.some((range) => start < range.end && end > range.start)) return false;
      ranges.push({ start, end });
      return true;
    });
}

export function detectSensitiveContent(content: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  for (const { kind, label, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ kind, label });
  }
  findings.push(...detectWalletSeedPhrases(content));
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
  if (findings.some((finding) => finding.kind === 'wallet_seed_phrase')) {
    const ranges = detectWalletSeedPhrases(content)
      .sort((left, right) => (right.start ?? 0) - (left.start ?? 0));
    for (const finding of ranges) {
      redacted = `${redacted.slice(0, finding.start)}[REDACTED_WALLET_SEED_PHRASE]${redacted.slice(finding.end)}`;
    }
  }
  for (const { kind, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, `[REDACTED_${kind.toUpperCase()}]`);
  }
  return { content: redacted, findings };
}

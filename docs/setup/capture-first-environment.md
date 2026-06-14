---
title: Capture-First Environment Setup
created: 2026-05-31
status: draft-build-runbook
scope: local development and validation
tags: [setup, environment, fieldtheory, agents]
---

# Capture-First Environment Setup

## Runtime Requirements

| Requirement | Expected |
|---|---|
| Node.js | `>=20` |
| npm | lockfile v3 compatible |
| OS | macOS for clipboard `pbpaste`; stdin fallback for every platform |
| GitHub CLI | Required later for Gordo/Aeon integration, not for Milestone 1 capture |
| Vercel CLI | Deferred until hosted suite milestone |

Current repo scripts:

```bash
npm run build
npm test
npm run --silent dev -- --help
```

## Local Stores

Default production paths:

| Store | Path | Role |
|---|---|---|
| Bookmark cache/index | `~/.fieldtheory/bookmarks/` | X bookmark JSONL, SQLite FTS5, media cache. |
| Library | `~/.fieldtheory/library/` | Human-readable markdown knowledge. |
| Captures | `~/.fieldtheory/library/Captures/` | Clipboard and manual capture staging. |
| Commands | `~/.fieldtheory/library/Commands/` | Portable operator procedures. |
| Ideas | `~/.fieldtheory/ideas/` | Seeds, Possible runs, adjacent artifacts. |

Use isolated paths for tests and smoke runs:

```bash
export FT_DATA_DIR="$(mktemp -d)"
export FT_LIBRARY_DIR="$(mktemp -d)"
export FT_COMMANDS_DIR="$FT_LIBRARY_DIR/Commands"
```

## Environment Variables

Copy `.env.example` only when local overrides are needed.

| Variable | Milestone | Purpose |
|---|---|---|
| `FT_DATA_DIR` | 1 | Override bookmark/index root for tests or temporary runs. |
| `FT_LIBRARY_DIR` | 1 | Override Library root. |
| `FT_COMMANDS_DIR` | 1 | Override Commands root. |
| `FT_CLI_BIN` | 1 | Raycast/wrapper binary path. |
| `FT_ENGINE_AUTH_MODE` | 1 | Explicit model auth mode; default remains CLI session based. |
| `X_API_*`, `X_CLIENT_*`, `X_BEARER_TOKEN` | existing | Optional OAuth API sync. Browser-session sync does not need these. |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | 2 | Hosted wallet/GitHub auth. |
| `DATABASE_URL` | 2 | Hosted metadata store. |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | 2 | Hosted GitHub login/linking. |
| `GORDO_TEMPLATE_REPO` | 2 | Template fork for Aeon/Gordo agent repos. |

## Local Development Flow

1. Install dependencies:

```bash
npm install
```

2. Verify the existing CLI:

```bash
npm run build
HOME="$(mktemp -d)" npm test
```

3. Sync and index bookmarks when using real local data:

```bash
ft sync --folders
ft classify
```

4. Use isolated paths for feature work:

```bash
export FT_DATA_DIR="$(mktemp -d)"
export FT_LIBRARY_DIR="$(mktemp -d)"
export FT_COMMANDS_DIR="$FT_LIBRARY_DIR/Commands"
```

5. Seed local smoke data with existing commands before new agentic commands:

```bash
printf 'Recall packs help agents recover context.\n' | ft library create notes/agent-memory --stdin
printf '# agent-recall\n\nUse this when building recall packs.\n\n## Steps\n\n1. Run recall.\n\n## Guardrails\n\n- Verify.\n' | ft commands new agent-recall --stdin
```

Before the new commands are installed globally, prefer branch-local smoke
commands through `npm run --silent dev -- ...` so validation uses the current checkout.

## Security Rules

- Do not commit `.env`, browser cookies, X cookies, OAuth tokens, Privy secrets,
  wallet keys, GitHub tokens, Vercel tokens, or Anthropic/OpenAI keys.
- Do not write capture output into `~/wiki` directly.
- Do not write to GBrain, Honcho, Hermes, or Gordo from Milestone 1 commands.
- Do not let agent exports create repositories, set GitHub secrets, or dispatch
  workflows until the hosted control-plane milestone.
- Treat bookmark text and clipboard captures as untrusted input when building
  model prompts.
- Clipboard captures persist raw clipboard text under
  `~/.fieldtheory/library/Captures/` only after sensitive-content preflight
  passes; do not capture secrets, keys, cookies, or wallet material.
- Soul and export commands must refuse or redact secret-like source material and
  must record any redaction in the result envelope or manifest.

## Validation Matrix

| Validation | Command |
|---|---|
| Type/build | `npm run build` |
| Full unit tests | `HOME="$(mktemp -d)" npm test` |
| Whitespace | `git diff --check` |
| Package smoke | `npm run release:check` |
| Raycast smoke | `npm --prefix raycast/fieldtheory run lint && npm --prefix raycast/fieldtheory run build` |
| Capture smoke | `printf 'agent note' | npm run --silent dev -- capture text --stdin --type note --json` |
| Recall smoke | `npm run --silent dev -- recall agent --json` |
| Packet smoke | `npm run --silent dev -- packet bookmark bm_test --target aeon --json` |
| Soul smoke | `npm run --silent dev -- soul draft --from bookmarks,library,clipboard --out "$tmp/soul" --json` |
| Export smoke | `npm run --silent dev -- export aeon --repo "$tmp/aeon-repo" --query agent --bookmark bm_test --soul --briefs --json` |

## Reproducible Milestone 1 Smoke

Run this from the repo checkout before handing work to hosted/Vercel agents. It
uses branch-local `npm run --silent dev --` commands and writes all outputs under one
temporary directory.

```bash
tmp="$(mktemp -d)"
export HOME="$tmp/home"
export FT_DATA_DIR="$tmp/data"
export FT_LIBRARY_DIR="$tmp/library"
export FT_COMMANDS_DIR="$FT_LIBRARY_DIR/Commands"
mkdir -p "$HOME" "$FT_DATA_DIR" "$FT_COMMANDS_DIR"

printf 'agent note\n' | npm run --silent dev -- capture text --stdin --type soul --json > "$tmp/capture.json"

cat > "$FT_DATA_DIR/bookmarks.jsonl" <<'JSONL'
{"id":"bm_test","tweetId":"1","url":"https://x.com/test/status/1","text":"Agent packet smoke fixture for Field Theory recall and export.","authorHandle":"test","syncedAt":"2026-05-31T00:00:00Z","postedAt":"2026-05-31T00:00:00Z","links":[],"tags":[],"mediaObjects":[],"ingestedVia":"graphql"}
JSONL

npm run --silent dev -- index --force > "$tmp/index.txt"
npm run --silent dev -- recall agent --json > "$tmp/recall.json"
npm run --silent dev -- packet bookmark bm_test --target aeon --json > "$tmp/packet-aeon.json"
npm run --silent dev -- packet bookmark bm_test --target hermes --md > "$tmp/packet-hermes.md"
npm run --silent dev -- packet bookmark bm_test --target content-os --json > "$tmp/packet-content-os.json"
npm run --silent dev -- soul draft --from bookmarks,library,clipboard --out "$tmp/soul" --json > "$tmp/soul-draft.json"
npm run --silent dev -- export aeon --repo "$tmp/aeon-repo" --query agent --bookmark bm_test --soul --briefs --json > "$tmp/export-aeon.json"
npm run --silent dev -- export hermes --out "$tmp/hermes-export" --query agent --bookmark bm_test --briefs --json > "$tmp/export-hermes.json"
npm run --silent dev -- export soul --out "$tmp/soul-export" --json > "$tmp/export-soul.json"

node -e '
const fs = require("fs");
const root = process.argv[1];
for (const name of ["capture","recall","packet-aeon","packet-content-os","soul-draft","export-aeon","export-hermes","export-soul"]) JSON.parse(fs.readFileSync(`${root}/${name}.json`, "utf8"));
const aeon = JSON.parse(fs.readFileSync(`${root}/export-aeon.json`, "utf8"));
const hermes = JSON.parse(fs.readFileSync(`${root}/export-hermes.json`, "utf8"));
if (aeon.manifest.version !== "fieldtheory.agent-export.v1") throw new Error("bad aeon manifest");
if (hermes.manifest.target !== "hermes") throw new Error("bad hermes target");
console.log(JSON.stringify({ smoke: "ok", outputRoot: root }, null, 2));
' "$tmp"
```

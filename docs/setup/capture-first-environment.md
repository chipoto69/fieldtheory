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
npm run dev -- --help
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
ft library create notes/agent-memory --stdin
ft commands new agent-recall --stdin
```

Before the new commands are installed globally, prefer branch-local smoke
commands through `npm run dev -- ...` so validation uses the current checkout.

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
  `~/.fieldtheory/library/Captures/`; do not capture secrets, keys, cookies, or
  wallet material.

## Validation Matrix

| Validation | Command |
|---|---|
| Type/build | `npm run build` |
| Full unit tests | `HOME="$(mktemp -d)" npm test` |
| Whitespace | `git diff --check` |
| Package smoke | `npm pack --dry-run && node bin/ft.mjs --help` after build |
| Capture smoke | `printf 'agent note' | npm run dev -- capture text --stdin --type note --json` |
| Recall smoke | `npm run dev -- recall agent --json` |
| Packet smoke | `npm run dev -- packet bookmark <id> --target aeon --json` |
| Soul smoke | `npm run dev -- soul draft --from bookmarks,library,clipboard --out /tmp/ft-soul` |
| Export smoke | `npm run dev -- export aeon --repo /tmp/gordo --soul --briefs --json` |

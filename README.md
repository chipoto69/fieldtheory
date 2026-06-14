# Field Theory CLI

Sync and store locally all of your X/Twitter bookmarks. Search, classify, and make them available to Claude Code, Codex, or any agent with shell access.

Free and open source. Designed for Mac.

## Install

```bash
npm install -g fieldtheory
```

Requires Node.js 20+. A Chrome-family browser or Firefox is recommended for session sync; OAuth is available for all platforms.

## Quick start

```bash
# 1. Sync your bookmarks (needs a supported browser logged into X)
ft sync

# 2. Search them
ft search "distributed systems"

# 3. Explore
ft viz
ft categories
ft stats
```

On first run, `ft sync` extracts your X session from your browser and downloads your bookmarks into `~/.fieldtheory/bookmarks/`.

## Commands

### Sync

| Command | Description |
|---------|-------------|
| `ft sync` | Download and sync bookmarks, then fetch any missing media (photos, video posters, capped videos). No API required. |
| `ft sync --no-media` | Sync bookmarks only; skip the media download pass |
| `ft sync --skip-profile-images` | Sync bookmarks and post media but skip author profile images |
| `ft sync --rebuild` | Full re-crawl of all bookmarks |
| `ft sync --continue` | Resume a paused or interrupted sync from the saved cursor |
| `ft sync --gaps` | Backfill quoted tweets, expand truncated/X Article text, enrich linked articles, and fill any media gaps |
| `ft sync --folders` | Also sync X bookmark folder tags (read-only mirror of X state) |
| `ft sync --folder <name>` | Sync a single folder by name (exact or unambiguous prefix) |
| `ft sync --classify` | Sync then classify new bookmarks with LLM |
| `ft sync --api` | Sync via OAuth API (cross-platform) |
| `ft auth` | Set up OAuth for API-based sync (optional) |

### Search and browse

| Command | Description |
|---------|-------------|
| `ft search <query>` | Full-text search with BM25 ranking |
| `ft list` | Filter by author, date, category, domain, or folder |
| `ft list --folder <name>` | Show bookmarks in an X bookmark folder |
| `ft show <id>` | Show one bookmark in detail |
| `ft sample <category>` | Random sample from a category |
| `ft stats` | Top authors, languages, date range |
| `ft viz` | Terminal dashboard with sparklines, categories, and domains |
| `ft categories` | Show category distribution |
| `ft domains` | Subject domain distribution |
| `ft folders` | Show X bookmark folder distribution (requires `ft sync --folders` first) |

### Classification

| Command | Description |
|---------|-------------|
| `ft classify` | Classify by category and domain using LLM |
| `ft classify --regex` | Classify by category using simple regex |
| `ft classify-domains` | Classify by subject domain only (LLM) |
| `ft classify --engine <name>` | Override the LLM engine for one run (also works on `ft sync --classify` and `ft classify-domains`) |
| `ft model` | View or change the default LLM engine |

### Knowledge base

| Command | Description |
|---------|-------------|
| `ft md` | Export bookmarks as individual markdown files, including enriched article text |
| `ft md --changed` | Re-export only markdown files whose source bookmark data changed |
| `ft wiki` | Compile a Karpathy-style interlinked knowledge base |
| `ft ask <question>` | Ask questions against the knowledge base |
| `ft ask <question> --save` | Ask and save the answer as a concept page |
| `ft lint` | Health-check the wiki for broken links and missing pages |
| `ft lint --fix` | Auto-fix fixable wiki issues |

### Possibility runs

| Command | Description |
|---------|-------------|
| `ft seeds search "<query>" --create` | Save a bookmark-grounded seed |
| `ft repos add <path>` | Add a repo to the default repo set |
| `ft possible` | Interactive seed + repo + frame wizard |
| `ft possible run --defaults` | Re-run with the most-recently-used seed and saved repos |
| `ft possible run --background` | Start a run as a background job |
| `ft possible prompt <node-id>` | Print the goal prompt for one plotted node |
| `ft possible nightly install` | Install a nightly Possible run on macOS |

### Field Theory app companion

| Command | Description |
|---------|-------------|
| `ft paths --json` | Show canonical bookmarks, Library, Commands, and compatibility paths |
| `ft status --json` | Show bookmark/classification status plus Field Theory paths |
| `ft library search <query>` | Search local Field Theory Library markdown |
| `ft library show <path>` | Print a Library page and its version metadata with `--json` |
| `ft library create <path> --stdin` | Create a new Library page under `~/.fieldtheory/library` |
| `ft library update <path> --stdin --expected-sha256 <hash>` | Replace a Library page with conflict protection |
| `ft library delete <path>` | Move a Library page to Trash; the Mac app owns remote sync tombstones |
| `ft library open <path>` | Open a Library page in the Field Theory Mac app |
| `ft commands list` | List portable commands under `~/.fieldtheory/library/Commands` |
| `ft commands new <name>` | Create a reusable portable command |
| `ft commands validate [name]` | Check command shape and guardrails |
| `ft install app` | Download and install the latest Field Theory Mac app from `afar1/field-releases` |

`ft library open` targets the packaged Field Theory app by bundle id (`com.fieldtheory.app`) instead of trusting the system-wide `fieldtheory://` handler. That avoids accidentally opening a generic Electron development app when another checkout registered the same URL scheme.

For local Field Theory app development, point the CLI at the dev checkout:

```bash
export FT_APP_DEV_DIR=/Users/you/dev/fieldtheory/mac-app
ft library open notes/example.md
```

Packaged variants can override the bundle id with `FT_APP_BUNDLE_ID`. Advanced development launchers can set `FT_APP_OPEN_COMMAND` to an executable that receives the deep-link URL as its first argument.

### Agent integration

| Command | Description |
|---------|-------------|
| `ft skill install` | Install `/fieldtheory` skill for Claude Code and Codex |
| `ft skill show` | Print skill content to stdout |
| `ft skill uninstall` | Remove installed skill files |

### Operator suite

| Command | Description |
|---------|-------------|
| `ft suite status --json` | Show the AI operator suite manifest: CLI, docs, Raycast, skill, and MCP/plugin boundaries |
| `ft suite architecture` | Print visual architecture documentation for MCP, skills, plugins, Raycast, and CLI planes |
| `ft suite workflows` | Print agent/operator workflow gates and recommended command sequences |
| `ft suite raycast manifest --json` | Show the Raycast extension manifest that wraps the CLI |
| `ft suite raycast scaffold --out ./raycast/fieldtheory --force` | Regenerate the Raycast extension source from the CLI templates |

### Utilities

| Command | Description |
|---------|-------------|
| `ft index` | Rebuild search index from JSONL cache (preserves classifications) |
| `ft fetch-media` | Backfill/download X media assets for existing bookmarks (default: all pending bookmarks) |
| `ft fetch-media --skip-profile-images` | Download post media without author profile images |
| `ft status` | Show sync/classification status and data location |
| `ft path` | Print data directory path |

## Agent integration

Install the `/fieldtheory` skill so your agent automatically searches your bookmarks when relevant:

```bash
ft skill install     # Auto-detects Claude Code and Codex
```

Then ask your agent:

> "What have I bookmarked about cancer research in the last three years and how has it progressed?"

> "I bookmarked a number of new open source AI memory tools. Pick the best one and figure out how to incorporate it in this repo."

> "Your goal is to look at AI agent bookmarks and come up with a roadmap plotted in the grid of what I should do next across the Field Theory CLI and Mac app projects."

> "Every day please sync any new X bookmarks using the Field Theory CLI."

Works with Claude Code, Codex, or any agent with shell access.

## AI operator suite

Field Theory now ships a small operator suite for agents and humans who want one
local-first control plane instead of separate tool surfaces.

- **CLI backend**: `ft suite status --json` is the stable manifest for operator
  surfaces and future MCP wrappers.
- **Visual docs**: `docs/architecture/operator-suite.md` maps MCP, skills,
  plugins, model routing, product surfaces, stores, and write authority with
  Mermaid diagrams.
- **Workflows**: `docs/workflows/operator-suite.md` documents read-only recall,
  reusable command packaging, skill install, Raycast operation, and canon
  promotion gates.
- **Browser console**: open `apps/operator-suite/index.html` for a dependency-free
  visual console.
- **Raycast extension**: `raycast/fieldtheory` wraps the local `ft` binary for
  bookmark search, suite status, and curated read-only health commands.
- **Capture-first PRD**: `docs/prd/capture-first-agentic-suite.md` defines the
  local-first build order for clipboard/manual capture, recall packs, source
  packets, soul drafts, and Aeon/Hermes export bundles.
- **Capture-first CLI**: `ft capture`, `ft recall`, `ft packet bookmark`,
  `ft soul draft`, and `ft export aeon|hermes|soul` now provide the local
  contracts that hosted agents must consume.
- **Environment runbook**: `docs/setup/capture-first-environment.md` lists local
  stores, safe environment variables, validation commands, and deferred hosted
  secrets.
- **Agentic architecture**: `docs/architecture/capture-first-agentic-suite.md`
  maps the capture-to-learning loop and the boundary before Vercel/Gordo/x402.
- **Hosted handoff**: `docs/handoff/hosted-suite-milestone-2.md` is the gate for
  later Vercel, Privy, Gordo/Aeon, Hermes, and x402 work after local contracts
  pass.
- **Hosted suite PRD**: `docs/prd/hosted-agentic-suite.md` defines the Vercel
  portal, Privy GitHub/Base/Solana auth scaffold, agent run APIs, deployment
  gates, and x402 handoff boundaries.
- **Hosted architecture/runbook**: `docs/architecture/hosted-agentic-suite.md`
  and `docs/setup/hosted-suite-environment.md` map endpoints, data flows,
  deployment secrets, and production gates before implementation starts.
- **Hosted implementation contracts**: `docs/api/hosted-suite-endpoints.md`,
  `docs/data/hosted-suite-data-model.md`,
  `docs/security/hosted-suite-threat-model.md`,
  `docs/deploy/vercel-github-actions.md`, and
  `docs/release/milestone-2-hosted-readiness.md` are the required M2 gates.
- **Hosted portal scaffold**: `apps/portal` is the initial Next.js App Router
  control plane with dry-run validation, agent-plan APIs, and
  `DATABASE_URL`-backed Postgres persistence for hosted import/run/audit
  metadata. Run `npm run verify:hosted`; run
  `npm --prefix apps/portal run db:migrate` before production traffic.
- **Hosted deploy readiness auditor**: `npm run hosted:check-readiness -- --remote --strict`
  checks local release artifacts, package scripts, Vercel project metadata,
  GitHub production environment policy, required secret names, and
  `X402_ENABLED=false` without printing secret values. Production readiness also
  requires explicit linked GitHub/Base/Solana policy variables:
  `FIELD_THEORY_REQUIRE_LINKED_IDENTITIES=true`, Base mainnet `8453`, and Solana
  `mainnet-beta` with matching public mirrors.
- **Next feature plan**: `docs/features/agent-brief-packs.md` specifies the
  proposed recall/source-packet/dispatch bridge from bookmarks to agent work.

What is shipped now:

- The M1 CLI/Raycast layer is the shippable local product surface: capture,
  recall, packets, soul drafts, and dry-run Aeon/Hermes export bundles.
- The M2 hosted portal is a validated control-plane scaffold with server-side
  auth checks, browser Privy login controls, an example-backed operator
  workbench with live readiness/identity status, recent run history, selected
  run detail, dry-run agent APIs, health/contracts/x402 discovery routes,
  Postgres metadata persistence, and protected Vercel production workflow gates.
- The hosted portal is not production-live until the Vercel project, production
  environment secrets, server-side linked GitHub/Base/Solana identity policy,
  target database migration proof, and post-deploy smoke evidence are recorded.
- Apply gates, GitHub writeback, Hermes writeback, and x402 enforcement remain
  out of scope until their handoff documents pass review.

Hosted environment bootstrap:

```bash
npm run hosted:setup-github-env -- --repo chipoto69/fieldtheory --apply --allow-missing-secrets --protect-main
npm run hosted:check-readiness -- --remote --strict
```

This creates or verifies the GitHub `production` environment, the `main`
deployment branch policy, `main` branch protection requiring the `preview`
check, and `X402_ENABLED=false`; it reports missing secrets and linked-identity
policy variables without storing secret values.

Raycast development:

```bash
ft suite raycast scaffold --out ./raycast/fieldtheory --force
cd raycast/fieldtheory
npm install
npm run dev
```

Future MCP work should wrap existing CLI JSON commands first. Do not give MCP,
Raycast, or plugins independent write access to `bookmarks.db`, Library
markdown, or portable command files.

## Scheduling

Sync with cron:

```bash
# Sync every morning at 7am
0 7 * * * ft sync

# Sync and classify every morning
0 7 * * * ft sync --classify
```

Run Possible every night on macOS with LaunchAgent:

```bash
ft seeds search "agents" --days 90 --limit 8 --frame leverage-specificity --create
ft repos add ~/dev/fieldtheory
ft repos add ~/dev/fieldtheory-cli

ft possible nightly install --time 02:00 --defaults --model opus --effort medium --nodes 5
ft possible nightly show
```

Nightly schedules are stored under `~/.fieldtheory/ideas/nightly/`. Each tick starts a normal background job under `~/.fieldtheory/ideas/jobs/`, using your local logged-in CLI sessions and the current `PATH` captured in the LaunchAgent plist.

`ft` respects standard proxy environment variables for network requests: `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, and `NO_PROXY`.

## Data

Data is stored locally under `~/.fieldtheory/`:

```
~/.fieldtheory/bookmarks/
  bookmarks.jsonl         # raw bookmark cache (one per line)
  bookmarks.db            # SQLite FTS5 search index
  bookmarks-meta.json     # sync metadata
  oauth-token.json        # OAuth token (if using API mode, chmod 600)

~/.fieldtheory/library/
  index.md                # markdown knowledge base (ft wiki / ft md)
  Captures/               # clipboard/manual capture staging

~/.fieldtheory/library/Commands/
  *.md                    # portable commands used by Field Theory and agents

~/.fieldtheory/ideas/
  seeds/runs/nodes/       # Possible seeds, runs, and node prompt artifacts
  batches/jobs/nightly/   # Multi-repo batches, background jobs, and schedules
```

Override locations with `FT_DATA_DIR`, `FT_LIBRARY_DIR`, and `FT_COMMANDS_DIR`:

```bash
export FT_DATA_DIR=/path/to/custom/dir
export FT_LIBRARY_DIR=/path/to/custom/library
export FT_COMMANDS_DIR=/path/to/custom/commands
```

To remove bookmark and Library data: `rm -rf ~/.fieldtheory/bookmarks ~/.fieldtheory/library`

## Categories

| Category | What it catches |
|----------|----------------|
| **tool** | GitHub repos, CLI tools, npm packages, open-source projects |
| **security** | CVEs, vulnerabilities, exploits, supply chain |
| **technique** | Tutorials, demos, code patterns, "how I built X" |
| **launch** | Product launches, announcements, "just shipped" |
| **research** | ArXiv papers, studies, academic findings |
| **opinion** | Takes, analysis, commentary, threads |
| **commerce** | Products, shopping, physical goods |

Use `ft classify` for LLM-powered classification that catches what regex misses.

## Windows Notes

In PowerShell, use `fieldtheory` or `ft.cmd` instead of `ft` because `ft` is already a built-in alias for `Format-Table`.

If browser session sync cannot find the right profile, pass the browser and profile explicitly:

```powershell
fieldtheory sync --browser chrome --chrome-profile-directory "Default"
fieldtheory sync --browser edge --chrome-profile-directory "Default"
```

For Firefox, if profile detection misses the profile, pass the profile directory explicitly with `--firefox-profile-dir`.

If cookie extraction still fails, close the browser completely and retry. As a last resort, pass cookies manually:

```powershell
fieldtheory sync --cookies <ct0> <auth_token>
```

Treat `ct0` and `auth_token` like passwords. Do not paste them into logs, issues, or chat.

## Platform support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Session sync (`ft sync`) | Chrome, Chromium, Brave, Edge, Helium, Comet, Dia, Firefox | Chrome, Chromium, Brave, Edge, Firefox | Chrome, Chromium, Brave, Edge, Firefox |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, classify, viz, wiki | Yes | Yes | Yes |

Session sync extracts cookies from your browser's local database. Use `ft sync --browser <name>` to pick a browser. On Windows, Firefox requires Node.js 22.5+ or `sqlite3` on PATH. For unsupported browsers or platforms, use `ft auth` + `ft sync --api`.

## Security

**CLI mode keeps your data local.** No telemetry, no analytics, nothing phoned home. The CLI only makes network requests to X's API during sync.

**Hosted mode is separate.** The `apps/portal` scaffold validates uploaded Field Theory briefs/exports and writes hosted audit/run metadata only after Privy server auth and `DATABASE_URL` are configured. Production ignores the memory-store override, requires the Postgres schema marker from `db:migrate`, and does not read local CLI stores directly.

**Chrome session sync** reads cookies from Chrome's local database, uses them for the sync request, and discards them. Cookies are never stored separately.

**OAuth tokens** are stored with `chmod 600` (owner-only). Treat `~/.fieldtheory/bookmarks/oauth-token.json` like a password.

**The default sync uses X's internal GraphQL API**, the same API that x.com uses in your browser. For the official v2 API, use `ft auth` + `ft sync --api`.

## License

MIT — [fieldtheory.dev/cli](https://fieldtheory.dev/cli)

## Star History

<a href="https://www.star-history.com/?repos=afar1%2Ffieldtheory-cli&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&legend=top-left" />
 </picture>
</a>

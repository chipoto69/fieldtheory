---
title: Field Theory Capture-First Agentic Suite PRD
created: 2026-05-31
status: draft-build-contract
scope: local-first milestone before hosted Vercel suite
tags: [prd, fieldtheory, capture, agents, aeon, hermes]
---

# Field Theory Capture-First Agentic Suite PRD

## Working Decision

Field Theory must become the local learning substrate before any hosted agent
factory is built. The first milestone ships capture, recall, packet, soul, and
export contracts in the CLI. Vercel, Privy, Gordo/Aeon control-plane UI, Hermes
control surfaces, and x402 payment gating wait until those contracts are real.

Verified facts:

| Fact | Evidence |
|---|---|
| Field Theory already syncs, indexes, searches, classifies, and exports X bookmarks. | `src/cli.ts`, `src/bookmarks-db.ts`, `src/md-export.ts` |
| Library and Commands are local markdown stores with path guards. | `src/library.ts`, `src/commands-files.ts` |
| The operator suite, Raycast wrapper, and Agent Brief Pack design are already documented. | `docs/architecture/operator-suite.md`, `docs/features/agent-brief-packs.md` |
| Aeon/Gordo expects GitHub Actions, skills, `aeon.yml`, memory files, and optional `soul/` files. | `chipoto69/Gordo` fork inspected via GitHub CLI |
| `soul.md` expects `SOUL.md`, `STYLE.md`, `MEMORY.md`, source `data/`, and calibration examples. | `aaronjmars/soul.md` README/SKILL |

Assumptions:

| Assumption | Default | Why |
|---|---|---|
| Clipboard support starts on macOS. | Use `pbpaste`; stdin remains portable fallback. | Current operator environment is macOS. |
| Agent exports are local files only in v1. | No direct GitHub, Hermes, GBrain, wiki, or Vercel writes. | Avoid hidden authority and secret leakage. |
| Soul draft output is a bootstrap artifact. | It is editable, not a claim of final identity. | Agent identity needs human review. |
| Recall can work without an LLM. | Use deterministic search, source locators, and bounded summaries. | Fast first loop, fewer auth blockers. |

## Product Promise

Turn saved attention and clipboard captures into agent-ready context packs that
Aeon/Gordo, Hermes, Raycast, MCP wrappers, and future Vercel surfaces can use
without bypassing Field Theory's local truth boundary.

Primary users:

| User | Job |
|---|---|
| Solo operator | Capture useful X/bookmark/clipboard signal and reuse it later without re-explaining context. |
| Coding agent | Ask Field Theory for bounded, cited context before planning or editing. |
| Aeon/Gordo agent | Consume `soul/` and brief bundles as repo-local context. |
| Hermes profile | Consume Field Theory briefs as explicit, reviewable handoff packets. |

## Scope

Milestone 1 ships:

| Capability | CLI shape | Authority |
|---|---|---|
| Clipboard capture | `ft capture clipboard --type note\|source\|idea\|soul` | Writes local Library capture markdown. |
| Text/stdin capture | `ft capture text --stdin --type note\|source\|idea\|soul` | Writes local Library capture markdown. |
| Recall pack | `ft recall <query> --json\|--md` | Reads Library, Captures, Commands, bookmarks. |
| Bookmark packet | `ft packet bookmark <id> --target aeon\|hermes\|content-os --json\|--md` | Reads one bookmark and emits dry-run packet. |
| Soul draft | `ft soul draft --from bookmarks,library,clipboard --out soul/` | Writes local output directory only. |
| Agent exports | `ft export aeon\|hermes\|soul ...` | Writes local export bundles only. |

Milestone 1 does not ship:

- hosted Vercel app
- Privy login or wallet gating
- GitHub OAuth app flows
- live Gordo repository creation
- live Hermes Kanban writes
- x402 payment enforcement
- direct GBrain/wiki canon writes
- automatic long-term memory mutation

## Capture Contract

Captures are markdown files under `~/.fieldtheory/library/Captures/`.

```yaml
version: fieldtheory.capture.v1
id: cap_20260531_120000_slug
type: note | source | idea | soul
source: clipboard | text
captured_at: 2026-05-31T12:00:00.000Z
promotion_status: captured
tags: [agent, aeon]
source_locator: stdin | macos-pbpaste | <explicit-source>
content_sha256:
```

The markdown body preserves the raw operator text. Field Theory may add
frontmatter and a title, but it must not rewrite the capture into a polished
claim at capture time.

Capture frontmatter is flat YAML. Nested `capture:` frontmatter is invalid for
v1. Capture IDs and filenames share the same collision suffix so two same-second
captures with identical text cannot collide.

## Agent Brief Pack Contract

`AgentBriefPack` is the shared object that connects captures, bookmarks,
Library notes, Commands, and future Possible dispatch.

```ts
interface AgentBriefPack {
  id: string;
  version: "agent-brief-pack.v1";
  kind: "recall_pack" | "source_packet" | "dispatch_brief";
  generatedAt: string;
  input: PackInput;
  limits: PackLimits;
  storeStatus: StoreStatusEntry[];
  query?: string;
  sourceBookmarkId?: string;
  sourceNodeId?: string;
  summary: string;
  summaryClaims: SummaryClaim[];
  evidence: EvidenceItem[];
  typedSlots: TypedSlot[];
  suggestedCommands: SuggestedCommand[];
  sourcePacket?: SourcePacket;
  boundaries: BoundaryNote[];
  promotionCandidates: PromotionCandidate[];
  resultEnvelope: ResultEnvelope;
}
```

The canonical field-level TypeScript shape is locked in
`docs/superpowers/plans/2026-05-31-fieldtheory-capture-first-agentic-suite.md`.

Required invariant: every non-empty `summaryClaims`, `typedSlot`, suggested
action, or promotion candidate must trace back to at least one `evidence` item
or mark itself as operator-authored. `summary` is a display rollup, not an
uncited claim surface.

For `source_packet` packs, `boundaries` is required. `SourcePacket.forbiddenActions`
is authoritative; target payloads must not duplicate a nested
`forbiddenActions` key.

## Acceptance Criteria

| Area | Criteria |
|---|---|
| Capture | Reject empty capture text, unsafe paths, unsupported capture types, high-confidence secret-like content, invalid/nested frontmatter, and writes outside Library/Captures. |
| Clipboard | Use `pbpaste` on macOS; produce a clear error when clipboard read fails; stdin path remains available. |
| Recall | Works when bookmarks DB is missing, Library is empty, or Commands are absent; output remains valid partial JSON with `storeStatus`. |
| Packets | `ft packet bookmark` fails clearly for unknown bookmark IDs and never writes to target systems in v1; every target has required boundaries and top-level forbidden actions. |
| Soul draft | Produces `SOUL.md`, `STYLE.md`, `MEMORY.md`, `examples/good-outputs.md`, and `data/source-index.json` in the requested output root; identity material in `SOUL.md` comes from valid `type: soul` captures, while stored clipboard captures can inform `STYLE.md`, `MEMORY.md`, examples, and the source index. |
| Exports | Aeon/Hermes/soul exports write files only under the operator-specified path and do not create `.git`, root `aeon.yml`, `.github/workflows`, secrets, or remote calls; existing Git repos require an explicit `--allow-existing-repo` gate. |
| Output safety | Soul/export reject symlinked roots, symlink child escapes, `../` escapes, sibling-prefix escapes, and overwrites without `--force`. |
| Docs | README, operator workflow docs, PRD, environment docs, and architecture docs agree on scope and commands. |

## Release Gates

| Gate | Command |
|---|---|
| TypeScript build | `npm run build` |
| Unit tests | `HOME=$(mktemp -d) npm test` |
| Diff hygiene | `git diff --check` |
| CLI smoke | isolated `FT_DATA_DIR` and `FT_LIBRARY_DIR` command run for capture, recall, packet, soul draft, and exports |
| Release smoke | `npm run release:check` |
| Version smoke | `package.json` and `package-lock.json` both carry the same `1.7.0` version before release. |
| Raycast smoke | Checked-in Raycast extension and scaffold output agree; Raycast lint/build pass when Raycast tooling is available. |

## Deferred Milestone 2

After Milestone 1 passes, build the Vercel product shell around the local
contracts:

- Next.js app
- Privy GitHub + wallet auth
- Gordo/Aeon repository control plane
- Hermes export/import workflow
- x402 architecture handoff and later payment enforcement

Milestone 1 must leave behind `docs/handoff/hosted-suite-milestone-2.md` before
hosted work begins. That handoff must include the contract versions, one sample
`AgentBriefPack`, one sample export manifest, forbidden writes, Privy
GitHub/Base/Solana assumptions, and the statement that x402 remains
architecture-only until a later enforcement gate.

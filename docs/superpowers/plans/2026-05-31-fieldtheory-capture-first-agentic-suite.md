# Field Theory Capture-First Agentic Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local capture, recall, packet, soul, and export contracts that let Field Theory feed Aeon/Gordo and Hermes before any hosted Vercel product work.

**Architecture:** Field Theory remains the local source of truth. New modules write only to guarded local Library/export paths, emit typed JSON/Markdown contracts, and leave all remote systems as dry-run consumers until Milestone 2.

**Tech Stack:** TypeScript ESM, Commander.js, Node test runner, local markdown stores, SQLite bookmark index, macOS `pbpaste` with stdin fallback.

---

## Files

Create:

- `src/agent-brief-pack.ts`
- `src/capture.ts`
- `src/recall.ts`
- `src/packet.ts`
- `src/soul-draft.ts`
- `src/agent-export.ts`
- `tests/agentic-suite.test.ts`

Modify:

- `src/cli.ts`
- `src/skill.ts`
- `src/operator-suite.ts`
- `README.md`
- `docs/workflows/operator-suite.md`
- `docs/features/agent-brief-packs.md`
- `raycast/fieldtheory/src/run-command.tsx`

## Task 1: Capture Substrate

**Files:**

- Create: `src/capture.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] Write failing tests for `captureText()` and `captureClipboard()` using isolated `FT_LIBRARY_DIR`.
- [ ] Verify red state with `npm test -- tests/agentic-suite.test.ts`.
- [ ] Implement `CaptureType = "note" | "source" | "idea" | "soul"` and `CaptureSource = "clipboard" | "text"`.
- [ ] Write captures under `Library/Captures/YYYY-MM-DD-<slug>.md` with frontmatter fields from the PRD.
- [ ] Add CLI commands:

```bash
ft capture text --stdin --type note --json
ft capture clipboard --type soul --json
```

- [ ] Run focused test and build:

```bash
npm test -- tests/agentic-suite.test.ts
npm run build
```

## Task 2: Agent Brief Pack and Recall

**Files:**

- Create: `src/agent-brief-pack.ts`
- Create: `src/recall.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] Write failing tests proving recall combines Library docs, Captures, Commands, and bookmarks into `AgentBriefPack`.
- [ ] Verify red state with `npm test -- tests/agentic-suite.test.ts`.
- [ ] Define the shared `AgentBriefPack`, `EvidenceItem`, `TypedSlot`, `SuggestedCommand`, `BoundaryNote`, `PromotionCandidate`, and `ResultEnvelope` types.
- [ ] Implement deterministic `buildRecallPack(query, limits)` with graceful empty-store behavior.
- [ ] Implement markdown formatter headed `# Agent Brief Pack`.
- [ ] Add CLI:

```bash
ft recall "agent memory" --json
ft recall "agent memory" --md
```

- [ ] Run focused test and full build.

## Task 3: Bookmark Source Packets

**Files:**

- Create: `src/packet.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] Write failing tests for `buildBookmarkPacket(id, { target })` with bookmark fixtures.
- [ ] Verify red state.
- [ ] Implement targets `aeon`, `hermes`, and `content-os`.
- [ ] Map target routes:

| Target | `sourcePacket.target` | default route |
|---|---|---|
| `aeon` | `aeon` | `build_handoff` |
| `hermes` | `hermes` | `recon_candidate` |
| `content-os` | `content-os` | `synthesis_evidence` |

- [ ] Add CLI:

```bash
ft packet bookmark <id> --target aeon --json
ft packet bookmark <id> --target hermes --md
```

- [ ] Run focused test and full build.

## Task 4: Soul Draft

**Files:**

- Create: `src/soul-draft.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] Write failing tests that `draftSoulFiles()` creates `SOUL.md`, `STYLE.md`, `MEMORY.md`, and `examples/good-outputs.md`.
- [ ] Verify red state.
- [ ] Implement source selection for `bookmarks`, `library`, and `clipboard` where clipboard means prior `type: soul` captures.
- [ ] Keep output deterministic and editable; do not claim final identity.
- [ ] Add CLI:

```bash
ft soul draft --from bookmarks,library,clipboard --out soul/
```

- [ ] Run focused test and full build.

## Task 5: Agent Export Bundles

**Files:**

- Create: `src/agent-export.ts`
- Modify: `src/cli.ts`
- Test: `tests/agentic-suite.test.ts`

- [ ] Write failing tests for local-only Aeon, Hermes, and soul exports.
- [ ] Verify red state.
- [ ] Implement:

```bash
ft export aeon --repo <path> --soul --briefs --json
ft export hermes --out <path> --briefs --json
ft export soul --out <path> --json
```

- [ ] Ensure exporters never create `.git`, set secrets, dispatch workflows, or call remotes.
- [ ] Run focused test and full build.

## Task 6: Operator Surfaces and Docs

**Files:**

- Modify: `src/skill.ts`
- Modify: `src/operator-suite.ts`
- Modify: `README.md`
- Modify: `docs/workflows/operator-suite.md`
- Modify: `docs/features/agent-brief-packs.md`
- Modify: `raycast/fieldtheory/src/run-command.tsx`
- Test: `tests/skill.test.ts`, `tests/operator-suite.test.ts`, `tests/cli.test.ts`

- [ ] Write or update tests proving skill text mentions `ft recall`, `ft packet`, and capture-first workflow.
- [ ] Verify red state where current docs/skill omit new command language.
- [ ] Update skill guidance so agents prefer `ft recall --json` before raw search/list.
- [ ] Add Raycast quick actions for Recall Pack, Capture Clipboard, and Packet Bookmark where safe.
- [ ] Update docs so README, workflow docs, PRD, environment docs, and architecture docs agree.
- [ ] Run:

```bash
npm test
npm run build
git diff --check
```

## Final Verification

- [ ] Run full isolated tests:

```bash
HOME="$(mktemp -d)" npm test
```

- [ ] Run build:

```bash
npm run build
```

- [ ] Run diff hygiene:

```bash
git diff --check
```

- [ ] Run CLI smoke with temporary roots:

```bash
FT_DATA_DIR="$(mktemp -d)" FT_LIBRARY_DIR="$(mktemp -d)" FT_COMMANDS_DIR="$(mktemp -d)" npm run dev -- capture text --stdin --type note --json
```

- [ ] Append one audit line to `~/wiki/log.md`.
- [ ] Commit with `feat(agentic): add capture-first agent contracts` after all verification passes.

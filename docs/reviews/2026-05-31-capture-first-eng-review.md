---
title: Capture-First Agentic Suite Engineering Review
created: 2026-05-31
status: ready-for-milestone-1-implementation
scope: Field Theory local capture, recall, packet, soul, and export contracts
tags: [engineering-review, fieldtheory, capture, agents, raycast]
---

# Capture-First Agentic Suite Engineering Review

## Verdict

Proceed with Milestone 1 only after the tightened implementation plan is used as
the source of truth:

- `docs/superpowers/plans/2026-05-31-fieldtheory-capture-first-agentic-suite.md`
- `docs/prd/capture-first-agentic-suite.md`
- `docs/setup/capture-first-environment.md`
- `docs/architecture/capture-first-agentic-suite.md`

The correct first coding move is Task 0a from the plan: create the isolated
test harness, register command groups/options, and enforce chrome-free JSON
output for the agentic commands. Starting with capture implementation before
that would make the workers collide in `src/cli.ts` and produce brittle command
tests.

## Evidence Read

| Evidence | Finding |
|---|---|
| `src/paths.ts` | Existing path split already supports `FT_DATA_DIR`, `FT_LIBRARY_DIR`, and `FT_COMMANDS_DIR`. |
| `src/library.ts` | Library CRUD already has path guards and search/list helpers suitable for Captures. |
| `src/document-ops.ts` | `resolveMarkdownPath()`, `createMarkdownFile()`, `sha256()`, and conflict guards should be reused. |
| `src/bookmarks-db.ts` | `getBookmarkById()` and `searchBookmarks()` are the right packet/recall bookmark APIs. |
| `src/commands-files.ts` | Commands are portable markdown files under the Library Commands root. |
| `tests/library.test.ts`, `tests/commands-files.test.ts`, `tests/bookmarks-db.test.ts` | Existing tests show the isolated temp-root pattern the new suite must follow. |
| Wiki memory doctrine | Raw capture must stay staged; wiki/GBrain promotion remains explicit and review-gated. |
| PR review feedback | Raycast `run-command` hid output detail because `<List>` lacked `isShowingDetail`. |

## Fix Already Applied

The existing Raycast wrapper had a real working-product bug: the command output
was rendered as `List.Item.Detail`, but the parent `List` did not show details by
default.

Fixed surfaces:

- `raycast/fieldtheory/src/run-command.tsx`
- `src/operator-suite.ts` scaffold template
- `tests/operator-suite.test.ts`

Regression test:

```bash
HOME="$(mktemp -d)" npx tsx --test tests/operator-suite.test.ts
```

Result: 6 tests passed.

## Architecture Risks

| Risk | Impact | Required mitigation |
|---|---|---|
| Capture writes outside Library | Pollutes wiki/canon or arbitrary filesystem paths. | `ft capture` writes only `Library/Captures/` through resolved root checks and `createMarkdownFile()`. |
| Export writes too much authority | Accidentally creates repos, secrets, workflow dispatches, or remote state. | Exporters write only local files below explicit `--repo` or `--out`; no `git`, `gh`, `vercel`, network, or model calls. |
| JSON output mixed with CLI chrome | Agents cannot parse `ft recall --json` or `ft packet --json`. | Add agentic commands to `shouldSkipCommandChrome()` and test via CLI stdout capture. |
| Clipboard becomes the only capture path | Non-macOS and CI users lose capture ability. | Clipboard uses `pbpaste` on macOS; stdin remains the portable fallback. |
| Recall pretends to be smarter than it is | Bad ranking gets mistaken for synthesis. | Deterministic search/ranking only in v1; every statement traces to evidence. |
| Soul draft overclaims identity | Generated files look final or authoritative. | Every soul file says editable draft and includes source/boundary notes. |
| Workers collide in `src/cli.ts` | Merge conflicts and partial command wiring. | Task 0a lands command scaffolding first; later workers own separate modules. |

## Subagent Orders

Four subagents were dispatched as read-only reviewers before implementation:

| Agent | Focus | Output expected |
|---|---|---|
| Epicurus | Capture substrate | Capture risks, tests, APIs, env gaps. |
| Pascal | Recall and `AgentBriefPack` | Schema/ranking/edge-case recommendations. |
| Peirce | Packets, soul, Aeon/Hermes exports | Bundle layouts, target fields, path safety, smoke commands. |
| Euclid | Plan quality and release gates | Missing acceptance criteria, CI/versioning risks, worker order. |

The controller should integrate their findings before the first feature commit if
they return before implementation begins. If they return late, treat their
reports as review input for the next coding checkpoint rather than rewriting
completed work without evidence.

Integrated reviewer findings:

- Freeze `AgentBriefPack` with `id`, `input`, `limits`, `storeStatus`,
  evidence-linked `summaryClaims`, `SuggestedCommand.argv`, and
  `SourcePacket.whySavedStatus`.
- Use timestamped capture filenames plus collision suffixes so two same-day
  captures with the same slug do not fail unexpectedly.
- Search captures separately and exclude `Captures/` from normal Library recall
  results to avoid double-counting.
- Keep Raycast read-only by default. Do not add capture/write commands to the
  default launcher list.
- Require realpath/symlink output-root checks for soul and export writers.
- Keep `aeon.yml.draft` inside export bundles; do not write root `aeon.yml` or
  GitHub workflow files in Milestone 1.
- Use branch-local smoke commands through `npm run --silent dev -- ...` until the new CLI
  commands are installed globally.

## Implementation Order

1. Land Task 0a isolated harness and CLI group/parser scaffolding.
2. Land Task 0b `AgentBriefPack` validation helpers.
3. Build capture substrate with secret preflight and collision-safe IDs.
4. Build recall with filtered capture search and explicit missing-index handling.
5. Build bookmark source packets with per-target boundaries.
6. Land shared output/sensitive-content guards.
7. Build soul draft and local-only exporters through the shared writer.
8. Update skill/Raycast/operator docs to prefer recall and packet commands.
9. Run final isolated tests, build, package, Raycast, diff hygiene, and CLI smoke.

Do not start Vercel, Privy, Gordo repo provisioning, Hermes writeback, or x402
implementation until Tasks 1-6 pass against isolated local roots.

## Acceptance Matrix

| Requirement | Proof |
|---|---|
| Capture path safety | Test rejects empty text, unsupported type, and writes outside `Library/Captures/`. |
| Clipboard fallback | Test injects failing clipboard reader and asserts clear fallback error. |
| Recall contract | Test proves captures, Library, Commands, and bookmarks all produce evidence items and missing stores produce partial JSON with `storeStatus`. |
| Packet contract | Test proves each target maps to the expected `sourcePacket.agentRoute`. |
| Soul draft | Test proves exactly five expected files are created under explicit output root, including `data/source-index.json`. |
| Exports | Test proves no `.git`, no root `aeon.yml`, no `.github/workflows`, no secrets, no remote calls, and all files stay below output root. |
| Existing repo gate | Test proves `ft export aeon --repo` refuses existing `.git` repos unless `--allow-existing-repo` is explicit. |
| Sensitive content | Test proves token/key/cookie/private-key/wallet-seed fixtures do not appear in soul or export outputs. |
| Raycast wrapper | Test proves committed and scaffolded `run-command.tsx` use `<List isShowingDetail>`. |
| Final gates | `HOME="$(mktemp -d)" npm test`, `npm run build`, `npm run release:check`, Raycast lint/build when tooling exists, `git diff --check`, isolated CLI smoke. |

## Second Review Addendum

The second four-agent review found these blockers before implementation:

- Plan/feature/PRD schema drift: flat capture frontmatter, `capturedAt`,
  `BoundaryNote`, target payload keys, and `--dry-run` wording must agree.
- `buildCli()` tests need isolated roots before construction because the command
  builder performs migration/setup work.
- Capture, soul, and export need high-confidence secret detection before output
  leaves `Library/Captures/`.
- Soul/export path safety needs realpath-aware tests, not `startsWith()`.
- Aeon/Gordo export into an existing Git repo needs an explicit
  `--allow-existing-repo` gate.
- Package release needs `package-lock.json`, `npm run release:check`, packed-bin
  smoke, and Raycast scaffold/lint/build checks.
- Milestone 2 needs a handoff artifact before Vercel/Privy/x402 work begins.

## Release Risks

| Risk | Decision |
|---|---|
| `.github` workflows are absent | Add production CI/Vercel workflows in Milestone 2, not before local contracts exist. |
| Root `prepublishOnly` only runs build | Add `npm run release:check` with build, `npm pack --dry-run`, and packed-bin help smoke before publishing. |
| Raycast has its own package scripts | Milestone 1 final verification should include the Raycast detail regression, scaffold agreement, and Raycast lint/build when tooling exists. |
| Package remains `1.4.0` | New CLI command groups require a minor version bump to `1.5.0` in both `package.json` and `package-lock.json`. |

## Deferred Hosted Suite

Milestone 2 remains valid, but it should consume these local contracts instead of
inventing a separate backend truth layer:

- Next.js portal on Vercel.
- Privy GitHub + Base EVM + Solana login.
- Gordo/Aeon control plane around export bundles.
- Hermes import/export surface.
- x402 payment-gated endpoint architecture and handoff docs.

The hosted product starts after the local CLI can prove capture, recall, packet,
soul, and export behavior with tests.

## Final Integration Addendum

Third review lane:

| Reviewer | Finding | Resolution |
|---|---|---|
| Mendel | Hermes and soul exports lacked happy-path manifest coverage. | Added persisted-manifest assertions for Aeon, Hermes, soul exports, and `ft export soul --json`. |
| Anscombe | Setup smoke used branch-local commands but did not prove reproducible JSON outputs. | Added a temp-root smoke script and corrected it to use `npm run --silent dev -- ...` for redirected JSON. |
| Boyle | Export manifests could diverge between returned JSON and persisted files; soul export had no manifest file. | Export manifests now snapshot payload files before writing `manifest.json`; soul export writes `manifest.json`. |
| Linnaeus | Secret scanning missed cookies, BIP39 coverage was partial, existing-repo gate missed subdirectories, and Raycast scaffold drift was under-tested. | Added cookie detection, `@scure/bip39` validation, ancestor `.git` gate, `.git` metadata rejection, full text scaffold agreement, and `prepublishOnly` -> `release:check`. |

Final validation run:

| Gate | Result |
|---|---|
| Focused agentic/operator tests | Passed: 35 tests. |
| `npm run build` | Passed. |
| `HOME="$(mktemp -d)" npm test` | Passed: 589 tests. |
| `npm run release:check` | Passed: build, `npm pack --dry-run`, packed-bin help smoke. |
| Raycast lint/build | Passed: `npm --prefix raycast/fieldtheory run lint && npm --prefix raycast/fieldtheory run build`. |
| Milestone 1 temp-root CLI smoke | Passed after switching docs to `npm run --silent dev -- ...`; produced `{"smoke":"ok"}` with capture, recall, packets, soul draft, Aeon export, Hermes export, and soul export JSON. |
| `git diff --check` | Passed. |

Remaining scope boundary:

- Do not start Vercel, Privy, Gordo/Aeon writeback, Hermes writeback, or x402
  implementation from this milestone. Milestone 2 must consume the checked
  `AgentBriefPack` and export-manifest contracts.

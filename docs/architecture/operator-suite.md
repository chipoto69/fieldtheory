# Field Theory Operator Suite Architecture

Status: implemented documentation plus CLI-backed operator surfaces.
Audience: solo AI operators, coding agents, and local-first workflows.

## Working Decision

Field Theory stays terminal-first. The operator suite adds product surfaces
around the existing CLI without creating a second source of truth.

| Surface | Status | Authority |
|---|---|---|
| `ft suite` CLI group | verified-command | reads and scaffolds local artifacts |
| Static operator console | verified-file | read-only browser surface |
| Raycast extension | verified-file | wraps CLI commands; no direct data store writes |
| MCP adapter boundary | proposed-target | should call CLI JSON contracts first |

## Status Legend

| Status | Meaning |
|---|---|
| verified-command | implemented as a CLI command in this repo |
| verified-file | implemented as a repository artifact |
| proposed-target | documented boundary for a future implementation |

## Master Map

```mermaid
flowchart LR
  subgraph Local["local device boundary"]
    X["X bookmarks"]:::sensor --> Sync["ft sync"]:::adapter
    Library["Library markdown"]:::store --> Recall["ft library search"]:::recall
    Commands["Portable commands"]:::truth --> Cmds["ft commands validate"]:::worker
    Sync --> Bookmarks["bookmarks.db + jsonl"]:::store
    Bookmarks --> Search["ft search --json"]:::recall
    Suite["ft suite"]:::surface --> Status["operator suite manifest"]:::audit
    Console["static operator console"]:::surface --> Status
    Raycast["Raycast extension"]:::export --> Suite
  end

  subgraph AgentPlane["agent plane"]
    Skill["/fieldtheory skill"]:::agent --> CLI["CLI JSON contracts"]:::surface
    MCP["MCP adapter boundary"]:::agent --> CLI
    Plugins["Browser / GitHub / Vercel plugins"]:::external --> CLI
  end

  Search --> CLI
  Recall --> CLI
  Cmds --> CLI
  CLI --> Skill
  CLI --> MCP
  Suite --> Raycast

  classDef sensor fill:#dbeafe,stroke:#2563eb,color:#111827;
  classDef adapter fill:#cffafe,stroke:#0891b2,color:#111827;
  classDef worker fill:#fef9c3,stroke:#ca8a04,color:#111827;
  classDef store fill:#dcfce7,stroke:#16a34a,color:#111827;
  classDef audit fill:#e5e7eb,stroke:#374151,color:#111827;
  classDef truth fill:#ffe4e6,stroke:#e11d48,color:#111827;
  classDef recall fill:#ede9fe,stroke:#7c3aed,color:#111827;
  classDef agent fill:#fce7f3,stroke:#db2777,color:#111827;
  classDef surface fill:#ccfbf1,stroke:#0f766e,color:#111827;
  classDef external fill:#f8fafc,stroke:#475569,color:#111827;
  classDef export fill:#f5d0fe,stroke:#c026d3,color:#111827;
```

## Planes

| Plane | Owns | Does not own |
|---|---|---|
| Data | bookmark cache, markdown library, command files | model decisions |
| Truth/control | command validation, write gates, local paths | upstream wiki canon gates |
| Agent | `/fieldtheory` skill and future MCP facade | direct store mutation |
| Model | existing classify/ask/possible engines | hidden provider routing |
| Product | CLI, static console, Mac app deep links | private raw transcript promotion |
| Extension | Raycast and plugin manifests | independent data authority |

## Agent Topology

```mermaid
flowchart TB
  Operator["human operator"]:::surface --> CLI["ft CLI"]:::surface
  Codex["Codex"]:::agent --> Skill["/fieldtheory skill"]:::agent
  Claude["Claude Code"]:::agent --> Skill
  Skill --> CLI
  Raycast["Raycast"]:::export --> CLI
  FutureMcp["future MCP server"]:::agent --> CLI
  CLI --> Stores["local stores"]:::store
  CLI --> Docs["operator docs"]:::truth

  classDef agent fill:#fce7f3,stroke:#db2777,color:#111827;
  classDef surface fill:#ccfbf1,stroke:#0f766e,color:#111827;
  classDef export fill:#f5d0fe,stroke:#c026d3,color:#111827;
  classDef store fill:#dcfce7,stroke:#16a34a,color:#111827;
  classDef truth fill:#ffe4e6,stroke:#e11d48,color:#111827;
```

## Write Authority

| Actor | Target | Allowed writes | Forbidden writes | Gate |
|---|---|---|---|---|
| CLI user | Library | create/update/delete via explicit command | silent canon promotion | command invocation |
| CLI user | Commands | create/update/delete and validate | bypass validation on release artifacts | `ft commands validate` |
| Agent skill | Local stores | none by default; recommends CLI calls | raw filesystem mutation | operator instruction |
| Raycast | Local stores | none by default | direct markdown/database writes | CLI wrapper only |
| Future MCP | Local stores | call whitelisted CLI JSON contracts | direct DB writes | tool schema + audit |

## Model Routing

```mermaid
flowchart LR
  Query["operator request"]:::surface --> Classifier{"needs model?"}:::model
  Classifier -->|"no"| Deterministic["CLI read/write"]:::worker
  Classifier -->|"yes"| Engine["Field Theory engine resolver"]:::model
  Engine --> Claude["Claude/Codex CLI session"]:::modelCloud
  Engine --> Api["API mode only when configured"]:::modelCloud
  Deterministic --> Audit["stdout/json contract"]:::audit
  Claude --> Audit
  Api --> Audit

  classDef surface fill:#ccfbf1,stroke:#0f766e,color:#111827;
  classDef worker fill:#fef9c3,stroke:#ca8a04,color:#111827;
  classDef model fill:#e0e7ff,stroke:#4f46e5,color:#111827;
  classDef modelCloud fill:#fae8ff,stroke:#9333ea,color:#111827;
  classDef audit fill:#e5e7eb,stroke:#374151,color:#111827;
```

## MCP Boundary

Future MCP tools should stay thin:

```json
{
  "tool": "fieldtheory.search",
  "input": { "query": "agent memory", "limit": 10 },
  "exec": ["ft", "search", "agent memory", "--limit", "10", "--json"],
  "authority": "read-only",
  "output": "Field Theory search JSON"
}
```

No MCP server should write directly to SQLite or markdown stores. Writes go
through explicit CLI commands with the same conflict checks operators use.

## MVP Spine

1. Read local status through `ft suite status --json`.
2. Open the static console for a browser-readable operator map.
3. Launch Raycast commands that call the CLI instead of reimplementing data access.
4. Promote repeated workflows into portable commands or skills.
5. Add MCP later as a thin facade over the same JSON contracts.


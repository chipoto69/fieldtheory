import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageInfo {
  version?: string;
}

export interface OperatorSuiteComponent {
  id: string;
  name: string;
  plane: 'data' | 'truth' | 'agent' | 'model' | 'product' | 'extension';
  status: 'verified-file' | 'verified-command' | 'proposed-target';
  owns: string;
  reads: string[];
  writes: string[];
  command?: string;
}

export interface OperatorSuiteWorkflowStep {
  id: string;
  name: string;
  gate: string;
  command: string;
  output: string;
}

export interface OperatorSuiteStatus {
  name: string;
  version: string;
  generatedAt: string;
  surfaces: string[];
  components: OperatorSuiteComponent[];
  workflows: OperatorSuiteWorkflowStep[];
  raycast: {
    extensionPath: string;
    commands: string[];
    cliBinary: string;
  };
  docs: {
    architecture: string;
    workflows: string;
    raycast: string;
  };
}

export interface RaycastExtensionFile {
  path: string;
  content: string;
}

export interface RaycastScaffoldResult {
  root: string;
  written: string[];
  skipped: string[];
}

const pkg = require('../package.json') as PackageInfo;

export const OPERATOR_SUITE_COMPONENTS: OperatorSuiteComponent[] = [
  {
    id: 'cli-kernel',
    name: 'Field Theory CLI',
    plane: 'product',
    status: 'verified-command',
    owns: 'Terminal-first operator and agent command surface.',
    reads: ['~/.fieldtheory/bookmarks', '~/.fieldtheory/library', '~/.fieldtheory/library/Commands'],
    writes: ['local markdown', 'portable commands', 'operator suite scaffolds'],
    command: 'ft suite status --json',
  },
  {
    id: 'library-store',
    name: 'Library markdown',
    plane: 'data',
    status: 'verified-command',
    owns: 'Human-readable local knowledge and app documents.',
    reads: ['markdown files'],
    writes: ['versioned markdown documents'],
    command: 'ft library search <query> --json',
  },
  {
    id: 'commands-store',
    name: 'Portable commands',
    plane: 'truth',
    status: 'verified-command',
    owns: 'Reusable operator procedures with validation guardrails.',
    reads: ['~/.fieldtheory/library/Commands'],
    writes: ['command markdown'],
    command: 'ft commands validate --json',
  },
  {
    id: 'skill-surface',
    name: '/fieldtheory skill',
    plane: 'agent',
    status: 'verified-command',
    owns: 'Agent procedure memory for when to use Field Theory context.',
    reads: ['skill body', 'local CLI'],
    writes: ['Claude Code command', 'Codex instruction'],
    command: 'ft skill install',
  },
  {
    id: 'mcp-adapter',
    name: 'MCP adapter boundary',
    plane: 'agent',
    status: 'proposed-target',
    owns: 'Future MCP facade over the same read-only CLI contracts.',
    reads: ['ft * --json outputs'],
    writes: ['no direct writes without command gate'],
    command: 'ft suite architecture',
  },
  {
    id: 'plugin-registry',
    name: 'Plugin registry',
    plane: 'extension',
    status: 'proposed-target',
    owns: 'Installable extension metadata for Browser, GitHub, Vercel, and local app plugins.',
    reads: ['operator suite manifest'],
    writes: ['plugin install plans'],
    command: 'ft suite workflows',
  },
  {
    id: 'raycast-extension',
    name: 'Raycast extension',
    plane: 'extension',
    status: 'verified-file',
    owns: 'Keyboard-first operator launcher wrapped around the CLI.',
    reads: ['ft suite status --json', 'ft search --json', 'ft commands list --json'],
    writes: ['none by default'],
    command: 'ft suite raycast scaffold',
  },
  {
    id: 'operator-console',
    name: 'Operator console',
    plane: 'product',
    status: 'verified-file',
    owns: 'Static browser-readable architecture, workflow, and status console.',
    reads: ['apps/operator-suite/data/status.json'],
    writes: ['none'],
    command: 'open apps/operator-suite/index.html',
  },
];

export const OPERATOR_SUITE_WORKFLOWS: OperatorSuiteWorkflowStep[] = [
  {
    id: 'discover',
    name: 'Discover local context',
    gate: 'read-only',
    command: 'ft paths --json && ft status --json',
    output: 'Canonical paths and local collection health.',
  },
  {
    id: 'recall',
    name: 'Recall evidence',
    gate: 'read-only',
    command: 'ft library search <query> --json && ft search <query> --json',
    output: 'Durable notes first, bookmark evidence second.',
  },
  {
    id: 'package',
    name: 'Package reusable procedure',
    gate: 'write with operator intent',
    command: 'ft commands new <name> --stdin && ft commands validate <name>',
    output: 'Validated portable command in the local Commands store.',
  },
  {
    id: 'skill',
    name: 'Expose to coding agents',
    gate: 'install writes only',
    command: 'ft skill install',
    output: 'Claude Code and Codex procedure memory updated.',
  },
  {
    id: 'operate',
    name: 'Operate from launcher',
    gate: 'read-only by default',
    command: 'ft suite raycast scaffold --out ./raycast/fieldtheory',
    output: 'Raycast extension that wraps CLI commands without new data authority.',
  },
  {
    id: 'promote',
    name: 'Promote durable doctrine',
    gate: 'human canon gate',
    command: 'ft library create <path> --stdin',
    output: 'Human-readable markdown artifact; wiki canon stays separately gated.',
  },
];

export function getOperatorSuiteStatus(now: Date = new Date()): OperatorSuiteStatus {
  return {
    name: 'Field Theory Operator Suite',
    version: pkg.version ?? '0.0.0',
    generatedAt: now.toISOString(),
    surfaces: [
      'CLI command group: ft suite',
      'Static browser console: apps/operator-suite',
      'Architecture docs: docs/architecture/operator-suite.md',
      'Workflow docs: docs/workflows/operator-suite.md',
      'Raycast extension: raycast/fieldtheory',
      'Agent skill: ft skill install',
    ],
    components: OPERATOR_SUITE_COMPONENTS,
    workflows: OPERATOR_SUITE_WORKFLOWS,
    raycast: {
      extensionPath: 'raycast/fieldtheory',
      commands: ['search-bookmarks', 'operator-suite', 'run-command'],
      cliBinary: process.env.FT_CLI_BIN ?? 'ft',
    },
    docs: {
      architecture: 'docs/architecture/operator-suite.md',
      workflows: 'docs/workflows/operator-suite.md',
      raycast: 'docs/raycast-extension.md',
    },
  };
}

export function formatOperatorSuiteStatus(status: OperatorSuiteStatus = getOperatorSuiteStatus()): string {
  const lines = [
    `${status.name} v${status.version}`,
    '',
    'Surfaces',
    ...status.surfaces.map((surface) => `  - ${surface}`),
    '',
    'Components',
    ...status.components.map((component) => {
      const command = component.command ? ` (${component.command})` : '';
      return `  - ${component.name} [${component.plane}, ${component.status}]${command}`;
    }),
    '',
    'Workflows',
    ...status.workflows.map((workflow) => `  - ${workflow.name}: ${workflow.command}`),
    '',
    `Raycast: ${status.raycast.extensionPath}`,
  ];
  return lines.join('\n') + '\n';
}

export const OPERATOR_SUITE_ARCHITECTURE_MD = `# Field Theory Operator Suite Architecture

Status: implemented documentation plus CLI-backed operator surfaces.
Audience: solo AI operators, coding agents, and local-first workflows.

## Working Decision

Field Theory stays terminal-first. The operator suite adds three product surfaces
around the existing CLI:

| Surface | Status | Authority |
|---|---|---|
| \`ft suite\` CLI group | verified-command | reads and scaffolds local artifacts |
| Static operator console | verified-file | read-only browser surface |
| Raycast extension | verified-file | wraps CLI commands; no direct data store writes |
| MCP adapter boundary | proposed-target | should call CLI JSON contracts first |

## Master Map

\`\`\`mermaid
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
\`\`\`

## Planes

| Plane | Owns | Does not own |
|---|---|---|
| Data | bookmark cache, markdown library, command files | model decisions |
| Truth/control | command validation, write gates, local paths | upstream wiki canon gates |
| Agent | /fieldtheory skill and future MCP facade | direct store mutation |
| Model | existing classify/ask/possible engines | hidden provider routing |
| Product | CLI, static console, Mac app deep links | private raw transcript promotion |
| Extension | Raycast and plugin manifests | independent data authority |

## Write Authority

| Actor | Target | Allowed writes | Forbidden writes | Gate |
|---|---|---|---|---|
| CLI user | Library | create/update/delete via explicit command | silent canon promotion | command invocation |
| CLI user | Commands | create/update/delete and validate | bypass validation on release artifacts | \`ft commands validate\` |
| Agent skill | Local stores | none by default; recommends CLI calls | raw filesystem mutation | operator instruction |
| Raycast | Local stores | none by default | direct markdown/database writes | CLI wrapper only |
| Future MCP | Local stores | call whitelisted CLI JSON contracts | direct DB writes | tool schema + audit |

## Model Routing

\`\`\`mermaid
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
\`\`\`

## MVP Spine

1. Read local status through \`ft suite status --json\`.
2. Open the static console for a browser-readable operator map.
3. Launch Raycast commands that call the CLI instead of reimplementing data access.
4. Promote repeated workflows into portable commands or skills.
5. Add MCP later as a thin facade over the same JSON contracts.
`;

export const OPERATOR_SUITE_WORKFLOWS_MD = `# Field Theory Operator Workflows

These workflows describe how AI agents and human operators should use Field
Theory without bypassing local truth boundaries.

## Workflow Loop

\`\`\`mermaid
flowchart LR
  Discover["discover paths/status"]:::surface --> Recall["recall evidence"]:::recall
  Recall --> Package["package command"]:::truth
  Package --> Validate["validate command"]:::worker
  Validate --> Install["install skill"]:::agent
  Install --> Operate["Raycast / CLI operate"]:::surface
  Operate --> Promote["promote durable note"]:::truth
  Promote --> Recall

  classDef surface fill:#ccfbf1,stroke:#0f766e,color:#111827;
  classDef recall fill:#ede9fe,stroke:#7c3aed,color:#111827;
  classDef truth fill:#ffe4e6,stroke:#e11d48,color:#111827;
  classDef worker fill:#fef9c3,stroke:#ca8a04,color:#111827;
  classDef agent fill:#fce7f3,stroke:#db2777,color:#111827;
\`\`\`

## Standard Workflows

| Step | Gate | Command | Output |
|---|---|---|---|
${OPERATOR_SUITE_WORKFLOWS.map((step) => `| ${step.name} | ${step.gate} | \`${step.command}\` | ${step.output} |`).join('\n')}

## MCP Contract

Future MCP tools should be boring wrappers around existing CLI contracts:

\`\`\`json
{
  "tool": "fieldtheory.search",
  "input": { "query": "agent memory", "limit": 10 },
  "exec": ["ft", "search", "agent memory", "--limit", "10", "--json"],
  "authority": "read-only",
  "output": "Field Theory search JSON"
}
\`\`\`

No MCP server should write directly to SQLite or markdown stores. Writes go
through explicit CLI commands with the same conflict checks operators use.

## Raycast Contract

Raycast commands call \`ft\`, display concise results, and hand complex edits
back to the CLI or app. The extension does not own persistence.
`;

export const RAYCAST_EXTENSION_PACKAGE = {
  scripts: {
    build: 'ray build -e dist',
    dev: 'ray develop',
    lint: 'ray lint',
  },
  dependencies: {
    '@raycast/api': '^1.100.0',
  },
  devDependencies: {
    '@raycast/eslint-config': '^2.0.4',
    '@types/node': '^20.11.30',
    typescript: '^5.4.5',
  },
};

export function getRaycastManifest(): Record<string, unknown> {
  return {
    name: 'fieldtheory',
    title: 'Field Theory',
    description: 'Operate Field Theory from Raycast through the local ft CLI.',
    icon: 'extension-icon.png',
    author: 'chipoto69',
    license: 'MIT',
    commands: [
      {
        name: 'search-bookmarks',
        title: 'Search Bookmarks',
        description: 'Search local X/Twitter bookmarks through ft search --json.',
        mode: 'view',
      },
      {
        name: 'operator-suite',
        title: 'Operator Suite',
        description: 'Show Field Theory operator suite status from ft suite status --json.',
        mode: 'view',
      },
      {
        name: 'run-command',
        title: 'Run Field Theory Command',
        description: 'Run a curated read-only Field Theory command.',
        mode: 'view',
      },
    ],
    preferences: [
      {
        name: 'ftBinary',
        title: 'ft binary',
        description: 'Path or binary name for the Field Theory CLI.',
        type: 'textfield',
        required: false,
        default: 'ft',
      },
    ],
  };
}

const RAYCAST_HELPER = `import { getPreferenceValues } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface Preferences {
  ftBinary?: string;
}

export async function runFt(args: string[]): Promise<string> {
  const prefs = getPreferenceValues<Preferences>();
  const binary = prefs.ftBinary || "ft";
  const { stdout } = await execFileAsync(binary, args, {
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout;
}
`;

const RAYCAST_OPERATOR_SUITE = `import { Detail, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

export default function Command() {
  const [markdown, setMarkdown] = useState("Loading Field Theory operator suite...");

  useEffect(() => {
    runFt(["suite", "status", "--json"])
      .then((stdout) => {
        const status = JSON.parse(stdout);
        setMarkdown([
          "# " + status.name,
          "",
          "**Version:** " + status.version,
          "",
          "## Surfaces",
          ...status.surfaces.map((surface: string) => "- " + surface),
          "",
          "## Workflows",
          ...status.workflows.map((workflow: any) => "- **" + workflow.name + "**: \`" + workflow.command + "\`"),
        ].join("\\n"));
      })
      .catch((error) => {
        showToast({ style: Toast.Style.Failure, title: "ft suite failed", message: String(error.message || error) });
        setMarkdown("Could not run \`ft suite status --json\`.");
      });
  }, []);

  return (
    <Detail
      markdown={markdown}
      actions={<ActionPanel><Action.CopyToClipboard title="Copy Status" content={markdown} /></ActionPanel>}
    />
  );
}
`;

const RAYCAST_SEARCH_BOOKMARKS = `import { Action, ActionPanel, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

interface BookmarkResult {
  id: string;
  text?: string;
  author?: string;
  url?: string;
}

export default function Command() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BookmarkResult[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      return;
    }
    const timer = setTimeout(() => {
      runFt(["search", query, "--limit", "12", "--json"])
        .then((stdout) => setItems(JSON.parse(stdout).results || JSON.parse(stdout)))
        .catch((error) => showToast({ style: Toast.Style.Failure, title: "Search failed", message: String(error.message || error) }));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <List searchBarPlaceholder="Search local bookmarks..." onSearchTextChange={setQuery} throttle>
      {items.map((item) => (
        <List.Item
          key={item.id}
          title={(item.text || item.id).slice(0, 90)}
          subtitle={item.author}
          actions={<ActionPanel>{item.url ? <Action.OpenInBrowser url={item.url} /> : null}<Action.CopyToClipboard content={item.id} /></ActionPanel>}
        />
      ))}
    </List>
  );
}
`;

const RAYCAST_RUN_COMMAND = `import { Action, ActionPanel, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

const COMMANDS = [
  { title: "Status", args: ["status", "--json"] },
  { title: "Paths", args: ["paths", "--json"] },
  { title: "Suite", args: ["suite", "status", "--json"] },
  { title: "Commands Validate", args: ["commands", "validate", "--json"] },
];

export default function Command() {
  const [detail, setDetail] = useState("Select a command.");

  async function run(args: string[]) {
    try {
      setDetail(await runFt(args));
    } catch (error: any) {
      showToast({ style: Toast.Style.Failure, title: "Command failed", message: String(error.message || error) });
    }
  }

  useEffect(() => { run(COMMANDS[0].args); }, []);

  return (
    <List isShowingDetail>
      {COMMANDS.map((command) => (
        <List.Item
          key={command.title}
          title={command.title}
          subtitle={"ft " + command.args.join(" ")}
          detail={<List.Item.Detail markdown={"\`\`\`json\\n" + detail + "\\n\`\`\`"} />}
          actions={<ActionPanel><Action title="Run" onAction={() => run(command.args)} /></ActionPanel>}
        />
      ))}
    </List>
  );
}
`;

export function getRaycastExtensionFiles(): RaycastExtensionFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({ ...getRaycastManifest(), ...RAYCAST_EXTENSION_PACKAGE }, null, 2) + '\n',
    },
    {
      path: 'src/lib/ft.ts',
      content: RAYCAST_HELPER,
    },
    {
      path: 'src/operator-suite.tsx',
      content: RAYCAST_OPERATOR_SUITE,
    },
    {
      path: 'src/search-bookmarks.tsx',
      content: RAYCAST_SEARCH_BOOKMARKS,
    },
    {
      path: 'src/run-command.tsx',
      content: RAYCAST_RUN_COMMAND,
    },
  ];
}

export function scaffoldRaycastExtension(root: string, options: { force?: boolean } = {}): RaycastScaffoldResult {
  const absoluteRoot = path.resolve(root);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of getRaycastExtensionFiles()) {
    const target = path.join(absoluteRoot, file.path);
    if (fs.existsSync(target) && !options.force) {
      skipped.push(target);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
    written.push(target);
  }

  return { root: absoluteRoot, written, skipped };
}

import fs from "node:fs";
import path from "node:path";
import { listBookmarks } from "./bookmarks-db.js";
import { sha256 } from "./document-ops.js";
import { listLibraryDocuments } from "./library.js";
import { assertNoSensitiveContent } from "./sensitive-content.js";
import {
  resolveOutputRoot,
  writeFixedBundleFile,
  type OutputRoot,
} from "./output-guard.js";
import {
  canonicalCommandsDir,
  canonicalLibraryDir,
  capturesDir,
  twitterBookmarksIndexPath,
} from "./paths.js";

export type SoulDraftSourceName = "bookmarks" | "library" | "clipboard";

export interface SoulDraftFile {
  path: string;
  relPath: string;
  sha256: string;
}

export interface SoulDraftSource {
  id: string;
  type: "soul" | "library" | "bookmark";
  locator: string;
  title: string;
  excerpt: string;
  hash: string;
  draftStatus: "editable";
}

export interface SoulDraftResult {
  root: string;
  generatedAt: string;
  files: SoulDraftFile[];
  sourceIndex: {
    version: "fieldtheory.soul-draft.v1";
    generatedAt: string;
    draftStatus: "editable";
    sources: SoulDraftSource[];
  };
}

interface ParsedCapture {
  valid: boolean;
  id?: string;
  type?: string;
  hash?: string;
  body: string;
}

export interface DraftSoulFilesOptions {
  from: SoulDraftSourceName[];
  outDir: string;
  now?: Date;
  force?: boolean;
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function parseCapture(content: string): ParsedCapture {
  const frontmatter = parseFrontmatter(content);
  const body = stripFrontmatter(content);
  if (!frontmatter || frontmatter.version !== "fieldtheory.capture.v1") {
    return { valid: false, body };
  }
  return {
    valid: true,
    id: frontmatter.id,
    type: frontmatter.type,
    hash: frontmatter.content_sha256,
    body,
  };
}

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

function excerpt(value: string, max = 420): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}...`;
}

function relPathFromLibrary(filePath: string): string {
  return path
    .relative(canonicalLibraryDir(), filePath)
    .split(path.sep)
    .join("/");
}

function isUnder(dir: string, filePath: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(filePath));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function captureSources(): SoulDraftSource[] {
  if (!fs.existsSync(capturesDir())) return [];
  return listLibraryDocuments({
    includeRelPathPrefixes: ["Captures/"],
    limit: undefined,
  }).flatMap((doc) => {
    const content = fs.readFileSync(doc.path, "utf-8");
    const capture = parseCapture(content);
    if (!capture.valid || capture.type !== "soul") return [];
    assertNoSensitiveContent(capture.body, `soul source ${doc.relPath}`);
    return [
      {
        id: capture.id ?? `capture_${sha256(doc.relPath).slice(0, 12)}`,
        type: "soul" as const,
        locator: doc.relPath,
        title: titleFromMarkdown(capture.body, doc.title),
        excerpt: excerpt(capture.body),
        hash: capture.hash ?? sha256(capture.body),
        draftStatus: "editable" as const,
      },
    ];
  });
}

function librarySources(): SoulDraftSource[] {
  if (!fs.existsSync(canonicalLibraryDir())) return [];
  const excluded = [capturesDir(), canonicalCommandsDir()];
  return listLibraryDocuments({ excludeDirs: excluded, limit: 20 }).flatMap(
    (doc) => {
      if (excluded.some((dir) => isUnder(dir, doc.path))) return [];
      const content = fs.readFileSync(doc.path, "utf-8");
      assertNoSensitiveContent(content, `soul library source ${doc.relPath}`);
      return [
        {
          id: `library_${sha256(doc.relPath).slice(0, 12)}`,
          type: "library" as const,
          locator: doc.relPath,
          title: doc.title,
          excerpt: excerpt(stripFrontmatter(content)),
          hash: sha256(content),
          draftStatus: "editable" as const,
        },
      ];
    },
  );
}

async function bookmarkSources(): Promise<SoulDraftSource[]> {
  if (!fs.existsSync(twitterBookmarksIndexPath())) return [];
  const bookmarks = await listBookmarks({ limit: 10, sort: "desc" });
  return bookmarks.map((bookmark) => {
    const content = [bookmark.text, bookmark.articleTitle, bookmark.articleText]
      .filter(Boolean)
      .join("\n");
    assertNoSensitiveContent(content, `soul bookmark source ${bookmark.id}`);
    return {
      id: `bookmark_${bookmark.id}`,
      type: "bookmark" as const,
      locator: bookmark.url,
      title:
        bookmark.articleTitle ||
        (bookmark.authorHandle
          ? `@${bookmark.authorHandle}`
          : `Bookmark ${bookmark.id}`),
      excerpt: excerpt(content),
      hash: sha256(content),
      draftStatus: "editable" as const,
    };
  });
}

async function collectSources(
  from: SoulDraftSourceName[],
): Promise<SoulDraftSource[]> {
  const selected = new Set(from);
  const sources: SoulDraftSource[] = [];
  if (selected.has("clipboard")) sources.push(...captureSources());
  if (selected.has("library")) sources.push(...librarySources());
  if (selected.has("bookmarks")) sources.push(...(await bookmarkSources()));
  return sources;
}

function sourceBullets(sources: SoulDraftSource[]): string {
  if (sources.length === 0) return "- No source material selected yet.";
  return sources
    .map(
      (source) =>
        `- ${source.title} (${source.type}, ${source.locator}): ${source.excerpt}`,
    )
    .join("\n");
}

function renderSoulMd(generatedAt: string, sources: SoulDraftSource[]): string {
  return [
    "# SOUL.md",
    "",
    `Editable draft generated by Field Theory at ${generatedAt}. Review before treating this as agent identity.`,
    "",
    "## Source-Backed Operating Preferences",
    "",
    sourceBullets(sources.filter((source) => source.type === "soul")),
    "",
    "## Working Contract",
    "",
    "- Prefer source-backed work over vibes.",
    "- Keep local captures staged until an explicit export or promote command runs.",
    "- Treat this file as editable draft material, not canon.",
    "",
  ].join("\n");
}

function renderStyleMd(
  generatedAt: string,
  sources: SoulDraftSource[],
): string {
  return [
    "# STYLE.md",
    "",
    `Editable draft generated by Field Theory at ${generatedAt}.`,
    "",
    "## Voice Notes",
    "",
    sourceBullets(sources),
    "",
    "## Defaults",
    "",
    "- Be direct, specific, and evidence-led.",
    "- Separate observed source material from generated recommendations.",
    "",
  ].join("\n");
}

function renderMemoryMd(
  generatedAt: string,
  sources: SoulDraftSource[],
): string {
  return [
    "# MEMORY.md",
    "",
    `Editable draft generated by Field Theory at ${generatedAt}.`,
    "",
    "## Durable Context Candidates",
    "",
    sourceBullets(sources),
    "",
    "## Promotion Boundary",
    "",
    "Nothing in this file has been promoted to wiki canon, GBrain, Honcho, Aeon, or Hermes.",
    "",
  ].join("\n");
}

function renderExamplesMd(
  generatedAt: string,
  sources: SoulDraftSource[],
): string {
  return [
    "# Good Outputs",
    "",
    `Editable draft generated by Field Theory at ${generatedAt}.`,
    "",
    "## Example Patterns",
    "",
    sources.length > 0
      ? sources
          .map(
            (source) =>
              `- Use cited material from ${source.locator} before making claims.`,
          )
          .join("\n")
      : "- Add examples after reviewing source-backed agent behavior.",
    "",
  ].join("\n");
}

function writeDraftFile(
  root: OutputRoot,
  relPath: string,
  content: string,
  force: boolean,
): SoulDraftFile {
  assertNoSensitiveContent(content, `soul output ${relPath}`);
  const written = writeFixedBundleFile(root, relPath, content, { force });
  return { path: written, relPath, sha256: sha256(content) };
}

export async function draftSoulFiles(
  options: DraftSoulFilesOptions,
): Promise<SoulDraftResult> {
  const root = resolveOutputRoot(options.outDir);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const force = options.force ?? false;
  const sources = await collectSources(options.from);
  const sourceIndex: SoulDraftResult["sourceIndex"] = {
    version: "fieldtheory.soul-draft.v1",
    generatedAt,
    draftStatus: "editable",
    sources,
  };

  const files = [
    writeDraftFile(root, "SOUL.md", renderSoulMd(generatedAt, sources), force),
    writeDraftFile(
      root,
      "STYLE.md",
      renderStyleMd(generatedAt, sources),
      force,
    ),
    writeDraftFile(
      root,
      "MEMORY.md",
      renderMemoryMd(generatedAt, sources),
      force,
    ),
    writeDraftFile(
      root,
      "examples/good-outputs.md",
      renderExamplesMd(generatedAt, sources),
      force,
    ),
    writeDraftFile(
      root,
      "data/source-index.json",
      `${JSON.stringify(sourceIndex, null, 2)}\n`,
      force,
    ),
  ];

  return {
    root: root.resolved,
    generatedAt,
    files,
    sourceIndex,
  };
}

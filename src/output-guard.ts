import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, sha256 } from './document-ops.js';

export interface OutputRoot {
  requested: string;
  resolved: string;
  realParent: string;
}

export interface WriteFixedBundleFileOptions {
  force?: boolean;
}

function nearestExistingPath(targetPath: string): string {
  let current = targetPath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function realpathIfPossible(targetPath: string): string {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function resolveThroughExistingPrefix(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const existingPrefix = nearestExistingPath(resolved);
  return path.resolve(realpathIfPossible(existingPrefix), path.relative(existingPrefix, resolved));
}

function normalizeBundleRelPath(relPath: string): string {
  const trimmed = relPath.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw new Error(`Unsafe output path: ${relPath}`);
  }

  const parts = trimmed.split(/[\\/]+/);
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new Error(`Unsafe output path: ${relPath}`);
  }

  return parts.join(path.sep);
}

export function resolveOutputRoot(outDir: string): OutputRoot {
  const requested = outDir.trim();
  if (!requested) throw new Error('Empty output path is not allowed.');

  const resolved = path.resolve(requested);
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`Refusing symlinked output root: ${resolved}`);
  }

  const existingParent = nearestExistingPath(path.dirname(resolved));
  const realParent = realpathIfPossible(existingParent);

  return {
    requested,
    resolved,
    realParent,
  };
}

export function assertInsideOutputRoot(root: OutputRoot, filePath: string): void {
  const candidate = path.resolve(filePath);
  if (!isPathInside(root.resolved, candidate)) {
    throw new Error(`Path is outside output root: ${filePath}`);
  }

  const rootReal = resolveThroughExistingPrefix(root.resolved);
  const realCandidate = resolveThroughExistingPrefix(candidate);

  if (!isPathInside(rootReal, realCandidate)) {
    throw new Error(`Path is outside output root: ${filePath}`);
  }
}

export function writeFixedBundleFile(
  root: OutputRoot,
  relPath: string,
  content: string,
  options: WriteFixedBundleFileOptions = {},
): string {
  const normalizedRelPath = normalizeBundleRelPath(relPath);
  const filePath = path.resolve(root.resolved, normalizedRelPath);
  assertInsideOutputRoot(root, filePath);

  if (fs.existsSync(filePath) && !options.force) {
    throw new Error(`Refusing to overwrite without force: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  assertInsideOutputRoot(root, filePath);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function safeId(value: string): string {
  return sha256(value).slice(0, 12);
}

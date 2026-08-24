import { lstat, readFile, readdir, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export const TOOL_CACHE_TTL_MS = Number(process.env.TOOL_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000);
export const TOOL_CACHE_MAX_BYTES = Number(process.env.TOOL_CACHE_MAX_BYTES ?? 2 * 1024 * 1024 * 1024);
export const TOOL_CACHE_ACTIVE_REQUEST_PROTECTION_MS = Number(
  process.env.TOOL_CACHE_ACTIVE_REQUEST_PROTECTION_MS ?? 5 * 60 * 1000
);

interface CacheFile {
  name: string;
  absolutePath: string;
  size: number;
  lastUsedMs: number;
  modifiedMs: number;
}

interface CacheGroup {
  files: CacheFile[];
  size: number;
  lastUsedMs: number;
  modifiedMs: number;
}

export interface ToolCacheMaintenanceOptions {
  nowMs?: number;
  ttlMs?: number;
  maxBytes?: number;
  activeRequestProtectionMs?: number;
}

export interface ToolCacheMaintenanceResult {
  deletedFiles: number;
  deletedBytes: number;
  remainingBytes: number;
}

function assertToolCacheDirectory(cacheDir: string): string {
  const resolved = path.resolve(cacheDir);
  if (path.basename(resolved) !== ".tool_cache") {
    throw new Error("Tool cache maintenance is restricted to a .tool_cache directory.");
  }
  return resolved;
}

async function assertPhysicalToolCacheDirectory(cacheDir: string): Promise<string> {
  const resolved = assertToolCacheDirectory(cacheDir);
  const stats = await lstat(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Tool cache maintenance refuses linked or non-directory cache paths.");
  }
  const physicalPath = await realpath(resolved);
  if (physicalPath !== resolved) {
    throw new Error("Tool cache maintenance refuses paths containing directory links.");
  }
  return resolved;
}

async function cacheGroups(files: CacheFile[]): Promise<CacheGroup[]> {
  const byName = new Map(files.map((file) => [file.name, file]));
  const claimed = new Set<string>();
  const groupedFiles: CacheFile[][] = [];

  for (const manifest of files.filter((file) => file.name.endsWith("_manifest.json"))) {
    const group = [manifest];
    claimed.add(manifest.name);
    try {
      const parsed = JSON.parse(await readFile(manifest.absolutePath, "utf8")) as {
        entries?: Array<{ data_file?: unknown }>;
      };
      for (const entry of parsed.entries ?? []) {
        if (typeof entry.data_file !== "string") continue;
        const name = path.posix.basename(entry.data_file);
        const dataFile = byName.get(name);
        if (!dataFile || claimed.has(name)) continue;
        claimed.add(name);
        group.push(dataFile);
      }
    } catch {
      // A corrupt manifest remains a standalone cache group.
    }
    groupedFiles.push(group);
  }

  for (const file of files) {
    if (!claimed.has(file.name)) groupedFiles.push([file]);
  }

  return groupedFiles.map((group) => ({
    files: group,
    size: group.reduce((total, file) => total + file.size, 0),
    lastUsedMs: Math.max(...group.map((file) => file.lastUsedMs)),
    modifiedMs: Math.max(...group.map((file) => file.modifiedMs))
  }));
}

async function deleteGroup(group: CacheGroup): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const file of group.files) {
    try {
      await unlink(file.absolutePath);
      files += 1;
      bytes += file.size;
    } catch {
      // Best effort; the caller accounts only successfully removed bytes.
    }
  }
  return { files, bytes };
}

/**
 * Remove expired request-cache groups, then enforce an LRU byte ceiling.
 * Manifest and referenced data files are treated as one group. Directories and
 * symbolic links are ignored, and recently written groups are protected so a
 * live request never receives a pointer that maintenance just removed.
 */
export async function maintainToolCache(
  cacheDir: string,
  options: ToolCacheMaintenanceOptions = {}
): Promise<ToolCacheMaintenanceResult> {
  const resolved = await assertPhysicalToolCacheDirectory(cacheDir);
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = Math.max(0, options.ttlMs ?? TOOL_CACHE_TTL_MS);
  const maxBytes = Math.max(0, options.maxBytes ?? TOOL_CACHE_MAX_BYTES);
  const activeRequestProtectionMs = Math.max(
    0,
    options.activeRequestProtectionMs ?? TOOL_CACHE_ACTIVE_REQUEST_PROTECTION_MS
  );
  let deletedFiles = 0;
  let deletedBytes = 0;

  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch {
    return { deletedFiles, deletedBytes, remainingBytes: 0 };
  }

  const files: CacheFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolutePath = path.join(resolved, entry.name);
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) continue;
      files.push({
        name: entry.name,
        absolutePath,
        size: stats.size,
        lastUsedMs: Math.max(stats.atimeMs, stats.mtimeMs),
        modifiedMs: stats.mtimeMs
      });
    } catch {
      // A concurrent writer/cleaner may have removed the file.
    }
  }

  const groups = await cacheGroups(files);
  const remaining: CacheGroup[] = [];
  for (const group of groups) {
    const protectedByActiveRequest = nowMs - group.lastUsedMs <= activeRequestProtectionMs;
    if (protectedByActiveRequest || nowMs - group.lastUsedMs <= ttlMs) {
      remaining.push(group);
      continue;
    }
    const deleted = await deleteGroup(group);
    deletedFiles += deleted.files;
    deletedBytes += deleted.bytes;
    if (deleted.bytes < group.size) {
      remaining.push({ ...group, size: group.size - deleted.bytes });
    }
  }

  let remainingBytes = remaining.reduce((total, group) => total + group.size, 0);
  const evictionCandidates = remaining
    .filter((group) => nowMs - group.lastUsedMs > activeRequestProtectionMs)
    .sort((left, right) => left.lastUsedMs - right.lastUsedMs || left.files[0]!.name.localeCompare(right.files[0]!.name));
  for (const group of evictionCandidates) {
    if (remainingBytes <= maxBytes) break;
    const deleted = await deleteGroup(group);
    deletedFiles += deleted.files;
    deletedBytes += deleted.bytes;
    remainingBytes -= deleted.bytes;
  }

  return { deletedFiles, deletedBytes, remainingBytes };
}

const scheduledDirectories = new Set<string>();

export function scheduleToolCacheMaintenance(cacheDir: string): void {
  const resolved = assertToolCacheDirectory(cacheDir);
  if (scheduledDirectories.has(resolved)) return;
  scheduledDirectories.add(resolved);
  setImmediate(() => {
    void maintainToolCache(resolved)
      .catch(() => undefined)
      .finally(() => scheduledDirectories.delete(resolved));
  });
}

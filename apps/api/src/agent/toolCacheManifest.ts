import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentToolContext } from "./types.js";
import { safeToolCacheFilePath } from "./toolCacheSafety.js";

export interface ToolCacheManifestEntry {
  tool: string;
  toolCallId: string;
  data_file: string;
  label?: string;
  data_key?: string;
}

export interface ToolCacheManifest {
  requestId: string;
  entries: ToolCacheManifestEntry[];
}

function safeCacheComponent(value: string, fallback: string): string {
  const trimmed = value.trim();
  const source = trimmed || fallback;
  const normalized = source.replace(/[^a-zA-Z0-9_-]/g, "_");
  const digest = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);
  const prefix = (normalized || fallback).slice(0, 83);
  return `${prefix}_${digest}`;
}

export function toolCacheManifestRelativePath(requestId: string): string {
  return path.posix.join(
    "outputs",
    ".tool_cache",
    `${safeCacheComponent(requestId, "request")}_manifest.json`
  );
}

export function toolCacheDataRelativePath(requestId: string, toolCallId?: string): string {
  return path.posix.join(
    "outputs",
    ".tool_cache",
    `${safeCacheComponent(requestId, "request")}_${safeCacheComponent(toolCallId ?? "", "call")}.json`
  );
}

export function registerToolCacheEntry(
  context: AgentToolContext,
  tool: string,
  dataFile: string,
  label?: string,
  dataKey?: string
): string {
  const relativeManifest = toolCacheManifestRelativePath(context.requestId);
  const absoluteManifest = safeToolCacheFilePath(context.projectId, relativeManifest);
  const dir = path.dirname(absoluteManifest);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let manifest: ToolCacheManifest = { requestId: context.requestId, entries: [] };
  if (existsSync(absoluteManifest)) {
    try {
      manifest = JSON.parse(readFileSync(absoluteManifest, "utf8")) as ToolCacheManifest;
    } catch {
      manifest = { requestId: context.requestId, entries: [] };
    }
  }
  if (manifest.requestId !== context.requestId || !Array.isArray(manifest.entries)) {
    manifest = { requestId: context.requestId, entries: [] };
  }

  const toolCallId = context.toolCallId?.trim() || "call";
  const entry: ToolCacheManifestEntry = {
    tool,
    toolCallId,
    data_file: dataFile,
    ...(label ? { label } : {}),
    ...(dataKey ? { data_key: dataKey } : {})
  };
  const existingIndex = manifest.entries.findIndex(
    (row) => row.toolCallId === entry.toolCallId
      && row.data_file === entry.data_file
      && row.data_key === entry.data_key
  );
  if (existingIndex >= 0) {
    manifest.entries[existingIndex] = entry;
  } else {
    manifest.entries.push(entry);
  }

  writeFileSync(absoluteManifest, JSON.stringify(manifest, null, 2), "utf8");
  return relativeManifest;
}

export function inferToolCacheLabel(
  tool: string,
  args: Record<string, unknown>
): string | undefined {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (name) {
    return name;
  }
  const q = typeof args.q === "string" ? args.q.trim() : "";
  if (q) {
    return q;
  }
  const pathArg = typeof args.path === "string" ? args.path.trim() : "";
  if (pathArg) {
    return pathArg;
  }
  if (tool) {
    return tool;
  }
  return undefined;
}

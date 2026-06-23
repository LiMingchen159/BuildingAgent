import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRootForProject } from "./knowledgeBase.js";
import type { AgentToolContext } from "./types.js";

export interface ToolCacheManifestEntry {
  tool: string;
  toolCallId: string;
  data_file: string;
  label?: string;
}

export interface ToolCacheManifest {
  requestId: string;
  entries: ToolCacheManifestEntry[];
}

export function toolCacheManifestRelativePath(requestId: string): string {
  return path.posix.join("outputs", ".tool_cache", `${requestId}_manifest.json`);
}

export function registerToolCacheEntry(
  context: AgentToolContext,
  tool: string,
  dataFile: string,
  label?: string
): string {
  const relativeManifest = toolCacheManifestRelativePath(context.requestId);
  const repoRoot = repoRootForProject(context.projectId);
  const absoluteManifest = path.join(repoRoot, relativeManifest);
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

  const toolCallId = context.toolCallId?.trim() || "call";
  const entry: ToolCacheManifestEntry = {
    tool,
    toolCallId,
    data_file: dataFile,
    ...(label ? { label } : {})
  };
  const existingIndex = manifest.entries.findIndex(
    (row) => row.toolCallId === entry.toolCallId && row.data_file === entry.data_file
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

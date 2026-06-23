import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inferToolCacheLabel, registerToolCacheEntry, toolCacheManifestRelativePath } from "./toolCacheManifest.js";
import { repoRootForProject } from "./knowledgeBase.js";
import type { AgentToolContext } from "./types.js";

export const TOOL_RESULT_INLINE_MAX_BYTES = Number(process.env.TOOL_RESULT_INLINE_MAX ?? 32_768);
export const TOOL_RESULT_MAX_INLINE_ROWS = Number(process.env.TOOL_RESULT_MAX_INLINE_ROWS ?? 96);

export interface ToolResultSummary {
  row_count: number;
  truncated: boolean;
  numeric_min: number | null;
  numeric_max: number | null;
  time_start: string | null;
  time_end: string | null;
}

function serializeSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractTimestamp(item: Record<string, unknown>): string | null {
  for (const key of ["ts", "timestamp", "time", "datetime", "date"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractNumericValue(item: Record<string, unknown>): number | null {
  for (const key of ["value_num", "value", "val", "numeric_value"]) {
    const num = asNumber(item[key]);
    if (num !== null) {
      return num;
    }
  }
  return null;
}

function summarizeItems(items: Array<Record<string, unknown>>): ToolResultSummary {
  let numericMin: number | null = null;
  let numericMax: number | null = null;
  let timeStart: string | null = null;
  let timeEnd: string | null = null;

  for (const item of items) {
    const num = extractNumericValue(item);
    if (num !== null) {
      numericMin = numericMin === null ? num : Math.min(numericMin, num);
      numericMax = numericMax === null ? num : Math.max(numericMax, num);
    }
    const ts = extractTimestamp(item);
    if (ts) {
      if (!timeStart || ts < timeStart) {
        timeStart = ts;
      }
      if (!timeEnd || ts > timeEnd) {
        timeEnd = ts;
      }
    }
  }

  return {
    row_count: items.length,
    truncated: false,
    numeric_min: numericMin,
    numeric_max: numericMax,
    time_start: timeStart,
    time_end: timeEnd
  };
}

export function downsampleItems<T>(items: T[], maxRows: number): { sampled: T[]; truncated: boolean } {
  if (items.length <= maxRows || maxRows <= 0) {
    return { sampled: items, truncated: false };
  }
  if (maxRows === 1) {
    return { sampled: [items[0]!], truncated: true };
  }
  const step = (items.length - 1) / (maxRows - 1);
  const sampled: T[] = [];
  for (let index = 0; index < maxRows; index += 1) {
    sampled.push(items[Math.round(index * step)]!);
  }
  return { sampled, truncated: true };
}

/** Tools whose item payloads must always land in data_file + manifest for execute_code. */
export const ALWAYS_CACHE_TOOLS = new Set(["bms_timeseries_query"]);

function hasCacheableItems(result: Record<string, unknown>): boolean {
  const items = result.items;
  return Array.isArray(items) && items.length > 0;
}

function shouldCompact(result: Record<string, unknown>): boolean {
  if (result.error !== undefined || result.compacted === true) {
    return false;
  }
  const items = result.items;
  if (Array.isArray(items) && items.length > TOOL_RESULT_MAX_INLINE_ROWS) {
    return true;
  }
  return serializeSize(result) > TOOL_RESULT_INLINE_MAX_BYTES;
}

function shouldAlwaysCache(result: Record<string, unknown>, tool: string): boolean {
  return ALWAYS_CACHE_TOOLS.has(tool) && hasCacheableItems(result);
}

function cacheFileName(context: AgentToolContext): string {
  const callId = context.toolCallId?.trim() || "call";
  const safeCallId = callId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${context.requestId}_${safeCallId}.json`;
}

function spillFullPayload(
  projectId: string,
  relativePath: string,
  payload: Record<string, unknown>
): void {
  const repoRoot = repoRootForProject(projectId);
  const absolutePath = path.join(repoRoot, relativePath);
  const dir = path.dirname(absolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(absolutePath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Compact large tool results: downsample items[], summarize, spill full payload to repository.
 */
function cacheRelativePath(context: AgentToolContext): string {
  return path.posix.join("outputs", ".tool_cache", cacheFileName(context));
}

function attachCachePointers(
  result: Record<string, unknown>,
  context: AgentToolContext,
  tool: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const relativePath = cacheRelativePath(context);
  spillFullPayload(context.projectId, relativePath, result);
  const label = inferToolCacheLabel(tool, args);
  const cacheManifest = registerToolCacheEntry(context, tool, relativePath, label);
  return {
    ...result,
    data_file: relativePath,
    cache_manifest: cacheManifest
  };
}

export function compactToolResult(
  result: Record<string, unknown>,
  context: AgentToolContext,
  tool = "tool",
  args: Record<string, unknown> = {}
): Record<string, unknown> {
  if (shouldCompact(result)) {
    const items = Array.isArray(result.items)
      ? result.items.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      : [];
    const fullSummary = summarizeItems(items);
    const { sampled, truncated } = downsampleItems(items, TOOL_RESULT_MAX_INLINE_ROWS);
    const relativePath = cacheRelativePath(context);

    spillFullPayload(context.projectId, relativePath, result);
    const label = inferToolCacheLabel(tool, args);
    const cacheManifest = registerToolCacheEntry(context, tool, relativePath, label);

    const summary: ToolResultSummary = {
      ...fullSummary,
      truncated: truncated || fullSummary.row_count > TOOL_RESULT_MAX_INLINE_ROWS
    };

    return {
      ...result,
      summary,
      items: sampled,
      data_file: relativePath,
      cache_manifest: cacheManifest,
      compacted: true
    };
  }

  if (shouldAlwaysCache(result, tool)) {
    return attachCachePointers(result, context, tool, args);
  }

  return result;
}

export function manifestPathForRequest(requestId: string): string {
  return toolCacheManifestRelativePath(requestId);
}

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DERIVED_METRIC_HISTORY_BATCH_MAX_BYTES } from "../derivedMetrics.js";
import {
  inferToolCacheLabel,
  registerToolCacheEntry,
  toolCacheDataRelativePath,
  toolCacheManifestRelativePath
} from "./toolCacheManifest.js";
import type { AgentToolContext } from "./types.js";
import { safeToolCacheFilePath } from "./toolCacheSafety.js";

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
  for (const key of ["value_num", "valueNum", "value", "val", "numeric_value"]) {
    const num = asNumber(item[key]);
    if (num !== null) {
      return num;
    }
  }
  return null;
}

function normalizedHistoryRow(item: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {
    ts: extractTimestamp(item),
    value_num: extractNumericValue(item),
    quality: typeof item.quality === "string" ? item.quality : "unknown",
    status: typeof item.status === "string" ? item.status : "unknown"
  };
  const valueText = typeof item.value_text === "string"
    ? item.value_text
    : typeof item.valueText === "string"
      ? item.valueText
      : undefined;
  if (valueText !== undefined) {
    row.value_text = valueText;
  }
  return row;
}

function historyRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    : [];
}

const PROFILE_LABEL_LIMIT = 32;
const PROFILE_LABEL_MAX_CHARS = 64;

function normalizedProfileLabel(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  if (!normalized) return "unknown";
  if (normalized.length <= PROFILE_LABEL_MAX_CHARS) {
    return normalized === "__other__" ? "__other_value__" : normalized;
  }
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
  return `${normalized.slice(0, PROFILE_LABEL_MAX_CHARS - 12)}...#${digest}`;
}

function countStrings(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const counts = new Map<string, number>();
  let other = 0;
  for (const row of rows) {
    const label = normalizedProfileLabel(row[key]);
    const existing = counts.get(label);
    if (existing !== undefined) {
      counts.set(label, existing + 1);
      continue;
    }
    if (counts.size < PROFILE_LABEL_LIMIT) {
      counts.set(label, 1);
      continue;
    }
    const largest = [...counts.keys()].sort((left, right) => left.localeCompare(right)).at(-1)!;
    if (label.localeCompare(largest) < 0) {
      other += counts.get(largest) ?? 0;
      counts.delete(largest);
      counts.set(label, 1);
    } else {
      other += 1;
    }
  }
  const result = Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
  if (other > 0) result.__other__ = other;
  return result;
}

function quantile(sorted: number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function profileHistory(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const summary = summarizeItems(rows);
  const numeric = rows
    .map(extractNumericValue)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const timestamps = rows
    .map(extractTimestamp)
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const rawIntervals = timestamps
    .slice(1)
    .map((value, index) => (value - timestamps[index]!) / 1000);
  const intervals = rawIntervals
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const medianInterval = quantile(intervals, 0.5);
  const gapThreshold = medianInterval === null ? null : medianInterval * 1.5;

  return {
    row_count: rows.length,
    time_start: summary.time_start,
    time_end: summary.time_end,
    median_interval_seconds: medianInterval,
    max_interval_seconds: intervals.length > 0 ? intervals[intervals.length - 1]! : null,
    gap_count: gapThreshold === null ? 0 : intervals.filter((value) => value > gapThreshold).length,
    duplicate_timestamp_count: rawIntervals.filter((value) => value === 0).length,
    numeric_count: numeric.length,
    numeric_min: numeric.length > 0 ? numeric[0]! : null,
    numeric_max: numeric.length > 0 ? numeric[numeric.length - 1]! : null,
    numeric_mean: numeric.length > 0 ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null,
    numeric_p05: quantile(numeric, 0.05),
    numeric_p50: quantile(numeric, 0.5),
    numeric_p95: quantile(numeric, 0.95),
    quality_counts: countStrings(rows, "quality"),
    status_counts: countStrings(rows, "status"),
    schema: {
      ts: "ISO8601 UTC string",
      value_num: "number|null",
      value_text: "string|null",
      quality: "string",
      status: "string"
    }
  };
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
  const history = result.history;
  if (Array.isArray(history) && history.length > TOOL_RESULT_MAX_INLINE_ROWS) {
    return true;
  }
  return serializeSize(result) > TOOL_RESULT_INLINE_MAX_BYTES;
}

function shouldAlwaysCache(result: Record<string, unknown>, tool: string): boolean {
  return ALWAYS_CACHE_TOOLS.has(tool) && hasCacheableItems(result);
}

function spillFullPayload(
  projectId: string,
  relativePath: string,
  payload: Record<string, unknown>,
  serializedPayload?: string
): string {
  const absolutePath = safeToolCacheFilePath(projectId, relativePath);
  const dir = path.dirname(absolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const serialized = serializedPayload ?? JSON.stringify(payload);
  writeFileSync(absolutePath, serialized, "utf8");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

/**
 * Compact large tool results: downsample items[], summarize, spill full payload to repository.
 */
function cacheRelativePath(context: AgentToolContext): string {
  return toolCacheDataRelativePath(context.requestId, context.toolCallId);
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

function derivedMetricIdentity(value: Record<string, unknown>): {
  label: string | undefined;
  dataKey: string | undefined;
} {
  const instance = typeof value.instance === "object" && value.instance !== null
    ? value.instance as Record<string, unknown>
    : value;
  const metricKey = typeof instance.metricKey === "string" ? instance.metricKey.trim() : "";
  const entityId = typeof instance.entityId === "string" ? instance.entityId.trim() : "";
  const instanceId = typeof instance.instanceId === "string" ? instance.instanceId.trim() : "";
  return {
    label: metricKey && entityId ? `${metricKey}:${entityId}` : instanceId || undefined,
    dataKey: instanceId || undefined
  };
}

function compactDerivedMetricBatch(
  result: Record<string, unknown>,
  context: AgentToolContext,
  tool: string
): Record<string, unknown> | null {
  if (tool !== "derived_metric_history_prepare" || !Array.isArray(result.series)) {
    return null;
  }
  const series = result.series.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
  );
  const normalizedSeries = series.map((entry) => {
    const normalizedHistory = historyRows(entry.history).map(normalizedHistoryRow);
    const { history: _history, ...metadata } = entry;
    return { ...metadata, history: normalizedHistory };
  });
  const payload = { ...result, series: normalizedSeries };
  const serializedPayload = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(serializedPayload, "utf8");
  const configuredMaxBytes = Number(process.env.TOOL_RESULT_DERIVED_HISTORY_MAX_BYTES);
  const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
    ? Math.min(Math.trunc(configuredMaxBytes), DERIVED_METRIC_HISTORY_BATCH_MAX_BYTES)
    : DERIVED_METRIC_HISTORY_BATCH_MAX_BYTES;
  if (payloadBytes > maxBytes) {
    return {
      error: "derived_metric_history_too_large",
      totalRows: normalizedSeries.reduce((sum, entry) => sum + historyRows(entry.history).length, 0),
      actualBytes: payloadBytes,
      maxBytes,
      suggestion: "Use a shorter time range or fewer metric instances."
    };
  }
  const relativePath = cacheRelativePath(context);
  const sha256 = spillFullPayload(context.projectId, relativePath, payload, serializedPayload);
  let cacheManifest = toolCacheManifestRelativePath(context.requestId);
  const profiles = normalizedSeries.map((entry) => {
    const identity = derivedMetricIdentity(entry);
    cacheManifest = registerToolCacheEntry(
      context,
      tool,
      relativePath,
      identity.label,
      identity.dataKey
    );
    const { history, ...metadata } = entry;
    return {
      ...metadata,
      label: identity.label,
      data_key: identity.dataKey,
      data_file: relativePath,
      cache_manifest: toolCacheManifestRelativePath(context.requestId),
      sha256,
      cached_complete: true,
      inline_rows: 0,
      ...profileHistory(historyRows(history))
    };
  });
  const { series: _series, ...metadata } = result;
  return {
    ...metadata,
    series: profiles,
    series_count: profiles.length,
    data_file: relativePath,
    cache_manifest: cacheManifest,
    sha256,
    compacted: true
  };
}

export function compactToolResult(
  result: Record<string, unknown>,
  context: AgentToolContext,
  tool = "tool",
  args: Record<string, unknown> = {}
): Record<string, unknown> {
  const derivedMetricBatch = compactDerivedMetricBatch(result, context, tool);
  if (derivedMetricBatch) {
    return derivedMetricBatch;
  }

  if (shouldCompact(result)) {
    const fullHistory = historyRows(result.history);
    if (fullHistory.length > 0) {
      const normalizedHistory = fullHistory.map(normalizedHistoryRow);
      const { history: _history, ...inlineResult } = result;
      const relativePath = cacheRelativePath(context);
      const sha256 = spillFullPayload(context.projectId, relativePath, {
        ...inlineResult,
        history: normalizedHistory
      });
      const identity = derivedMetricIdentity(result);
      const label = identity.label ?? inferToolCacheLabel(tool, args);
      const cacheManifest = registerToolCacheEntry(
        context,
        tool,
        relativePath,
        label,
        identity.dataKey
      );
      return {
        ...inlineResult,
        summary: {
          ...summarizeItems(normalizedHistory),
          truncated: false,
          cached_complete: true,
          inline_rows: 0
        },
        profile: profileHistory(normalizedHistory),
        data_file: relativePath,
        cache_manifest: cacheManifest,
        sha256,
        compacted: true
      };
    }

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

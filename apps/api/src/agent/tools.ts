import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatToolDefinition } from "../providers.js";
import { compactToolResult } from "./toolResultCompaction.js";
import type { AgentTool, AgentToolContext, AgentToolSchema } from "./types.js";
import { localHistoryToolDecision } from "./localHistoryRequestPolicy.js";

export const TOOL_LOG_MAX_BYTES = Number(process.env.TOOL_LOG_MAX_BYTES ?? 10 * 1024 * 1024);
const TOOL_LOG_STRING_MAX_CHARS = 1_000;
const TOOL_LOG_FLUSH_DELAY_MS = 25;
const SAFE_AUDIT_ARGUMENT_KEYS = new Set([
  "instanceId",
  "instanceIds",
  "metricKey",
  "entityId",
  "mode",
  "from",
  "to",
  "limit",
  "order"
]);
const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|authorization|credential|password|secret|token)/i;

export interface ToolDispatchResult {
  tool: string;
  result: Record<string, unknown>;
}

export interface ToolCallLogEntry {
  id: string;
  tool: string;
  category: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  argsByteCount: number;
  resultByteCount: number;
  error: string | null;
  startedAt: string;
  durationMs: number;
  projectId: string;
  conversationId: string;
  requestId: string;
  userId: string;
}

function serializedByteCount(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

function boundedString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, TOOL_LOG_STRING_MAX_CHARS) : fallback;
}

function sanitizedError(value: string): string {
  return value
    .replace(
      /"(api[_-]?key|authorization|credential|password|secret|token)"\s*:\s*"(?:\\.|[^"\\])*"/gi,
      '"$1":"[redacted]"'
    )
    .replace(
      /'(api[_-]?key|authorization|credential|password|secret|token)'\s*:\s*'(?:\\.|[^'\\])*'/gi,
      "'$1':'[redacted]'"
    )
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@")
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;&]+/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|authorization|credential|password|secret|token)\s*[:=]\s*)[^\s,;&]+/gi, "$1[redacted]")
    .replace(/([?&](?:api[_-]?key|authorization|credential|password|secret|token)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, TOOL_LOG_STRING_MAX_CHARS);
}

function boundedAuditIdentifier(value: unknown, fallback = ""): string {
  return typeof value === "string" ? sanitizedError(value) : fallback;
}

function scalarType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function sanitizedArgs(args: Record<string, unknown>): Record<string, unknown> {
  const isStoredSummary = args.kind === "argument_summary";
  const sourceValues = isStoredSummary && typeof args.values === "object" && args.values !== null
    ? args.values as Record<string, unknown>
    : args;
  const sourceKeys = isStoredSummary && Array.isArray(args.keys)
    ? args.keys.filter((key): key is string => typeof key === "string")
    : Object.keys(args);
  const keys = Array.from(new Set(sourceKeys.map((key) => key.slice(0, 200)))).sort().slice(0, 100);
  const values: Record<string, unknown> = {};
  const redactedKeys: string[] = [];
  for (const key of keys) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redactedKeys.push(key);
      continue;
    }
    if (!SAFE_AUDIT_ARGUMENT_KEYS.has(key)) continue;
    const value = sourceValues[key];
    if (typeof value === "string") values[key] = boundedString(value);
    if (typeof value === "number" && Number.isFinite(value)) values[key] = value;
    if (typeof value === "boolean") values[key] = value;
    if (key === "instanceIds" && Array.isArray(value)) {
      values[key] = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => boundedString(entry))
        .slice(0, 32);
    }
  }
  const existingTypes = isStoredSummary && typeof args.value_types === "object" && args.value_types !== null
    ? args.value_types as Record<string, unknown>
    : null;
  const redactedFromStored = isStoredSummary && Array.isArray(args.redacted_keys)
    ? args.redacted_keys.filter((key): key is string => typeof key === "string").map((key) => key.slice(0, 200)).slice(0, 100)
    : [];
  return {
    kind: "argument_summary",
    keys,
    value_types: Object.fromEntries(keys.map((key) => [
      key,
      typeof existingTypes?.[key] === "string" ? boundedString(existingTypes[key], "unknown") : scalarType(sourceValues[key])
    ])),
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...([...new Set([...redactedKeys, ...redactedFromStored])].length > 0
      ? { redacted_keys: [...new Set([...redactedKeys, ...redactedFromStored])] }
      : {})
  };
}

function safePointer(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TOOL_LOG_STRING_MAX_CHARS) return undefined;
  return trimmed;
}

function rowCount(result: Record<string, unknown>): number | undefined {
  if (typeof result.row_count === "number" && Number.isFinite(result.row_count) && result.row_count >= 0) {
    return Math.floor(result.row_count);
  }
  const summary = result.summary;
  if (typeof summary === "object" && summary !== null) {
    const count = (summary as Record<string, unknown>).row_count;
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) return Math.floor(count);
  }
  for (const key of ["items", "history"] as const) {
    if (Array.isArray(result[key])) return result[key].length;
  }
  return undefined;
}

function sanitizedStatistics(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of [
    "row_count",
    "truncated",
    "numeric_min",
    "numeric_max",
    "numeric_mean",
    "numeric_p05",
    "numeric_p50",
    "numeric_p95",
    "time_start",
    "time_end"
  ]) {
    const candidate = source[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) output[key] = candidate;
    if (typeof candidate === "boolean") output[key] = candidate;
    if (typeof candidate === "string") output[key] = boundedString(candidate);
    if (candidate === null) output[key] = null;
  }
  for (const key of ["quality_counts", "status_counts"]) {
    const candidate = source[key];
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) continue;
    const counts: Record<string, number> = {};
    for (const [label, count] of Object.entries(candidate as Record<string, unknown>).slice(0, 50)) {
      if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
        counts[label.slice(0, 100)] = count;
      }
    }
    if (Object.keys(counts).length > 0) output[key] = counts;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizedPointers(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const output: Record<string, string> = {};
  for (const key of ["data_file", "cache_manifest", "output_file"]) {
    const pointer = safePointer((value as Record<string, unknown>)[key]);
    if (pointer) output[key] = pointer;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function fixedSha256(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : undefined;
}

function mergeCounts(target: Record<string, number>, value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  for (const [label, count] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      const safeLabel = label.slice(0, 100);
      target[safeLabel] = (target[safeLabel] ?? 0) + count;
    }
  }
}

function sanitizedBatchSeries(result: Record<string, unknown>): Record<string, unknown> | undefined {
  const sourceResult = typeof result.batch === "object" && result.batch !== null && !Array.isArray(result.batch)
    ? result.batch as Record<string, unknown>
    : result;
  if (!Array.isArray(sourceResult.series)) return undefined;
  const series: Array<Record<string, unknown>> = [];
  const qualityCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let totalRows = 0;
  let timeStart: string | null = null;
  let timeEnd: string | null = null;
  for (const entry of sourceResult.series.slice(0, 32)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const source = entry as Record<string, unknown>;
    const statistics = sanitizedStatistics(source.summary) ?? {};
    const countCandidate = source.row_count ?? source.sample_count ?? statistics.row_count;
    const count = typeof countCandidate === "number" && Number.isFinite(countCandidate) && countCandidate >= 0
      ? Math.floor(countCandidate)
      : 0;
    const start = safePointer(source.time_start ?? statistics.time_start);
    const end = safePointer(source.time_end ?? statistics.time_end);
    const entryQuality = source.quality_counts ?? statistics.quality_counts;
    const entryStatus = source.status_counts ?? statistics.status_counts;
    mergeCounts(qualityCounts, entryQuality);
    mergeCounts(statusCounts, entryStatus);
    totalRows += count;
    if (start && (!timeStart || start < timeStart)) timeStart = start;
    if (end && (!timeEnd || end > timeEnd)) timeEnd = end;
    const sha256 = fixedSha256(source.sha256);
    const dataFile = safePointer(source.data_file);
    series.push({
      ...(typeof source.label === "string" ? { label: boundedString(source.label) } : {}),
      row_count: count,
      ...(start ? { time_start: start } : {}),
      ...(end ? { time_end: end } : {}),
      ...(Object.keys(entryQuality && typeof entryQuality === "object" ? entryQuality as object : {}).length > 0
        ? { quality_counts: sanitizedStatistics({ quality_counts: entryQuality })?.quality_counts }
        : {}),
      ...(Object.keys(entryStatus && typeof entryStatus === "object" ? entryStatus as object : {}).length > 0
        ? { status_counts: sanitizedStatistics({ status_counts: entryStatus })?.status_counts }
        : {}),
      ...(sha256 ? { sha256 } : {}),
      ...(dataFile ? { data_file: dataFile } : {})
    });
  }
  if (series.length === 0) return undefined;
  const declaredSeriesCount = typeof sourceResult.series_count === "number" && Number.isFinite(sourceResult.series_count)
    ? Math.max(0, Math.floor(sourceResult.series_count))
    : series.length;
  return {
    series_count: declaredSeriesCount,
    row_count: totalRows,
    ...(timeStart ? { time_start: timeStart } : {}),
    ...(timeEnd ? { time_end: timeEnd } : {}),
    ...(Object.keys(qualityCounts).length > 0 ? { quality_counts: qualityCounts } : {}),
    ...(Object.keys(statusCounts).length > 0 ? { status_counts: statusCounts } : {}),
    series
  };
}

function sanitizedResult(result: Record<string, unknown>): Record<string, unknown> {
  const pointers: Record<string, string> = {};
  for (const [sourceKey, outputKey] of [
    ["data_file", "data_file"],
    ["cache_manifest", "cache_manifest"],
    ["outputFile", "output_file"]
  ] as const) {
    const pointer = safePointer(result[sourceKey]);
    if (pointer) pointers[outputKey] = pointer;
  }
  const count = rowCount(result);
  const statistics = sanitizedStatistics(result.summary);
  const existingPointers = sanitizedPointers(result.pointers);
  const batch = sanitizedBatchSeries(result);
  const sha256 = fixedSha256(result.sha256);
  const sourceKeys = result.kind === "result_summary" && Array.isArray(result.keys)
    ? result.keys.filter((key): key is string => typeof key === "string")
    : Object.keys(result);
  return {
    kind: "result_summary",
    keys: Array.from(new Set(sourceKeys.map((key) => key.slice(0, 200)))).sort().slice(0, 100),
    ...(count !== undefined ? { row_count: count } : {}),
    ...(result.compacted === true ? { compacted: true } : {}),
    ...(statistics ? { summary: statistics } : {}),
    ...(batch ? { batch } : {}),
    ...(sha256 ? { sha256 } : {}),
    ...(Object.keys(pointers).length > 0 ? { pointers } : existingPointers ? { pointers: existingPointers } : {}),
    ...(result.error !== undefined || result.has_error === true ? { has_error: true } : {})
  };
}

function validStoredEntry(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  private readonly logs: ToolCallLogEntry[] = [];
  private logSequence = 0;
  private maxLogs = 2000;
  private maxLogBytes = TOOL_LOG_MAX_BYTES;
  private dataDir: string | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  enableLogging(dataDir: string, maxLogs = 2000, maxLogBytes = TOOL_LOG_MAX_BYTES): void {
    this.dataDir = dataDir;
    this.maxLogs = Math.max(1, maxLogs);
    this.maxLogBytes = Math.max(1_024, maxLogBytes);
    this.loadLogs();
  }

  list(): AgentTool[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  schemas(): AgentToolSchema[] {
    return this.list().map((tool) => tool.schema);
  }

  toOpenAIToolDefinitions(): ChatToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.schema.name,
        description: tool.schema.description,
        parameters: tool.schema.parameters
      }
    }));
  }

  async dispatch(name: string, args: Record<string, unknown>, context: AgentToolContext): Promise<ToolDispatchResult> {
    const tool = this.tools.get(name);
    const startedAt = Date.now();

    if (!tool) {
      const result: ToolDispatchResult = { tool: name, result: { error: `Unknown tool: ${name}` } };
      this.recordLog({ tool: name, category: "unknown", args, result: result.result, error: `Unknown tool: ${name}`, startedAt, context });
      return result;
    }

    const localHistoryDecision = localHistoryToolDecision(name, args, context);
    if (!localHistoryDecision.allowed) {
      const error = localHistoryDecision.error;
      const result: ToolDispatchResult = {
        tool: name,
        result: {
          error,
          tool: name,
          message: error === "history_dataset_not_prepared"
            ? "The local history producer did not return a valid request-local dataset; execute_code was not started."
            : "This request has local derived history attached. Use execute_code for analysis; repository and arbitrary execution tools are disabled for the rest of this request."
        }
      };
      this.recordLog({ tool: name, category: tool.category, args, result: result.result, error, startedAt, context });
      return result;
    }

    try {
      const rawResult = await tool.run(args, context);
      const result = compactToolResult(rawResult, context, name, args);
      this.recordLog({ tool: name, category: tool.category, args, result, error: null, startedAt, context });
      return { tool: name, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Tool execution failed.";
      const result: ToolDispatchResult = { tool: name, result: { error: errorMessage } };
      this.recordLog({ tool: name, category: tool.category, args, result: result.result, error: errorMessage, startedAt, context });
      return result;
    }
  }

  /** Return recent log entries (newest first), optionally filtered by project or tool. */
  queryLogs(filter?: { projectId?: string; tool?: string; limit?: number }): ToolCallLogEntry[] {
    let results = [...this.logs].reverse();
    if (filter?.projectId) results = results.filter((entry) => entry.projectId === filter.projectId);
    if (filter?.tool) results = results.filter((entry) => entry.tool === filter.tool);
    return results.slice(0, filter?.limit ?? 100);
  }

  logCount(): number {
    return this.logs.length;
  }

  /** Deterministic shutdown/test hook for the otherwise batched audit writer. */
  async flushLogs(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.enqueuePersist();
    }
    await this.persistChain;
  }

  private recordLog(params: {
    tool: string;
    category: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    error: string | null;
    startedAt: number;
    context: AgentToolContext;
  }): void {
    this.logSequence += 1;
    const entry: ToolCallLogEntry = {
      id: `tclog_${String(this.logSequence).padStart(8, "0")}`,
      tool: boundedAuditIdentifier(params.tool, "unknown"),
      category: boundedAuditIdentifier(params.category, "unknown"),
      args: sanitizedArgs(params.args),
      result: sanitizedResult(params.result),
      argsByteCount: serializedByteCount(params.args),
      resultByteCount: serializedByteCount(params.result),
      error: params.error ? sanitizedError(params.error) : null,
      startedAt: new Date(params.startedAt).toISOString(),
      durationMs: Date.now() - params.startedAt,
      projectId: boundedAuditIdentifier(params.context.projectId),
      conversationId: boundedAuditIdentifier(params.context.conversationId),
      requestId: boundedAuditIdentifier(params.context.requestId),
      userId: boundedAuditIdentifier(params.context.userId)
    };
    this.logs.push(entry);
    this.enforceBounds();
    this.schedulePersist();
  }

  private enforceBounds(): void {
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    while (this.logs.length > 1 && serializedByteCount(this.logs) > this.maxLogBytes) {
      this.logs.shift();
    }
    if (this.logs.length === 1 && serializedByteCount(this.logs) > this.maxLogBytes) {
      this.logs[0] = this.minimalOversizedEntry(this.logs[0]!);
    }
    if (serializedByteCount(this.logs) > this.maxLogBytes) {
      this.logs.length = 0;
    }
  }

  private minimalOversizedEntry(entry: ToolCallLogEntry): ToolCallLogEntry {
    return {
      id: entry.id,
      tool: "[oversized]",
      category: "audit",
      args: { kind: "argument_summary", keys: [], oversized: true },
      result: { kind: "result_summary", keys: [], oversized: true },
      argsByteCount: entry.argsByteCount,
      resultByteCount: entry.resultByteCount,
      error: entry.error ? "[redacted oversized error]" : null,
      startedAt: entry.startedAt,
      durationMs: entry.durationMs,
      projectId: "",
      conversationId: "",
      requestId: "",
      userId: ""
    };
  }

  private schedulePersist(): void {
    if (!this.dataDir || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.enqueuePersist();
    }, TOOL_LOG_FLUSH_DELAY_MS);
    this.flushTimer.unref?.();
  }

  private enqueuePersist(): void {
    if (!this.dataDir) return;
    const filePath = this.logPath();
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(this.logs);
    this.persistChain = this.persistChain.then(async () => {
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(temporaryPath, payload, "utf8");
        await rename(temporaryPath, filePath);
      } catch {
        try {
          await unlink(temporaryPath);
        } catch {
          // best effort
        }
      }
    });
  }

  private loadLogs(): void {
    if (!this.dataDir) return;
    this.logs.length = 0;
    try {
      const filePath = this.logPath();
      if (!existsSync(filePath)) return;
      if (statSync(filePath).size > this.maxLogBytes) {
        this.archiveOversizedLog(filePath);
        return;
      }
      const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      if (!Array.isArray(parsed)) return;
      let maxSeq = 0;
      for (const value of parsed) {
        if (!validStoredEntry(value)) continue;
        const id = boundedString(value.id);
        const match = /^tclog_(\d+)$/.exec(id);
        if (match) {
          maxSeq = Math.max(maxSeq, Number(match[1]!));
        } else {
          maxSeq += 1;
        }
        const rawArgs = validStoredEntry(value.args) ? value.args : {};
        const rawResult = validStoredEntry(value.result) ? value.result : {};
        this.logs.push({
          id: match ? id : `tclog_${String(maxSeq).padStart(8, "0")}`,
          tool: boundedAuditIdentifier(value.tool, "unknown"),
          category: boundedAuditIdentifier(value.category, "unknown"),
          args: sanitizedArgs(rawArgs),
          result: sanitizedResult(rawResult),
          argsByteCount: typeof value.argsByteCount === "number" ? value.argsByteCount : serializedByteCount(rawArgs),
          resultByteCount: typeof value.resultByteCount === "number" ? value.resultByteCount : serializedByteCount(rawResult),
          error: typeof value.error === "string" ? sanitizedError(value.error) : null,
          startedAt: boundedString(value.startedAt, new Date(0).toISOString()),
          durationMs: typeof value.durationMs === "number" && Number.isFinite(value.durationMs) ? value.durationMs : 0,
          projectId: boundedAuditIdentifier(value.projectId),
          conversationId: boundedAuditIdentifier(value.conversationId),
          requestId: boundedAuditIdentifier(value.requestId),
          userId: boundedAuditIdentifier(value.userId)
        });
      }
      this.logSequence = maxSeq;
      this.enforceBounds();
    } catch {
      // A corrupt audit file is ignored; tool execution remains available.
    }
  }

  private archiveOversizedLog(filePath: string): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archivePath = `${filePath}.oversized-${stamp}.bak`;
    try {
      renameSync(filePath, archivePath);
    } catch {
      // If archival is unavailable, skip loading rather than reading a huge file.
    }
  }

  private logPath(): string {
    return path.join(this.dataDir!, "tool_call_logs.json");
  }
}

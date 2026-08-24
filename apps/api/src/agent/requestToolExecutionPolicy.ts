const DEDUPLICATED_READONLY_TOOLS = new Set([
  "derived_metric_read"
]);

export interface DeduplicatedToolResult<T> {
  value: T;
  reused: boolean;
}

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedArgs(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : {};
}

function normalizedTimestamp(value: unknown): string | undefined {
  const text = normalizedText(value);
  if (!text) return undefined;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
}

function normalizedLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 720;
}

/**
 * Canonicalize only arguments that derived_metric_read actually observes. This
 * deliberately folds explicit defaults and equivalent ISO-8601 offsets while
 * preserving materially different metric identities and history ranges.
 */
export function canonicalDerivedMetricReadArgs(args: Record<string, unknown>): string {
  const instanceId = normalizedText(args.instanceId);
  const modeText = normalizedText(args.mode);
  const mode = modeText === "history" || modeText === "both" ? modeText : "latest";
  const normalized: Record<string, unknown> = instanceId
    ? { instanceId, mode }
    : {
        entityId: normalizedText(args.entityId),
        metricKey: normalizedText(args.metricKey),
        mode
      };

  if (mode === "history" || mode === "both") {
    const from = normalizedTimestamp(args.from);
    const to = normalizedTimestamp(args.to);
    if (from) normalized.from = from;
    if (to) normalized.to = to;
    normalized.limit = normalizedLimit(args.limit);
    normalized.order = normalizedText(args.order) === "desc" ? "desc" : "asc";
  }

  return JSON.stringify(normalized);
}

export function canonicalDerivedMetricHistoryPrepareArgs(args: Record<string, unknown>): string {
  const instanceIds = Array.isArray(args.instanceIds)
    ? [...new Set(args.instanceIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean))]
        .sort()
    : [];
  const normalized: Record<string, unknown> = { instanceIds };
  const from = normalizedTimestamp(args.from);
  const to = normalizedTimestamp(args.to);
  if (from) normalized.from = from;
  if (to) normalized.to = to;
  return JSON.stringify(normalized);
}

function canonicalReadonlyToolArgs(tool: string, args: Record<string, unknown>): string {
  return tool === "derived_metric_history_prepare"
    ? canonicalDerivedMetricHistoryPrepareArgs(args)
    : canonicalDerivedMetricReadArgs(args);
}

function hasDerivedMetricReadIdentity(args: Record<string, unknown>): boolean {
  return Boolean(
    normalizedText(args.instanceId)
    || (normalizedText(args.metricKey) && normalizedText(args.entityId))
  );
}

function nestedResult(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record.result === "object" && record.result !== null
    ? record.result as Record<string, unknown>
    : record;
}

function successfulToolResult(value: unknown): boolean {
  const result = nestedResult(value);
  if (!result || (result.error !== undefined && result.error !== null)) return false;
  if (typeof result.exitCode === "number" && result.exitCode !== 0) return false;
  return true;
}

function successfulHistoryChartExecution(value: unknown): boolean {
  if (!successfulToolResult(value)) return false;
  const result = nestedResult(value);
  return Boolean(result && Array.isArray(result.generatedImages) && result.generatedImages.length > 0);
}

function decorateNestedResult<T>(value: T, additions: Record<string, unknown>): T {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.result === "object" && record.result !== null) {
    return { ...record, result: { ...(record.result as Record<string, unknown>), ...additions } } as T;
  }
  return { ...record, ...additions } as T;
}

function completedExecuteCodeSummary<T>(value: T): T {
  const result = nestedResult(value) ?? {};
  const summary: Record<string, unknown> = {
    already_completed: true,
    reused_successful_execution: true,
    ...(typeof result.stdout === "string" ? { stdout: result.stdout.slice(0, 2_000) } : {}),
    ...(Array.isArray(result.generatedImages) ? { generatedImages: result.generatedImages.slice(0, 32) } : {}),
    ...(Array.isArray(result.generatedDownloads) ? { generatedDownloads: result.generatedDownloads.slice(0, 32) } : {})
  };
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).result === "object") {
    const outer = value as Record<string, unknown>;
    return { ...outer, result: summary } as T;
  }
  return summary as T;
}

function completedHistoryPrepareSummary<T>(value: T): T {
  const result = nestedResult(value) ?? {};
  const summary: Record<string, unknown> = {
    history_prepare_already_completed: true,
    instruction: "Reuse the prepared data and continue with execute_code; do not read history again.",
    ...(typeof result.data_file === "string" ? { data_file: result.data_file } : {}),
    ...(typeof result.cache_manifest === "string" ? { cache_manifest: result.cache_manifest } : {}),
    ...(typeof result.series_count === "number" ? { series_count: result.series_count } : {}),
    ...(typeof result.summary === "object" && result.summary !== null ? { summary: result.summary } : {})
  };
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).result === "object") {
    const outer = value as Record<string, unknown>;
    return { ...outer, result: summary } as T;
  }
  return summary as T;
}

/** Request-scoped promise cache. A promise is installed before execution so
 * identical calls in the same parallel batch and in later iterations share it.
 */
export class RequestToolExecutionPolicy {
  private readonly calls = new Map<string, Promise<unknown>>();
  private historyPrepareInFlight: { key: string; promise: Promise<unknown> } | null = null;
  private successfulHistoryPrepare: { key: string; value: unknown } | null = null;
  private executeCodeAttempts = 0;
  private executeCodeInFlight: Promise<unknown> | null = null;
  private successfulExecuteCode: unknown = null;
  private lastExecuteCodeFailure: unknown = null;
  private historyDatasetReady = false;

  /** Mark a compacted direct history read as ready for the guarded execute flow. */
  markHistoryDatasetReady(): void {
    this.historyDatasetReady = true;
  }

  private isFailedResult(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    if (record.error !== undefined && record.error !== null) return true;
    const nested = record.result;
    return typeof nested === "object"
      && nested !== null
      && (nested as Record<string, unknown>).error !== undefined
      && (nested as Record<string, unknown>).error !== null;
  }

  async run<T>(
    tool: string,
    args: unknown,
    execute: () => Promise<T>
  ): Promise<DeduplicatedToolResult<T>> {
    const safeArgs = normalizedArgs(args);
    if (tool === "derived_metric_history_prepare") {
      return this.runHistoryPrepare(safeArgs, execute);
    }
    if (tool === "execute_code") {
      return this.runExecuteCode(execute);
    }
    if (!DEDUPLICATED_READONLY_TOOLS.has(tool)) {
      return { value: await execute(), reused: false };
    }
    // Invalid/unknown identities must reach the tool independently so each call
    // receives its own validation result rather than sharing an accidental key.
    if (tool === "derived_metric_read" && !hasDerivedMetricReadIdentity(safeArgs)) {
      return { value: await execute(), reused: false };
    }

    const key = `${tool}\u0000${canonicalReadonlyToolArgs(tool, safeArgs)}`;
    const existing = this.calls.get(key) as Promise<T> | undefined;
    if (existing) {
      return { value: await existing, reused: true };
    }

    const pending = execute();
    this.calls.set(key, pending);
    try {
      const value = await pending;
      if (this.isFailedResult(value) && this.calls.get(key) === pending) {
        this.calls.delete(key);
      }
      return { value, reused: false };
    } catch (error) {
      if (this.calls.get(key) === pending) {
        this.calls.delete(key);
      }
      throw error;
    }
  }

  private async runHistoryPrepare<T>(
    args: Record<string, unknown>,
    execute: () => Promise<T>
  ): Promise<DeduplicatedToolResult<T>> {
    const key = canonicalDerivedMetricHistoryPrepareArgs(args);
    if (this.successfulHistoryPrepare) {
      return {
        value: this.successfulHistoryPrepare.key === key
          ? this.successfulHistoryPrepare.value as T
          : completedHistoryPrepareSummary(this.successfulHistoryPrepare.value as T),
        reused: true
      };
    }
    if (this.historyPrepareInFlight) {
      const inFlight = this.historyPrepareInFlight;
      const value = await inFlight.promise as T;
      return {
        value: successfulToolResult(value) && inFlight.key !== key
          ? completedHistoryPrepareSummary(value)
          : value,
        reused: true
      };
    }

    const pending = execute();
    this.historyPrepareInFlight = { key, promise: pending };
    try {
      const value = await pending;
      if (successfulToolResult(value)) {
        this.successfulHistoryPrepare = { key, value };
      }
      return { value, reused: false };
    } finally {
      if (this.historyPrepareInFlight?.promise === pending) this.historyPrepareInFlight = null;
    }
  }

  private async runExecuteCode<T>(execute: () => Promise<T>): Promise<DeduplicatedToolResult<T>> {
    // Let sibling calls in the same provider batch register a history prepare
    // before deciding whether this execute_code belongs to that guarded flow.
    await Promise.resolve();
    if (this.historyPrepareInFlight) {
      try {
        await this.historyPrepareInFlight.promise;
      } catch {
        // The execute call will run normally when preparation failed.
      }
    }
    if (!this.successfulHistoryPrepare && !this.historyDatasetReady) {
      return { value: await execute(), reused: false };
    }
    if (this.successfulExecuteCode !== null) {
      return { value: completedExecuteCodeSummary(this.successfulExecuteCode as T), reused: true };
    }
    if (this.executeCodeInFlight) {
      const value = await this.executeCodeInFlight as T;
      return {
        value: successfulHistoryChartExecution(value) ? completedExecuteCodeSummary(value) : value,
        reused: true
      };
    }
    if (this.executeCodeAttempts >= 2 && this.lastExecuteCodeFailure !== null) {
      return {
        value: decorateNestedResult(this.lastExecuteCodeFailure as T, {
          retry_exhausted: true,
          already_completed: false
        }),
        reused: true
      };
    }

    this.executeCodeAttempts += 1;
    const pending = execute();
    this.executeCodeInFlight = pending;
    try {
      const value = await pending;
      if (successfulHistoryChartExecution(value)) {
        this.successfulExecuteCode = value;
      } else {
        this.lastExecuteCodeFailure = value;
      }
      return { value, reused: false };
    } catch (error) {
      this.lastExecuteCodeFailure = { error: error instanceof Error ? error.message : "execute_code_failed" };
      throw error;
    } finally {
      if (this.executeCodeInFlight === pending) this.executeCodeInFlight = null;
    }
  }
}

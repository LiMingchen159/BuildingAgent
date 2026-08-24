export interface HistoryGuardToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface HistoryGuardProducerResult extends HistoryGuardToolCall {
  result: Record<string, unknown>;
}

type HistoryGuardState = "ordinary" | "protected-intent" | "dataset-ready";

export function isLocalHistoryProducerCall(call: HistoryGuardToolCall): boolean {
  if (call.name === "derived_metric_history_prepare") return true;
  if (call.name !== "derived_metric_read") return false;
  const mode = typeof call.args.mode === "string" ? call.args.mode.trim().toLowerCase() : "latest";
  return mode === "history" || mode === "both";
}

function hasLocalDatasetPointer(result: Record<string, unknown>): boolean {
  return result.error === undefined
    && result.compacted === true
    && typeof result.data_file === "string"
    && result.data_file.startsWith("outputs/.tool_cache/")
    && typeof result.cache_manifest === "string"
    && result.cache_manifest.startsWith("outputs/.tool_cache/");
}

/** Per-turn state machine. It never relies on process-global request maps or manifest existence. */
export class RequestHistoryExecutionGuard {
  private state: HistoryGuardState = "ordinary";
  private failClosed = false;
  private currentBatchRequiresDataset = false;

  observeBatch(calls: HistoryGuardToolCall[]): void {
    const hasProducer = calls.some(isLocalHistoryProducerCall);
    this.currentBatchRequiresDataset = hasProducer && calls.some((call) => call.name === "execute_code");
    if (this.currentBatchRequiresDataset) {
      this.failClosed = true;
    }
    if (this.state === "ordinary" && hasProducer) {
      this.state = "protected-intent";
    }
  }

  completeProducerBatch(results: HistoryGuardProducerResult[]): void {
    if (results.length === 0 || this.state === "dataset-ready") return;
    if (results.some((entry) => entry.result.error !== undefined)) {
      this.failClosed = true;
      this.state = "protected-intent";
      this.currentBatchRequiresDataset = false;
      return;
    }
    if (results.some((entry) => hasLocalDatasetPointer(entry.result))) {
      this.state = "dataset-ready";
      this.currentBatchRequiresDataset = false;
      return;
    }
    this.state = this.failClosed || this.currentBatchRequiresDataset ? "protected-intent" : "ordinary";
    this.currentBatchRequiresDataset = false;
  }

  contextFields(): { localHistoryMode?: true; localHistoryDatasetReady?: true } {
    if (this.state === "dataset-ready") {
      return { localHistoryMode: true, localHistoryDatasetReady: true };
    }
    if (this.state === "protected-intent") {
      return { localHistoryMode: true };
    }
    return {};
  }
}

import type { AgentToolContext } from "./types.js";

const READY_ALLOWED_TOOLS = new Set([
  "dashboard_create",
  "derived_metric_lookup",
  "execute_code",
  "session_summary"
]);

export type LocalHistoryToolDecision =
  | { allowed: true }
  | { allowed: false; error: "history_dataset_not_prepared" | "tool_blocked_during_local_history_analysis" };

/** Stateless execution allowlist; turn-local state is supplied by AgentRuntime through context. */
export function localHistoryToolDecision(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext
): LocalHistoryToolDecision {
  if (context.localHistoryMode !== true) {
    return { allowed: true };
  }

  const datasetReady = context.localHistoryDatasetReady === true;
  if (name === "execute_code") {
    return datasetReady
      ? { allowed: true }
      : { allowed: false, error: "history_dataset_not_prepared" };
  }
  if (name === "derived_metric_read") {
    const mode = typeof args.mode === "string" ? args.mode.trim().toLowerCase() : "latest";
    if (mode === "latest") return { allowed: true };
    return datasetReady
      ? { allowed: false, error: "tool_blocked_during_local_history_analysis" }
      : { allowed: true };
  }
  if (name === "derived_metric_history_prepare") {
    return datasetReady
      ? { allowed: false, error: "tool_blocked_during_local_history_analysis" }
      : { allowed: true };
  }
  return READY_ALLOWED_TOOLS.has(name)
    ? { allowed: true }
    : { allowed: false, error: "tool_blocked_during_local_history_analysis" };
}

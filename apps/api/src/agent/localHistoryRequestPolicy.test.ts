import { describe, expect, it } from "vitest";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool, AgentToolContext } from "./types.js";

function tool(name: string): AgentTool {
  return {
    name,
    category: "utility",
    description: name,
    schema: { name, description: name, parameters: { type: "object", properties: {} } },
    async run(args) {
      return { ran: true, mode: args.mode ?? null };
    }
  };
}

function context(ready: boolean): AgentToolContext {
  return {
    projectId: "project_policy",
    userId: "user_ada",
    requestId: "req_policy",
    conversationId: "conv_policy",
    canConfigure: false,
    messages: [],
    localHistoryMode: true,
    ...(ready ? { localHistoryDatasetReady: true } : {})
  };
}

describe("local history request policy", () => {
  it("uses a stateless allowlist and blocks every repository or execution bypass", async () => {
    const registry = new AgentToolRegistry();
    for (const name of [
      "execute_code",
      "derived_metric_read",
      "derived_metric_history_prepare",
      "terminal",
      "read_file",
      "search_files",
      "write_file",
      "process_start",
      "process_status",
      "process_list",
      "feedback_implement",
      "feedback_run_playbook"
    ]) {
      registry.register(tool(name));
    }

    for (const name of [
      "terminal",
      "read_file",
      "search_files",
      "write_file",
      "process_start",
      "process_status",
      "process_list",
      "feedback_implement",
      "feedback_run_playbook",
      "derived_metric_history_prepare"
    ]) {
      const result = await registry.dispatch(name, {}, context(true));
      expect(result.result).toMatchObject({ error: "tool_blocked_during_local_history_analysis", tool: name });
    }

    const repeatedSmallHistory = await registry.dispatch("derived_metric_read", {
      mode: "history",
      limit: 10
    }, context(true));
    expect(repeatedSmallHistory.result.error).toBe("tool_blocked_during_local_history_analysis");

    const latest = await registry.dispatch("derived_metric_read", { mode: "latest" }, context(true));
    expect(latest.result).toMatchObject({ ran: true, mode: "latest" });
    const execute = await registry.dispatch("execute_code", {}, context(true));
    expect(execute.result).toMatchObject({ ran: true });
  });

  it("fails execute_code closed while a history producer has not prepared a dataset", async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool("execute_code"));
    const result = await registry.dispatch("execute_code", {}, context(false));
    expect(result.result.error).toBe("history_dataset_not_prepared");
  });
});

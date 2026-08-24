import { rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentMemoryStore } from "./memory.js";
import { AgentRuntime } from "./runtime.js";
import { createGenericSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool, AgentToolContext } from "./types.js";
import type { ChatProvider } from "../providers.js";
import { createProjectSkillBindings } from "../projectSkills.js";
import { createSeedStore } from "../seed.js";
import { repoRootForProject } from "./knowledgeBase.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSlowTool(name: string, waitMs: number): AgentTool {
  return {
    name,
    category: "utility",
    description: `Slow mock ${name}`,
    schema: {
      name,
      description: `Slow mock ${name}`,
      parameters: { type: "object", properties: { id: { type: "string" } } }
    },
    async run(args, _context) {
      await delay(waitMs);
      return { tool: name, id: args.id ?? "unknown", at: Date.now() };
    }
  };
}

describe("runtime parallel tool dispatch", () => {
  it("runs same-iteration tool calls in parallel and preserves tool message order", async () => {
    const startedAt: number[] = [];
    const finishedAt: number[] = [];
    const tools = new AgentToolRegistry();

    for (const [index, waitMs] of [[1, 120], [2, 120], [3, 120]] as const) {
      tools.register({
        ...createSlowTool(`mock_tool_${index}`, waitMs),
        async run(args, context: AgentToolContext) {
          startedAt.push(Date.now());
          await delay(waitMs);
          finishedAt.push(Date.now());
          return { tool: `mock_tool_${index}`, id: args.id ?? String(index) };
        }
      });
    }

    let streamCalls = 0;
    const provider: ChatProvider = {
      metadata: { id: "parallel-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream() {
        streamCalls += 1;
        if (streamCalls === 1) {
          yield {
            toolCalls: [
              { id: "call_a", type: "function", function: { name: "mock_tool_1", arguments: "{\"id\":\"a\"}" } },
              { id: "call_b", type: "function", function: { name: "mock_tool_2", arguments: "{\"id\":\"b\"}" } },
              { id: "call_c", type: "function", function: { name: "mock_tool_3", arguments: "{\"id\":\"c\"}" } }
            ]
          };
        } else {
          yield { content: "All parallel tools finished." };
        }
      }
    };

    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const toolCompleted: Array<{ tool?: string; durationMs?: number }> = [];
    const parallelBatch: Array<{ parallel?: boolean; durationMs?: number }> = [];

    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_parallel",
      conversationId: "conv_parallel",
      canConfigure: false,
      messages: [{
        id: "msg_user",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "Run three tools"
      }],
      providerMessages: [{ role: "user", content: "Run three tools" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      if (event.type === "tool_completed" && event.metadata?.tool) {
        toolCompleted.push({
          tool: event.metadata.tool as string,
          ...(typeof event.metadata.durationMs === "number" ? { durationMs: event.metadata.durationMs } : {})
        });
      }
      if (event.type === "tool_completed" && event.metadata?.parallel === true) {
        parallelBatch.push({
          parallel: true,
          ...(typeof event.metadata.durationMs === "number" ? { durationMs: event.metadata.durationMs } : {})
        });
      }
    }

    expect(toolCompleted.map((entry) => entry.tool)).toEqual([
      "mock_tool_1",
      "mock_tool_2",
      "mock_tool_3"
    ]);

    const maxStartSpread = Math.max(...startedAt) - Math.min(...startedAt);
    expect(maxStartSpread).toBeLessThan(80);

    const serialEstimateMs = 120 * 3;
    expect(parallelBatch.length).toBe(1);
    expect(parallelBatch[0]?.durationMs ?? serialEstimateMs).toBeLessThan(serialEstimateMs - 80);
  });

  it("does not send cached raw derived history back to the provider", async () => {
    const projectId = "project_provider_history_test";
    const tools = new AgentToolRegistry();
    tools.register({
      name: "derived_metric_read",
      category: "building",
      description: "Mock derived history",
      schema: {
        name: "derived_metric_read",
        description: "Mock derived history",
        parameters: { type: "object", properties: {} }
      },
      async run() {
        return {
          instance: { instanceId: "metric_01", metricKey: "system_cop", entityId: "WCC_01" },
          history: Array.from({ length: 200 }, (_, index) => ({
            ts: new Date(Date.UTC(2026, 5, 1, 0, index)).toISOString(),
            valueNum: index,
            valueText: index === 123 ? "RAW_HISTORY_SENTINEL" : undefined,
            quality: "good",
            status: "ok"
          }))
        };
      }
    });

    let streamCalls = 0;
    let secondProviderPayload = "";
    const provider: ChatProvider = {
      metadata: { id: "history-local-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        streamCalls += 1;
        if (streamCalls === 1) {
          yield {
            toolCalls: [{
              id: "call_history",
              type: "function",
              function: { name: "derived_metric_read", arguments: JSON.stringify({ mode: "history" }) }
            }]
          };
          return;
        }
        secondProviderPayload = String(request.messages.find((message) => message.role === "tool")?.content ?? "");
        yield { content: "History prepared locally." };
      }
    };
    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (requestedProjectId) => skillBindings.getSkillIds(requestedProjectId)
    });

    try {
      for await (const _event of runtime.runTurnStream({
        projectId,
        userId: "user_ada",
        requestId: "req_history_local",
        conversationId: "conv_history_local",
        canConfigure: false,
        messages: [{
          id: "msg_user_history",
          projectId,
          userId: "user_ada",
          role: "user",
          content: "Plot COP history"
        }],
        providerMessages: [{ role: "user", content: "Plot COP history" }],
        provider,
        knowledgeBaseDocuments: [],
        repositoryArtifacts: []
      })) {
        // Drain the turn so the second provider request is captured.
      }
    } finally {
      rmSync(path.dirname(repoRootForProject(projectId)), { recursive: true, force: true });
    }

    expect(streamCalls).toBe(2);
    expect(secondProviderPayload).not.toContain("RAW_HISTORY_SENTINEL");
    expect(secondProviderPayload).not.toContain('"history":[');
    expect(secondProviderPayload).toContain('"cached_complete":true');
    expect(Buffer.byteLength(secondProviderPayload, "utf8")).toBeLessThan(32_768);
  });

  it("runs local-history producers before execute_code regardless of model call order", async () => {
    for (const producerName of ["derived_metric_history_prepare", "derived_metric_read"] as const) {
      for (const reverseOrder of [false, true]) {
        const tools = new AgentToolRegistry();
        const executionOrder: string[] = [];
        tools.register({
          name: producerName,
          category: "building",
          description: "Mock local-history producer",
          schema: {
            name: producerName,
            description: "Mock local-history producer",
            parameters: { type: "object", properties: { mode: { type: "string" } } }
          },
          async run() {
            executionOrder.push(producerName);
            await delay(10);
            return {
              compacted: true,
              data_file: "outputs/.tool_cache/mock.json",
              cache_manifest: "outputs/.tool_cache/mock_manifest.json"
            };
          }
        });
        tools.register({
          name: "execute_code",
          category: "utility",
          description: "Mock protected execute",
          schema: {
            name: "execute_code",
            description: "Mock protected execute",
            parameters: { type: "object", properties: {} }
          },
          async run(_args, context) {
            executionOrder.push("execute_code");
            return {
              protected: context.localHistoryMode === true,
              datasetReady: context.localHistoryDatasetReady === true
            };
          }
        });

        const producerCall = {
          id: `call_${producerName}`,
          type: "function" as const,
          function: {
            name: producerName,
            arguments: producerName === "derived_metric_read" ? "{\"mode\":\"history\"}" : "{}"
          }
        };
        const executeCall = {
          id: "call_execute",
          type: "function" as const,
          function: { name: "execute_code", arguments: "{}" }
        };
        const toolCalls = reverseOrder ? [executeCall, producerCall] : [producerCall, executeCall];
        let streamCalls = 0;
        let toolPayloads: Array<Record<string, unknown>> = [];
        const provider: ChatProvider = {
          metadata: { id: "history-barrier-test", mode: "real", model: "test", status: "configured" },
          async complete() {
            return { text: "done", provider: provider.metadata, fallbackUsed: false };
          },
          async *completeStream(request) {
            streamCalls += 1;
            if (streamCalls === 1) {
              yield { toolCalls };
              return;
            }
            toolPayloads = request.messages
              .filter((message) => message.role === "tool")
              .map((message) => JSON.parse(String(message.content)) as Record<string, unknown>);
            yield { content: "done" };
          }
        };
        const skillStore = createSeedStore();
        const skillBindings = createProjectSkillBindings(skillStore);
        const runtime = new AgentRuntime({
          memory: new AgentMemoryStore(),
          skills: createGenericSkillRegistry(),
          tools,
          resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
        });
        for await (const _event of runtime.runTurnStream({
          projectId: "project_history_barrier",
          userId: "user_ada",
          requestId: `req_${producerName}_${reverseOrder}`,
          conversationId: "conv_history_barrier",
          canConfigure: false,
          messages: [],
          providerMessages: [{ role: "user", content: "analyze" }],
          provider,
          knowledgeBaseDocuments: [],
          repositoryArtifacts: []
        })) {
          // Drain the turn.
        }
        expect(executionOrder).toEqual([producerName, "execute_code"]);
        const executePayload = toolPayloads[toolCalls.findIndex((call) => call.function.name === "execute_code")]!;
        expect(executePayload).toMatchObject({ protected: true, datasetReady: true });
      }
    }
  });

  it("keeps mixed small and cached history batches protected and fails closed on producer errors", async () => {
    const runScenario = async (failProducer: boolean) => {
      const tools = new AgentToolRegistry();
      let executeRuns = 0;
      tools.register({
        name: "derived_metric_read",
        category: "building",
        description: "Mock mixed history producer",
        schema: {
          name: "derived_metric_read",
          description: "Mock mixed history producer",
          parameters: { type: "object", properties: { id: { type: "string" }, mode: { type: "string" } } }
        },
        async run(args) {
          if (failProducer && args.id === "large") return { error: "producer_failed" };
          if (args.id === "large") {
            return {
              compacted: true,
              data_file: "outputs/.tool_cache/large.json",
              cache_manifest: "outputs/.tool_cache/manifest.json"
            };
          }
          return { history: [{ ts: "2026-06-01T00:00:00Z", valueNum: 1 }] };
        }
      });
      tools.register({
        name: "execute_code",
        category: "utility",
        description: "Mock execute",
        schema: { name: "execute_code", description: "Mock execute", parameters: { type: "object", properties: {} } },
        async run(_args, context) {
          executeRuns += 1;
          return { ready: context.localHistoryDatasetReady === true };
        }
      });
      let calls = 0;
      let payloads: Array<Record<string, unknown>> = [];
      const provider: ChatProvider = {
        metadata: { id: "mixed-history-test", mode: "real", model: "test", status: "configured" },
        async complete() {
          return { text: "done", provider: provider.metadata, fallbackUsed: false };
        },
        async *completeStream(request) {
          calls += 1;
          if (calls === 1) {
            yield { toolCalls: [
              { id: "call_execute", type: "function", function: { name: "execute_code", arguments: "{}" } },
              { id: "call_small", type: "function", function: { name: "derived_metric_read", arguments: "{\"mode\":\"history\",\"id\":\"small\"}" } },
              { id: "call_large", type: "function", function: { name: "derived_metric_read", arguments: "{\"mode\":\"history\",\"id\":\"large\"}" } }
            ] };
            return;
          }
          payloads = request.messages
            .filter((message) => message.role === "tool")
            .map((message) => JSON.parse(String(message.content)) as Record<string, unknown>);
          yield { content: "done" };
        }
      };
      const skillStore = createSeedStore();
      const skillBindings = createProjectSkillBindings(skillStore);
      const runtime = new AgentRuntime({
        memory: new AgentMemoryStore(),
        skills: createGenericSkillRegistry(),
        tools,
        resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
      });
      for await (const _event of runtime.runTurnStream({
        projectId: "project_mixed_history",
        userId: "user_ada",
        requestId: `req_mixed_${failProducer}`,
        conversationId: "conv_mixed_history",
        canConfigure: false,
        messages: [],
        providerMessages: [{ role: "user", content: "analyze mixed history" }],
        provider,
        knowledgeBaseDocuments: [],
        repositoryArtifacts: []
      })) {
        // Drain the turn.
      }
      return { executeRuns, payloads };
    };

    const mixed = await runScenario(false);
    expect(mixed.executeRuns).toBe(1);
    expect(mixed.payloads[0]).toMatchObject({ ready: true });

    const failed = await runScenario(true);
    expect(failed.executeRuns).toBe(0);
    expect(failed.payloads[0]).toMatchObject({ error: "history_dataset_not_prepared" });
    expect(failed.payloads).toHaveLength(3);
  });

  it("does not execute code when a same-batch history read stays inline", async () => {
    const tools = new AgentToolRegistry();
    let executeRuns = 0;
    tools.register({
      name: "derived_metric_read",
      category: "building",
      description: "Mock small inline history",
      schema: { name: "derived_metric_read", description: "Mock small inline history", parameters: { type: "object", properties: {} } },
      async run() {
        return { history: [{ ts: "2026-06-01T00:00:00Z", valueNum: 1 }] };
      }
    });
    tools.register({
      name: "execute_code",
      category: "utility",
      description: "Must not execute without a local dataset",
      schema: { name: "execute_code", description: "Must not execute", parameters: { type: "object", properties: {} } },
      async run() {
        executeRuns += 1;
        return { ran: true };
      }
    });
    let calls = 0;
    let payloads: Array<Record<string, unknown>> = [];
    const provider: ChatProvider = {
      metadata: { id: "small-history-execute-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        calls += 1;
        if (calls === 1) {
          yield { toolCalls: [
            { id: "call_execute", type: "function", function: { name: "execute_code", arguments: "{}" } },
            { id: "call_small", type: "function", function: { name: "derived_metric_read", arguments: "{\"mode\":\"history\"}" } }
          ] };
          return;
        }
        payloads = request.messages
          .filter((message) => message.role === "tool")
          .map((message) => JSON.parse(String(message.content)) as Record<string, unknown>);
        yield { content: "done" };
      }
    };
    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });
    for await (const _event of runtime.runTurnStream({
      projectId: "project_small_history_execute",
      userId: "user_ada",
      requestId: "req_small_history_execute",
      conversationId: "conv_small_history_execute",
      canConfigure: false,
      messages: [],
      providerMessages: [{ role: "user", content: "analyze this small history" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      // Drain the turn.
    }
    expect(executeRuns).toBe(0);
    expect(payloads[0]).toMatchObject({ error: "history_dataset_not_prepared" });
    expect(payloads).toHaveLength(2);
  });

  it("returns to ordinary mode when a successful history read stays inline", async () => {
    const tools = new AgentToolRegistry();
    tools.register({
      name: "derived_metric_read",
      category: "building",
      description: "Mock small history",
      schema: { name: "derived_metric_read", description: "Mock small history", parameters: { type: "object", properties: {} } },
      async run() {
        return { history: [{ ts: "2026-06-01T00:00:00Z", valueNum: 1 }] };
      }
    });
    tools.register({
      name: "terminal",
      category: "utility",
      description: "Mock terminal",
      schema: { name: "terminal", description: "Mock terminal", parameters: { type: "object", properties: {} } },
      async run(_args, context) {
        return { ran: true, protected: context.localHistoryMode === true };
      }
    });
    let calls = 0;
    let payloads: Array<Record<string, unknown>> = [];
    const provider: ChatProvider = {
      metadata: { id: "small-history-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        calls += 1;
        if (calls === 1) {
          yield { toolCalls: [
            { id: "call_terminal", type: "function", function: { name: "terminal", arguments: "{}" } },
            { id: "call_small", type: "function", function: { name: "derived_metric_read", arguments: "{\"mode\":\"history\"}" } }
          ] };
          return;
        }
        payloads = request.messages
          .filter((message) => message.role === "tool")
          .map((message) => JSON.parse(String(message.content)) as Record<string, unknown>);
        yield { content: "done" };
      }
    };
    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });
    for await (const _event of runtime.runTurnStream({
      projectId: "project_small_history",
      userId: "user_ada",
      requestId: "req_small_history",
      conversationId: "conv_small_history",
      canConfigure: false,
      messages: [],
      providerMessages: [{ role: "user", content: "read a small history" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      // Drain the turn.
    }
    expect(payloads[0]).toMatchObject({ ran: true, protected: false });
  });

  it("returns one tool response per call when provider arguments are valid non-object JSON", async () => {
    const tools = new AgentToolRegistry();
    const receivedArgs: Array<Record<string, unknown>> = [];
    tools.register({
      name: "derived_metric_read",
      category: "building",
      description: "Mock derived metric read",
      schema: {
        name: "derived_metric_read",
        description: "Mock derived metric read",
        parameters: { type: "object", properties: {} }
      },
      async run(args) {
        receivedArgs.push(args);
        return { error: "instanceId or entityId+metricKey is required" };
      }
    });

    let calls = 0;
    let responseIds: string[] = [];
    const provider: ChatProvider = {
      metadata: { id: "non-object-args-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        calls += 1;
        if (calls === 1) {
          yield {
            toolCalls: ["null", "[]", "42"].map((argumentsJson, index) => ({
              id: `call_non_object_${index}`,
              type: "function" as const,
              function: { name: "derived_metric_read", arguments: argumentsJson }
            }))
          };
          return;
        }
        responseIds = request.messages
          .filter((message) => message.role === "tool")
          .map((message) => String(message.tool_call_id));
        yield { content: "done" };
      }
    };
    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    for await (const _event of runtime.runTurnStream({
      projectId: "project_non_object_args",
      userId: "user_ada",
      requestId: "req_non_object_args",
      conversationId: "conv_non_object_args",
      canConfigure: false,
      messages: [],
      providerMessages: [{ role: "user", content: "read metrics" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      // Drain the turn.
    }

    expect(receivedArgs).toEqual([{}, {}, {}]);
    expect(responseIds).toEqual([
      "call_non_object_0",
      "call_non_object_1",
      "call_non_object_2"
    ]);
  });
});

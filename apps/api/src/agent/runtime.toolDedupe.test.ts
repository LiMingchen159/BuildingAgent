import { describe, expect, it } from "vitest";
import type { ChatCompletionRequest, ChatProvider } from "../providers.js";
import { createProjectSkillBindings } from "../projectSkills.js";
import { createSeedStore } from "../seed.js";
import { AgentMemoryStore } from "./memory.js";
import { AgentRuntime } from "./runtime.js";
import { createGenericSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";

function tool(name: string, run: AgentTool["run"]): AgentTool {
  return {
    name,
    category: "building",
    description: name,
    schema: { name, description: name, parameters: { type: "object", properties: {} } },
    run
  };
}

describe("runtime read-only tool deduplication", () => {
  it("responds to every call id while executing identical reads once and never deduplicating writes", async () => {
    const tools = new AgentToolRegistry();
    let readExecutions = 0;
    let writeExecutions = 0;
    tools.register(tool("derived_metric_read", async (args) => ({
      execution: ++readExecutions,
      from: args.from
    })));
    tools.register(tool("derived_metric_record_sample", async () => ({ execution: ++writeExecutions })));

    const providerRequests: ChatCompletionRequest[] = [];
    let iteration = 0;
    const provider: ChatProvider = {
      metadata: { id: "dedupe-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        providerRequests.push(request);
        iteration += 1;
        if (iteration === 1) {
          yield {
            toolCalls: [
              { id: "read_a", type: "function", function: { name: "derived_metric_read", arguments: "{\"instanceId\":\"metric_1\",\"mode\":\"history\",\"from\":\"2026-08-01T00:00:00Z\"}" } },
              { id: "read_b", type: "function", function: { name: "derived_metric_read", arguments: "{\"from\":\"2026-08-01T00:00:00Z\",\"mode\":\"history\",\"instanceId\":\" metric_1 \"}" } },
              { id: "read_other", type: "function", function: { name: "derived_metric_read", arguments: "{\"instanceId\":\"metric_1\",\"mode\":\"history\",\"from\":\"2026-08-02T00:00:00Z\"}" } }
            ]
          };
        } else if (iteration === 2) {
          yield {
            toolCalls: [
              { id: "read_later", type: "function", function: { name: "derived_metric_read", arguments: "{\"instanceId\":\"metric_1\",\"mode\":\"history\",\"from\":\"2026-08-01T00:00:00Z\"}" } },
              { id: "write_a", type: "function", function: { name: "derived_metric_record_sample", arguments: "{\"instanceId\":\"metric_1\",\"valueNum\":1}" } },
              { id: "write_b", type: "function", function: { name: "derived_metric_record_sample", arguments: "{\"instanceId\":\"metric_1\",\"valueNum\":1}" } }
            ]
          };
        } else {
          yield { content: "done" };
        }
      }
    };

    const skillBindings = createProjectSkillBindings(createSeedStore());
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const completedIds: string[] = [];
    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_dedupe",
      conversationId: "conv_dedupe",
      canConfigure: true,
      messages: [{ id: "msg_user", projectId: "project_alpha", userId: "user_ada", role: "user", content: "read" }],
      providerMessages: [{ role: "user", content: "read" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      if (event.type === "tool_completed" && typeof event.metadata?.toolCallId === "string") {
        completedIds.push(event.metadata.toolCallId);
      }
    }

    expect(readExecutions).toBe(2);
    expect(writeExecutions).toBe(2);
    expect(completedIds).toEqual(["read_a", "read_b", "read_other", "read_later", "write_a", "write_b"]);
    const finalToolIds = providerRequests.at(-1)?.messages
      .filter((message) => message.role === "tool")
      .map((message) => message.tool_call_id);
    expect(finalToolIds).toEqual(["read_a", "read_b", "read_other", "read_later", "write_a", "write_b"]);
  });

  it("turns parsed null, array, and primitive arguments into empty objects and responds to every call id", async () => {
    const tools = new AgentToolRegistry();
    const receivedArgs: Array<Record<string, unknown>> = [];
    tools.register(tool("derived_metric_read", async (args) => {
      receivedArgs.push(args);
      return { error: "instanceId or metricKey+entityId is required", receivedArgs: args };
    }));

    const providerRequests: ChatCompletionRequest[] = [];
    let iteration = 0;
    const provider: ChatProvider = {
      metadata: { id: "malformed-args-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return { text: "done", provider: provider.metadata, fallbackUsed: false };
      },
      async *completeStream(request) {
        providerRequests.push(request);
        iteration += 1;
        if (iteration === 1) {
          yield {
            toolCalls: [
              { id: "null_args", type: "function", function: { name: "derived_metric_read", arguments: "null" } },
              { id: "array_args", type: "function", function: { name: "derived_metric_read", arguments: "[]" } },
              { id: "primitive_args", type: "function", function: { name: "derived_metric_read", arguments: "42" } }
            ]
          };
        } else {
          yield { content: "done" };
        }
      }
    };
    const skillBindings = createProjectSkillBindings(createSeedStore());
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools,
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const completedIds: string[] = [];
    let completedTurn = false;
    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_malformed_args",
      conversationId: "conv_malformed_args",
      canConfigure: false,
      messages: [{ id: "msg_user", projectId: "project_alpha", userId: "user_ada", role: "user", content: "read" }],
      providerMessages: [{ role: "user", content: "read" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      if (event.type === "tool_completed" && typeof event.metadata?.toolCallId === "string") {
        completedIds.push(event.metadata.toolCallId);
      }
      if (event.type === "turn_completed") completedTurn = true;
    }

    expect(completedTurn).toBe(true);
    expect(completedIds).toEqual(["null_args", "array_args", "primitive_args"]);
    expect(receivedArgs).toEqual([{}, {}, {}]);
    const toolMessages = providerRequests.at(-1)?.messages.filter((message) => message.role === "tool") ?? [];
    expect(toolMessages.map((message) => message.tool_call_id)).toEqual(["null_args", "array_args", "primitive_args"]);
    for (const message of toolMessages) {
      expect(JSON.parse(message.content ?? "{}")).toEqual({
        error: "instanceId or metricKey+entityId is required",
        receivedArgs: {}
      });
    }
  });
});

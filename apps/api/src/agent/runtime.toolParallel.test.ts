import { describe, expect, it } from "vitest";
import { AgentMemoryStore } from "./memory.js";
import { AgentRuntime } from "./runtime.js";
import { createGenericSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool, AgentToolContext } from "./types.js";
import type { ChatProvider } from "../providers.js";
import { createProjectSkillBindings } from "../projectSkills.js";
import { createSeedStore } from "../seed.js";

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
});

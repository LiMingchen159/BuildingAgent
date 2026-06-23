import { describe, expect, it } from "vitest";
import { AgentMemoryStore } from "./memory.js";
import { AgentRuntime } from "./runtime.js";
import { createGenericSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { ChatProvider } from "../providers.js";
import { createProjectSkillBindings } from "../projectSkills.js";
import { createSeedStore } from "../seed.js";

describe("runtime stream phase", () => {
  it("emits work_token for tool iterations and answer_start before answer_token for final iteration", async () => {
    let streamCalls = 0;
    const provider: ChatProvider = {
      metadata: { id: "phase-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return {
          text: "fallback",
          provider: provider.metadata,
          fallbackUsed: false
        };
      },
      async *completeStream() {
        streamCalls += 1;
        if (streamCalls === 1) {
          yield { content: "Interim " };
          yield { content: "narration." };
          yield {
            toolCalls: [{
              id: "call_1",
              type: "function",
              function: { name: "read_file", arguments: "{\"path\":\"kb:/KB.md\"}" }
            }]
          };
        } else {
          yield { content: "Final " };
          yield { content: "answer." };
        }
      }
    };

    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools: new AgentToolRegistry(),
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const events: Array<{ type: string; message: string }> = [];
    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_phase",
      conversationId: "conv_phase",
      canConfigure: false,
      messages: [{
        id: "msg_user",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "Check chillers"
      }],
      providerMessages: [{ role: "user", content: "Check chillers" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      events.push({ type: event.type, message: event.message });
    }

    const workText = events
      .filter((event) => event.type === "work_token")
      .map((event) => event.message)
      .join("");
    const answerText = events
      .filter((event) => event.type === "answer_token")
      .map((event) => event.message)
      .join("");

    expect(streamCalls).toBe(2);
    expect(workText).toContain("Interim narration.");
    expect(workText).toContain("Final answer.");
    expect(answerText).toBe("");

    const answerStartIndex = events.findIndex((event) => event.type === "answer_start");
    expect(answerStartIndex).toBeGreaterThanOrEqual(0);
    expect(events.filter((event) => event.type === "answer_token")).toHaveLength(0);

    const firstIterToolDone = events.findIndex(
      (event) => event.type === "tool_completed" && event.message.includes("read_file")
    );
    expect(firstIterToolDone).toBeGreaterThanOrEqual(0);
    expect(answerStartIndex).toBeGreaterThan(firstIterToolDone);
  });

  it("buffers no-tool turns into answer_start and answer_token without work_token", async () => {
    const provider: ChatProvider = {
      metadata: { id: "phase-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return {
          text: "Direct answer.",
          provider: provider.metadata,
          fallbackUsed: false
        };
      },
      async *completeStream() {
        yield { content: "Direct " };
        yield { content: "answer." };
      }
    };

    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools: new AgentToolRegistry(),
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const events: Array<{ type: string; message: string }> = [];
    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_direct",
      conversationId: "conv_direct",
      canConfigure: false,
      messages: [{
        id: "msg_user",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "Hello"
      }],
      providerMessages: [{ role: "user", content: "Hello" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      events.push({ type: event.type, message: event.message });
    }

    const workText = events
      .filter((event) => event.type === "work_token")
      .map((event) => event.message)
      .join("");
    expect(workText).toBe("Direct answer.");
    expect(events.some((event) => event.type === "answer_start")).toBe(true);
    expect(events.some((event) => event.type === "answer_end")).toBe(true);
    expect(events.filter((event) => event.type === "answer_token")).toHaveLength(0);
  });

  it("treats spurious incomplete tool deltas as no-tool iteration", async () => {
    const provider: ChatProvider = {
      metadata: { id: "phase-test", mode: "real", model: "test", status: "configured" },
      async complete() {
        return {
          text: "Final answer.",
          provider: provider.metadata,
          fallbackUsed: false
        };
      },
      async *completeStream() {
        yield { content: "Final " };
        yield {
          toolCalls: [{
            id: "incomplete_call",
            type: "function",
            function: { name: "", arguments: "{" }
          }]
        };
        yield { content: "answer." };
      }
    };

    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools: new AgentToolRegistry(),
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const events: Array<{ type: string; message: string }> = [];
    for await (const event of runtime.runTurnStream({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_spurious",
      conversationId: "conv_spurious",
      canConfigure: false,
      messages: [{
        id: "msg_user",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "Hello"
      }],
      providerMessages: [{ role: "user", content: "Hello" }],
      provider,
      knowledgeBaseDocuments: [],
      repositoryArtifacts: []
    })) {
      events.push({ type: event.type, message: event.message });
    }

    const workText = events
      .filter((event) => event.type === "work_token")
      .map((event) => event.message)
      .join("");
    expect(workText).toBe("Final answer.");
    expect(events.some((event) => event.type === "answer_start")).toBe(true);
    expect(events.filter((event) => event.type === "answer_token")).toHaveLength(0);
    expect(events.some((event) => event.type === "answer_end")).toBe(true);
  });
});

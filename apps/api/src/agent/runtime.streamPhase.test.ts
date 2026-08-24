import { describe, expect, it, vi } from "vitest";
import { AgentMemoryStore } from "./memory.js";
import { AgentRuntime, compactOldToolRowsForProvider } from "./runtime.js";
import { createGenericSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import { ProviderError, type ChatProvider } from "../providers.js";
import { createProjectSkillBindings } from "../projectSkills.js";
import { createSeedStore } from "../seed.js";

describe("runtime stream phase", () => {
  it("summarizes only old tool rows while preserving the current tool protocol pair", () => {
    const currentResult = JSON.stringify({ history: ["current-result-must-stay"] });
    const messages = [
      { role: "user" as const, content: "Analyze history" },
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [{ id: "call_old", type: "function" as const, function: { name: "read", arguments: "{}" } }]
      },
      { role: "tool" as const, tool_call_id: "call_old", content: JSON.stringify({ history: ["x".repeat(1024 * 1024)] }) },
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [{ id: "call_current", type: "function" as const, function: { name: "read", arguments: "{}" } }]
      },
      { role: "tool" as const, tool_call_id: "call_current", content: currentResult }
    ];

    const compacted = compactOldToolRowsForProvider(messages, []);

    expect(compacted[2]?.content).toContain('"compacted":true');
    expect(compacted[2]?.content).not.toContain("x".repeat(100));
    expect(compacted[3]).toEqual(messages[3]);
    expect(compacted[4]).toEqual(messages[4]);
    expect(compacted[4]?.content).toBe(currentResult);
  });

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

  it("surfaces a non-retriable streaming HTTP 400 without non-streaming fallback", async () => {
    const metadata = { id: "deepseek-test", mode: "real" as const, model: "deepseek-v4-pro", status: "configured" };
    const complete = vi.fn(async () => ({
      text: "must not be used",
      provider: metadata,
      fallbackUsed: false
    }));
    let streamCalls = 0;
    const provider: ChatProvider = {
      metadata,
      complete,
      async *completeStream() {
        streamCalls += 1;
        throw new ProviderError("DeepSeek rejected the request.", {
          code: "provider_http_error",
          status: 400,
          provider: provider.metadata,
          responseDetail: "reasoning_content must be passed back"
        });
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

    const run = async () => {
      for await (const _event of runtime.runTurnStream({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_http_400_stream",
        conversationId: "conv_http_400_stream",
        canConfigure: false,
        messages: [{
          id: "msg_user",
          projectId: "project_alpha",
          userId: "user_ada",
          role: "user",
          content: "Check history"
        }],
        providerMessages: [{ role: "user", content: "Check history" }],
        provider,
        knowledgeBaseDocuments: [],
        repositoryArtifacts: []
      })) {
        // Consume until the provider error is surfaced.
      }
    };

    await expect(run()).rejects.toMatchObject({ code: "provider_http_error", status: 400 });
    expect(streamCalls).toBe(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not create a second retry owner for an unknown streaming transport error", async () => {
    const metadata = { id: "provider-test", mode: "real" as const, model: "test-model", status: "configured" };
    const complete = vi.fn(async () => ({
      text: "Recovered answer.",
      provider: metadata,
      fallbackUsed: false
    }));
    const provider: ChatProvider = {
      metadata,
      complete,
      async *completeStream() {
        throw new TypeError("socket closed");
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

    const run = async () => {
      for await (const _event of runtime.runTurnStream({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_unknown_stream",
        conversationId: "conv_unknown_stream",
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
        // Consume until the provider error is surfaced.
      }
    };

    await expect(run()).rejects.toThrow("socket closed");
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not blindly retry a non-streaming HTTP 400", async () => {
    const metadata = { id: "provider-test", mode: "real" as const, model: "test-model", status: "configured" };
    const complete = vi.fn(async () => {
      throw new ProviderError("Provider rejected the request.", {
        code: "provider_http_error",
        status: 400,
        provider: metadata
      });
    });
    const provider: ChatProvider = {
      metadata,
      complete
    };
    const skillStore = createSeedStore();
    const skillBindings = createProjectSkillBindings(skillStore);
    const runtime = new AgentRuntime({
      memory: new AgentMemoryStore(),
      skills: createGenericSkillRegistry(),
      tools: new AgentToolRegistry(),
      resolveProjectSkillIds: (projectId) => skillBindings.getSkillIds(projectId)
    });

    const run = async () => {
      for await (const _event of runtime.runTurnStream({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_http_400_complete",
        conversationId: "conv_http_400_complete",
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
        // Consume until the provider error is surfaced.
      }
    };

    await expect(run()).rejects.toMatchObject({ code: "provider_http_error", status: 400 });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("bounds the entire agent turn at 180 seconds and aborts the provider signal", async () => {
    vi.useFakeTimers();
    try {
      let providerSignal: AbortSignal | undefined;
      const metadata = { id: "provider-test", mode: "real" as const, model: "test-model", status: "configured" };
      const provider: ChatProvider = {
        metadata,
        async complete(request) {
          providerSignal = request.signal;
          return new Promise(() => undefined);
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
      const consume = async () => {
        for await (const _event of runtime.runTurnStream({
          projectId: "project_alpha",
          userId: "user_ada",
          requestId: "req_turn_timeout",
          conversationId: "conv_turn_timeout",
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
          // Consume until the turn deadline is surfaced.
        }
      };
      const turn = consume();
      const rejected = expect(turn).rejects.toMatchObject({ code: "agent_turn_timeout", status: 504 });
      await vi.advanceTimersByTimeAsync(180_000);

      await rejected;
      expect(providerSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates external cancellation to the active provider without replay", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const provider: ChatProvider = {
      metadata: { id: "provider-test", mode: "real", model: "test-model", status: "configured" },
      async complete(request) {
        providerSignal = request.signal;
        return new Promise(() => undefined);
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
    const consume = async () => {
      for await (const _event of runtime.runTurnStream({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_turn_cancel",
        conversationId: "conv_turn_cancel",
        canConfigure: false,
        messages: [{
          id: "msg_user",
          projectId: "project_alpha",
          userId: "user_ada",
          role: "user",
          content: "hi"
        }],
        providerMessages: [{ role: "user", content: "hi" }],
        provider,
        knowledgeBaseDocuments: [],
        repositoryArtifacts: []
      }, controller.signal)) {
        // Consume until cancellation is surfaced.
      }
    };
    const turn = consume();
    const rejected = expect(turn).rejects.toMatchObject({ code: "agent_turn_cancelled" });
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();

    await rejected;
    expect(providerSignal?.aborted).toBe(true);
  });
});

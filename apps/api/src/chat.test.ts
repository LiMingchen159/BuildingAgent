import { describe, expect, it } from "vitest";
import { ProviderError, type ChatProvider } from "./providers.js";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

const adaToken = "seed-token-ada";
const graceToken = "seed-token-grace";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

function fakeProvider(overrides: Partial<ChatProvider> = {}) {
  const calls: Parameters<ChatProvider["complete"]>[0][] = [];
  const provider: ChatProvider = {
    metadata: { id: "fake-real", mode: "real", model: "fake-model", status: "configured" },
    async complete(request) {
      calls.push(request);
      return {
        text: `Assistant: ${request.messages.at(-1)?.content ?? ""}`,
        provider: provider.metadata,
        fallbackUsed: false
      };
    },
    ...overrides
  };

  return { provider, calls };
}

function assertNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["secret", "apikey", "api_key", "bearer", "password", "client_secret", "private_key", "authorization"]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("project-scoped chat contract", () => {
  it("requires auth and a matching selected project before reading chat", async () => {
    const app = buildServer();

    const unauthorized = await app.inject({ method: "GET", url: "/api/projects/project_alpha/chat" });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().error).toMatchObject({ code: "auth_missing" });

    const notSelected = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(notSelected.statusCode).toBe(403);
    expect(notSelected.json().error).toMatchObject({ code: "project_not_selected" });
  });

  it("stores a bounded user/assistant turn and returns provider diagnostics for the selected project", async () => {
    const store = createSeedStore();
    store.maxChatMessages = 2;
    const { provider, calls } = fakeProvider();
    const app = buildServer({ store, chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "What should we build first?" }
    });

    expect(posted.statusCode).toBe(201);
    expect(posted.json()).toMatchObject({
      message: {
        id: "msg_000001",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "What should we build first?"
      },
      assistantMessage: {
        id: "msg_000002",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "assistant",
        content: "Assistant: What should we build first?"
      },
      provider: {
        id: "fake-real",
        mode: "real",
        model: "fake-model",
        status: "configured",
        fallbackUsed: false
      },
      fallbackUsed: false,
      conversationId: expect.stringMatching(/^conv_/),
      lifecycle: expect.arrayContaining([
        expect.objectContaining({ type: "user_message_received" }),
        expect.objectContaining({ type: "memory_recalled", metadata: { memoryCount: 0 } }),
        expect.objectContaining({ type: "skills_applied", metadata: { skillCount: 3 } }),
        expect.objectContaining({ type: "provider_started" }),
        expect.objectContaining({ type: "assistant_message_completed" })
      ]),
      requestId: expect.stringMatching(/^req_/)
    });
    // calls[0] = chat, calls[1] = auto-title
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toMatchObject({ projectId: "project_alpha", userId: "user_ada", requestId: expect.stringMatching(/^req_/) });
    expect(calls[0]?.messages).toEqual([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("You are BuildingAgent, a Hermes-like autonomous project assistant.")
      }),
      { role: "user", content: "What should we build first?" }
    ]);
    expect(calls[0]?.messages[0]?.content).toContain("Available skills:");
    expect(calls[0]?.messages[0]?.content).toContain("Available tools:");
    expect(calls[0]?.messages[0]?.content).toContain("Knowledge Base files");
    assertNoSecrets(posted.json());

    const alphaChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(alphaChat.statusCode).toBe(200);
    expect(alphaChat.json()).toMatchObject({
      messages: [posted.json().message, posted.json().assistantMessage],
      limit: 50,
      requestId: expect.stringMatching(/^req_/)
    });

    await app.inject({ method: "POST", url: "/api/projects/project_beta/select", headers: bearer(adaToken) });
    const betaChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_beta/chat",
      headers: bearer(adaToken)
    });
    expect(betaChat.statusCode).toBe(200);
    expect(betaChat.json().messages).toEqual([]);
  });

  it("falls back deterministically when no provider credentials are configured", async () => {
    const app = buildServer({ env: {} });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Local smoke" }
    });

    expect(posted.statusCode).toBe(201);
    expect(posted.json()).toMatchObject({
      assistantMessage: { role: "assistant", content: "I'll help you with that. Let me look into the project data and knowledge base to find what you need.\n\nThis is a mock response — connect a real LLM provider for AI-powered agent behavior." },
      provider: {
        id: "deterministic-mock",
        mode: "mock",
        model: "deterministic-local-mock",
        fallbackReason: "local_default",
        status: "fallback",
        fallbackUsed: true
      },
      fallbackUsed: true,
      lifecycle: expect.arrayContaining([expect.objectContaining({ type: "provider_started" })]),
      requestId: expect.stringMatching(/^req_/)
    });
  });

  it("does not invoke the provider before auth, project, selection, permission, or body denial paths", async () => {
    const { provider, calls } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    const checks = [
      app.inject({ method: "POST", url: "/api/projects/project_alpha/chat", payload: { message: "Hello" } }),
      app.inject({ method: "POST", url: "/api/projects/project_alpha/chat", headers: bearer("missing-token"), payload: { message: "Hello" } }),
      app.inject({ method: "POST", url: "/api/projects/project_gamma/chat", headers: bearer(adaToken), payload: { message: "Hello" } }),
      app.inject({ method: "POST", url: "/api/projects/project_alpha/chat", headers: bearer(adaToken), payload: { message: "Hello" } })
    ];

    const [missingAuth, invalidAuth, forbidden, notSelected] = await Promise.all(checks);
    expect(missingAuth?.statusCode).toBe(401);
    expect(missingAuth?.json().error).toMatchObject({ code: "auth_missing" });
    expect(invalidAuth?.statusCode).toBe(401);
    expect(invalidAuth?.json().error).toMatchObject({ code: "auth_invalid" });
    expect(forbidden?.statusCode).toBe(403);
    expect(forbidden?.json().error).toMatchObject({ code: "project_forbidden" });
    expect(notSelected?.statusCode).toBe(403);
    expect(notSelected?.json().error).toMatchObject({ code: "project_not_selected" });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    for (const payload of [{}, { message: "" }, { message: "   " }, { message: "x".repeat(1001) }, { text: "wrong shape" }, { message: 42 }]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/projects/project_alpha/chat",
        headers: bearer(adaToken),
        payload
      });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error).toMatchObject({ code: "chat_invalid" });
    }
    expect(calls).toHaveLength(0);
  });

  it("preserves canonical provider error envelopes and avoids storing unsafe assistant content", async () => {
    const store = createSeedStore();
    const { provider } = fakeProvider({
      async complete() {
        throw new ProviderError("upstream failed with sk-test-secret", {
          code: "provider_http_error",
          status: 503,
          provider: { id: "fake-real", mode: "real", model: "fake-model", status: "503" }
        });
      }
    });
    const app = buildServer({ store, chatProvider: provider, allowProviderFallback: false });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const failed = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Do not store on failure" }
    });

    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({
      error: {
        code: "provider_error",
        message: "Chat provider failed before producing a safe response.",
        requestId: expect.stringMatching(/^req_/)
      }
    });
    assertNoSecrets(failed.json());
    expect(store.messagesByProject.project_alpha).toEqual([]);
  });

  it("uses explicit fallback metadata when configured provider failure fallback is allowed", async () => {
    const { provider } = fakeProvider({
      async complete() {
        throw new ProviderError("timeout", {
          code: "provider_request_failed",
          provider: { id: "fake-real", mode: "real", model: "fake-model" }
        });
      }
    });
    const app = buildServer({ chatProvider: provider, allowProviderFallback: true });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Recover locally" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      assistantMessage: { role: "assistant", content: "I'll help you with that. Let me look into the project data and knowledge base to find what you need.\n\nThis is a mock response — connect a real LLM provider for AI-powered agent behavior." },
      provider: {
        id: "deterministic-mock",
        mode: "mock",
        model: "deterministic-local-mock",
        fallbackReason: "provider_request_failed",
        status: "fallback",
        fallbackUsed: true
      },
      fallbackUsed: true,
      lifecycle: expect.arrayContaining([expect.objectContaining({ type: "provider_started" })])
    });
    assertNoSecrets(response.json());
  });

  it("runs explicit memory commands through the agent lifecycle", async () => {
    const { provider, calls } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Remember: Alpha prefers concise weekly summaries" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_started", metadata: expect.objectContaining({ tool: "memory_remember" }) }),
        expect.objectContaining({ type: "tool_completed", metadata: expect.objectContaining({ tool: "memory_remember" }) }),
        expect.objectContaining({ type: "memory_synced" })
      ])
    );

    const recall = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Use that preference now" }
    });
    expect(recall.statusCode).toBe(201);
    expect(recall.json().lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "memory_recalled", metadata: { memoryCount: 1 } })
      ])
    );
    // calls.at(-2) = 2nd chat turn; calls.at(-1) = auto-title call
    const chatCalls = calls.filter((c) => c.messages.length > 1);
    const lastChatCall = chatCalls.at(-1);
    expect(lastChatCall?.messages[0]?.content).toContain("Alpha prefers concise weekly summaries");
    assertNoSecrets(response.json());
  });

  it("indexes knowledge base files and saves assistant outputs as repository artifacts", async () => {
    const { provider, calls } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_mortar/select", headers: bearer(adaToken) });
    const kb = await app.inject({
      method: "GET",
      url: "/api/projects/project_mortar/knowledge-base",
      headers: bearer(adaToken)
    });
    expect(kb.statusCode).toBe(200);
    expect(kb.json().documents).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "bldg40.ttl", kind: "turtle" })])
    );

    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_mortar/chat",
      headers: bearer(adaToken),
      payload: { message: "Use the knowledge base" }
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json().conversationId).toEqual(expect.stringMatching(/^conv_/));
    expect(posted.json().artifact).toBeUndefined();
    // Check the chat call (not auto-title) contains KB content
    const chatCalls = calls.filter((c) => c.messages.length > 1);
    const kbCall = chatCalls.at(-1);
    expect(kbCall?.messages[0]?.content).toContain("bldg40.ttl");

    const repo = await app.inject({
      method: "GET",
      url: "/api/projects/project_mortar/repository",
      headers: bearer(adaToken)
    });
    expect(repo.statusCode).toBe(200);
    // Repository no longer auto-saves note artifacts from every chat turn
    expect(repo.json().artifacts).toEqual([]);
  });

  it("resets chat messages and project-scoped agent memory for the selected project", async () => {
    const app = buildServer({ env: {} });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Remember: Reset should clear this" }
    });

    const reset = await app.inject({
      method: "DELETE",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(reset.statusCode).toBe(200);
    const resetBody = reset.json();
    expect(resetBody.projectId).toBe("project_alpha");
    expect(resetBody.clearedMessages).toBe(2);
    expect(resetBody.clearedMemories).toBeGreaterThanOrEqual(1);
    expect(resetBody.requestId).toEqual(expect.stringMatching(/^req_/));

    const chat = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(chat.json().messages).toEqual([]);

    const afterReset = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "What do you remember?" }
    });
    expect(afterReset.statusCode).toBe(201);
    expect(afterReset.json().lifecycle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "memory_recalled", metadata: { memoryCount: 0 } })
      ])
    );
  });

  it("rechecks membership on every operation and isolates projects between users", async () => {
    const { provider } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Alpha-only context" }
    });

    const graceForbidden = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(graceToken)
    });
    expect(graceForbidden.statusCode).toBe(403);
    expect(graceForbidden.json().error).toMatchObject({ code: "project_forbidden" });

    await app.inject({ method: "POST", url: "/api/projects/project_gamma/select", headers: bearer(graceToken) });
    const graceChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_gamma/chat",
      headers: bearer(graceToken)
    });
    expect(graceChat.statusCode).toBe(200);
    expect(graceChat.json().messages).toEqual([]);
  });

  it("creates, lists, selects, renames, and deletes conversations", async () => {
    const { provider } = fakeProvider();
    const app = buildServer({ chatProvider: provider });
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    // List conversations — should start empty
    const list1 = await app.inject({ method: "GET", url: "/api/projects/project_alpha/conversations", headers: bearer(adaToken) });
    expect(list1.statusCode).toBe(200);
    expect(list1.json().conversations).toEqual([]);

    // Create a conversation
    const created = await app.inject({ method: "POST", url: "/api/projects/project_alpha/conversations", headers: bearer(adaToken) });
    expect(created.statusCode).toBe(201);
    const convId = created.json().conversation.id;
    expect(convId).toEqual(expect.stringMatching(/^conv_/));
    expect(created.json().conversation.title).toBe("New conversation");
    expect(created.json().conversation.messageCount).toBe(0);

    // Empty conversations are filtered from GET /conversations — send a message so it becomes non-empty
    const chatRes = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Hello", conversationId: convId }
    });
    // Verify chat succeeded
    expect(chatRes.statusCode).toBe(201);

    // List should now have one (non-empty)
    const list2 = await app.inject({ method: "GET", url: "/api/projects/project_alpha/conversations", headers: bearer(adaToken) });
    expect(list2.json().conversations.length).toBe(1);

    // Select the conversation
    const select = await app.inject({
      method: "POST",
      url: `/api/projects/project_alpha/conversations/${convId}/select`,
      headers: bearer(adaToken)
    });
    expect(select.statusCode).toBe(200);
    expect(select.json().messages.length).toBe(2);

    // Rename the conversation
    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_alpha/conversations/${convId}`,
      headers: bearer(adaToken),
      payload: { title: "Custom title" }
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().conversation.title).toBe("Custom title");

    // Reject invalid rename
    const badRename = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_alpha/conversations/${convId}`,
      headers: bearer(adaToken),
      payload: { title: "" }
    });
    expect(badRename.statusCode).toBe(422);

    // Delete the conversation
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/project_alpha/conversations/${convId}`,
      headers: bearer(adaToken)
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deleted).toBe(true);
    expect(deleted.json().removedMessages).toBe(2);

    // List should be empty again
    const list3 = await app.inject({ method: "GET", url: "/api/projects/project_alpha/conversations", headers: bearer(adaToken) });
    expect(list3.json().conversations).toEqual([]);
  });

  it("auto-creates a conversation on first chat post", async () => {
    const { provider } = fakeProvider();
    const app = buildServer({ chatProvider: provider });
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Hello" }
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json().conversationId).toEqual(expect.stringMatching(/^conv_/));

    // Chat should now return messages filtered by conversation
    const chat = await app.inject({
      method: "GET",
      url: `/api/projects/project_alpha/chat?conversationId=${posted.json().conversationId}`,
      headers: bearer(adaToken)
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().messages.length).toBe(2);
    expect(chat.json().activeConversationId).toBe(posted.json().conversationId);
  });

  it("creates and deletes projects", async () => {
    const app = buildServer();

    // Create a project
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: bearer(adaToken),
      payload: { name: "Test Project" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().project.id).toEqual(expect.stringMatching(/^project_/));
    expect(created.json().project.name).toBe("Test Project");
    expect(created.json().session.projectId).toBe(created.json().project.id);

    // Reject invalid name
    const badName = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: bearer(adaToken),
      payload: { name: "" }
    });
    expect(badName.statusCode).toBe(422);

    // Reject long name
    const longName = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: bearer(adaToken),
      payload: { name: "a".repeat(81) }
    });
    expect(longName.statusCode).toBe(422);

    // Delete the project
    const projectId = created.json().project.id;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}`,
      headers: bearer(adaToken)
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deleted).toBe(true);

    // Project should be gone
    const list = await app.inject({ method: "GET", url: "/api/projects", headers: bearer(adaToken) });
    expect(list.json().projects.find((p: Record<string, unknown>) => p.id === projectId)).toBeUndefined();
  });

  it("filters chat messages to the active conversation", async () => {
    const { provider } = fakeProvider();
    const app = buildServer({ chatProvider: provider });
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    // Send a message — this creates conv A
    const first = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "First message" }
    });
    const convA = first.json().conversationId;

    // Create a second conversation explicitly
    const convBCreate = await app.inject({ method: "POST", url: "/api/projects/project_alpha/conversations", headers: bearer(adaToken) });
    const convB = convBCreate.json().conversation.id;
    await app.inject({ method: "POST", url: `/api/projects/project_alpha/conversations/${convB}/select`, headers: bearer(adaToken) });

    // Send a message in conv B
    await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Second message", conversationId: convB }
    });

    // Chat without conversationId should return latest (conv B)
    const chatB = await app.inject({ method: "GET", url: "/api/projects/project_alpha/chat", headers: bearer(adaToken) });
    expect(chatB.json().messages.length).toBe(2);

    // Chat with conv A should return only conv A messages
    const chatA = await app.inject({ method: "GET", url: `/api/projects/project_alpha/chat?conversationId=${convA}`, headers: bearer(adaToken) });
    expect(chatA.json().messages.length).toBe(2);
    expect(chatA.json().messages[0].content).toBe("First message");
  });
});

describe("chat streaming endpoint", () => {
  function parseSseEvents(body: string): Array<{ event: string; data: unknown }> {
    const events: Array<{ event: string; data: unknown }> = [];
    const chunks = body.split("\n\n").filter(Boolean);
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (event && data) {
        events.push({ event, data: JSON.parse(data) });
      }
    }
    return events;
  }

  it("returns SSE events for a simple chat turn", async () => {
    const { provider } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat/stream",
      headers: bearer(adaToken),
      payload: { message: "Hello streaming" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");

    const body = res.body;
    const events = parseSseEvents(body);

    // Should have lifecycle events and a done event
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.event === "lifecycle" && (e.data as Record<string, unknown>).type === "loop_started")).toBe(true);
    expect(events.some((e) => e.event === "lifecycle" && (e.data as Record<string, unknown>).type === "turn_completed")).toBe(true);

    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeDefined();
    const doneData = doneEvent!.data as Record<string, unknown>;
    expect(doneData.message).toMatchObject({ role: "user", content: "Hello streaming" });
    expect(doneData.assistantMessage).toMatchObject({ role: "assistant" });
    expect(doneData.conversationId).toEqual(expect.stringMatching(/^conv_/));
    expect(doneData.provider).toMatchObject({ id: "fake-real" });
  });

  it("emits an error event when the provider stream ends without a final response", async () => {
    const provider: ChatProvider = {
      metadata: { id: "empty-stream", mode: "real", model: "empty-model", status: "configured" },
      async complete() {
        throw new Error("non-streaming should not be used");
      },
      async *completeStream() {
        return;
      }
    };
    const app = buildServer({ chatProvider: provider, allowProviderFallback: false });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat/stream",
      headers: bearer(adaToken),
      payload: { message: "Hello empty stream" }
    });

    expect(res.statusCode).toBe(200);
    const events = parseSseEvents(res.body);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "error",
          data: expect.objectContaining({
            code: "provider_error",
            message: "Chat provider failed before producing a safe response.",
            requestId: expect.stringMatching(/^req_/)
          })
        })
      ])
    );
    expect(events.some((event) => event.event === "done")).toBe(false);
  });

  it("requires auth before streaming", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat/stream",
      payload: { message: "Hello" }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: "auth_missing" });
  });

  it("requires selected project before streaming", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat/stream",
      headers: bearer(adaToken),
      payload: { message: "Hello" }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: "project_not_selected" });
  });

  it("validates message before streaming", async () => {
    const app = buildServer();

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat/stream",
      headers: bearer(adaToken),
      payload: { message: "" }
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: "chat_invalid" });
  });
});

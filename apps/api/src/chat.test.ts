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
      artifact: {
        id: "artifact_msg_000002",
        projectId: "project_alpha",
        kind: "note",
        sourceMessageId: "msg_000002",
        content: "Assistant: What should we build first?"
      },
      lifecycle: expect.arrayContaining([
        expect.objectContaining({ type: "user_message_received" }),
        expect.objectContaining({ type: "memory_recalled", metadata: { memoryCount: 0 } }),
        expect.objectContaining({ type: "skills_applied", metadata: { skillCount: 3 } }),
        expect.objectContaining({ type: "provider_started" }),
        expect.objectContaining({ type: "assistant_message_completed" })
      ]),
      requestId: expect.stringMatching(/^req_/)
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ projectId: "project_alpha", userId: "user_ada", requestId: expect.stringMatching(/^req_/) });
    expect(calls[0]?.messages).toEqual([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("You are BuildingAgent, a Hermes-like project assistant MVP.")
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
    expect(alphaChat.json()).toEqual({
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
      assistantMessage: { role: "assistant", content: "Mock assistant response for project_alpha: Local smoke" },
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

    await app.inject({ method: "POST", url: "/api/projects/project_beta/select", headers: bearer(adaToken) });
    const noWrite = await app.inject({
      method: "POST",
      url: "/api/projects/project_beta/chat",
      headers: bearer(adaToken),
      payload: { message: "Should not write" }
    });
    expect(noWrite.statusCode).toBe(403);
    expect(noWrite.json().error).toMatchObject({ code: "project_forbidden" });

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
      assistantMessage: { role: "assistant", content: "Mock assistant response for project_alpha: Recover locally" },
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
    expect(calls.at(-1)?.messages[0]?.content).toContain("Alpha prefers concise weekly summaries");
    assertNoSecrets(response.json());
  });

  it("indexes knowledge base files and saves assistant outputs as repository artifacts", async () => {
    const { provider, calls } = fakeProvider();
    const app = buildServer({ chatProvider: provider });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const kb = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/knowledge-base",
      headers: bearer(adaToken)
    });
    expect(kb.statusCode).toBe(200);
    expect(kb.json().documents).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "bldg40.ttl", kind: "turtle" })])
    );

    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Use the knowledge base" }
    });
    expect(posted.statusCode).toBe(201);
    const assistantId = posted.json().assistantMessage.id;
    expect(posted.json().artifact).toMatchObject({
      id: `artifact_${assistantId}`,
      projectId: "project_alpha",
      kind: "note",
      sourceMessageId: assistantId
    });
    expect(calls.at(-1)?.messages[0]?.content).toContain("bldg40.ttl");

    const repo = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/repository",
      headers: bearer(adaToken)
    });
    expect(repo.statusCode).toBe(200);
    expect(repo.json().artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: `artifact_${assistantId}`, name: expect.stringContaining("Assistant note") })])
    );
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
    expect(reset.json()).toEqual({
      projectId: "project_alpha",
      clearedMessages: 2,
      clearedMemories: 1,
      requestId: expect.stringMatching(/^req_/)
    });

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
    const app = buildServer();

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
});

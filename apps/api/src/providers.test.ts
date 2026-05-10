import { describe, expect, it } from "vitest";
import {
  ProviderError,
  createDeterministicMockProvider,
  createOpenAICompatibleProvider,
  redactedProviderError,
  resolveChatProvider
} from "./providers.js";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

function assertNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["sk-test-secret", "bearer", "authorization", "api_key", "apikey", "password"]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("chat provider resolution and adapters", () => {
  it("uses deterministic mock fallback when no real provider credentials are configured", async () => {
    const provider = resolveChatProvider({});
    const result = await provider.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "  Plan   phase one " }]
    });

    expect(result).toEqual({
      text: "Mock assistant response for project_alpha: Plan phase one",
      provider: {
        id: "deterministic-mock",
        mode: "mock",
        model: "deterministic-local-mock",
        fallbackReason: "local_default",
        status: "fallback"
      },
      fallbackUsed: true
    });
  });

  it("prefers a configured OpenAI-compatible provider and sends only chat messages to fetch", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = createOpenAICompatibleProvider({
      apiKey: "sk-test-secret",
      baseUrl: "https://provider.example/v1/",
      model: "model-a",
      fetch: async (input, init) => {
        calls.push(init === undefined ? { input } : { input, init });
        return jsonResponse({ choices: [{ message: { content: " Provider answer " } }] });
      }
    });

    const result = await provider.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(String(calls[0]?.input)).toBe("https://provider.example/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: "model-a",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.2
    });
    expect(result).toEqual({
      text: "Provider answer",
      provider: { id: "openai-compatible", mode: "real", model: "model-a", status: "configured" },
      fallbackUsed: false
    });
  });

  it("normalizes HTTP and malformed response failures without exposing provider secrets", async () => {
    const httpProvider = createOpenAICompatibleProvider({
      apiKey: "sk-test-secret",
      fetch: async () => jsonResponse({ error: { message: "nope" } }, { status: 429 })
    });

    await expect(
      httpProvider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      })
    ).rejects.toMatchObject({ code: "provider_http_error", status: 429 });

    try {
      await httpProvider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      });
    } catch (error) {
      const redacted = redactedProviderError(error);
      expect(redacted).toMatchObject({ code: "provider_http_error", status: 429 });
      assertNoSecrets(redacted);
    }

    const malformedProvider = createOpenAICompatibleProvider({
      apiKey: "sk-test-secret",
      fetch: async () => jsonResponse({ choices: [{ message: { content: "   " } }] })
    });
    await expect(
      malformedProvider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("allows explicit deterministic fallback provider construction for configured failure paths", async () => {
    const fallback = createDeterministicMockProvider("provider_error");
    const result = await fallback.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Need fallback" }]
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.provider).toMatchObject({ fallbackReason: "provider_error", mode: "mock" });
  });
});

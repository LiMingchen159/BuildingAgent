import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_UNAVAILABLE_MESSAGE,
  ProviderError,
  createDeterministicMockProvider,
  createOpenAICompatibleProvider,
  formatProviderFailureMessage,
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
  for (const forbidden of ["provider-test-key", "bearer", "authorization", "api_key", "apikey", "password"]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("chat provider resolution and adapters", () => {
  it("fails clearly when no real provider credentials are configured", async () => {
    const provider = resolveChatProvider({});
    await expect(
      provider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "  Plan   phase one " }]
      })
    ).rejects.toMatchObject({ code: "provider_not_configured", status: 503 });
  });

  it("prefers BUILDING_AGENT_LLM_* configuration while keeping mock explicit", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = resolveChatProvider(
      {
        BUILDING_AGENT_LLM_PROVIDER: "openai-compatible",
        BUILDING_AGENT_LLM_API_KEY: "provider-test-key",
        BUILDING_AGENT_LLM_BASE_URL: "https://provider.example/v1",
        BUILDING_AGENT_LLM_MODEL: "model-from-env",
        OPENAI_MODEL: "legacy-model"
      },
      {
        fetch: async (input, init) => {
          calls.push(init === undefined ? { input } : { input, init });
          return jsonResponse({ choices: [{ message: { content: " Env provider answer " } }] });
        }
      }
    );

    const result = await provider.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(String(calls[0]?.input)).toBe("https://provider.example/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body)).model).toBe("model-from-env");
    expect(result.provider).toEqual({ id: "openai-compatible", mode: "real", model: "model-from-env", status: "configured" });

    const mock = resolveChatProvider({ BUILDING_AGENT_LLM_PROVIDER: "mock", BUILDING_AGENT_LLM_API_KEY: "provider-test-key" });
    expect(mock.metadata).toMatchObject({ id: "deterministic-mock", mode: "mock", fallbackReason: "local_default" });
  });

  it("accepts existing LLM_* environment aliases", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = resolveChatProvider(
      {
        LLM_API_KEY: "provider-test-key",
        LLM_BASE_URL: "https://provider.example/v1",
        LLM_MODEL: "alias-model"
      },
      {
        fetch: async (input, init) => {
          calls.push(init === undefined ? { input } : { input, init });
          return jsonResponse({ choices: [{ message: { content: "Alias answer" } }] });
        }
      }
    );

    const result = await provider.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(String(calls[0]?.input)).toBe("https://provider.example/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body)).model).toBe("alias-model");
    expect(result.provider).toEqual({ id: "openai-compatible", mode: "real", model: "alias-model", status: "configured" });
  });

  it("prefers a configured OpenAI-compatible provider and sends only chat messages to fetch", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = createOpenAICompatibleProvider({
      apiKey: "provider-test-key",
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

  it("retries transient provider failures before surfacing an error", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const provider = createOpenAICompatibleProvider({
      apiKey: "provider-test-key",
      fetch: async () => {
        calls += 1;
        if (calls < 3) {
          return jsonResponse({ error: { message: "busy" } }, { status: 503 });
        }
        return jsonResponse({ choices: [{ message: { content: "Recovered" } }] });
      }
    });

    const promise = provider.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Hello" }]
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(calls).toBe(3);
    expect(result.text).toBe("Recovered");
    vi.useRealTimers();
  });

  it("normalizes HTTP and malformed response failures without exposing provider secrets", async () => {
    const httpProvider = createOpenAICompatibleProvider({
      apiKey: "provider-test-key",
      fetch: async () => jsonResponse({ error: { message: "nope" } }, { status: 401 })
    });

    await expect(
      httpProvider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      })
    ).rejects.toMatchObject({ code: "provider_http_error", status: 401 });

    try {
      await httpProvider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      });
    } catch (error) {
      const redacted = redactedProviderError(error);
      expect(redacted).toMatchObject({ code: "provider_http_error", status: 401 });
      assertNoSecrets(redacted);
    }

    const malformedProvider = createOpenAICompatibleProvider({
      apiKey: "provider-test-key",
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
    const sourceError = new ProviderError("Chat provider returned an unsuccessful status.", {
      code: "provider_http_error",
      status: 400,
      provider: { id: "openai-compatible", mode: "real", model: "deepseek-v4-pro", status: "400" },
      responseDetail: "maximum context length exceeded"
    });
    const fallback = createDeterministicMockProvider("provider_http_error", sourceError);
    const result = await fallback.complete({
      projectId: "project_alpha",
      userId: "user_ada",
      requestId: "req_test",
      messages: [{ role: "user", content: "Need fallback" }]
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.text).toContain("HTTP status: 400");
    expect(result.text).toContain("provider_http_error");
    expect(result.text).toContain("maximum context length exceeded");
    expect(result.text).not.toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(result.provider).toMatchObject({ fallbackReason: "provider_http_error", mode: "mock" });
  });

  it("formats provider failures with upstream response detail", () => {
    const message = formatProviderFailureMessage(
      new ProviderError("Chat provider returned an unsuccessful status.", {
        code: "provider_http_error",
        status: 400,
        provider: { id: "openai-compatible", mode: "real", model: "deepseek-v4-pro" },
        responseDetail: "request timeout after 120s"
      })
    );
    expect(message).toContain("HTTP status: 400");
    expect(message).toContain("request timeout after 120s");
    expect(message).toContain("deepseek-v4-pro");
  });

  it("captures sanitized HTTP error bodies from the provider", async () => {
    const provider = createOpenAICompatibleProvider({
      apiKey: "provider-test-key",
      baseUrl: "https://provider.example/v1",
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: "maximum context length exceeded" } }), {
          status: 400,
          headers: { "content-type": "application/json" }
        })
    });

    await expect(
      provider.complete({
        projectId: "project_alpha",
        userId: "user_ada",
        requestId: "req_test",
        messages: [{ role: "user", content: "Hello" }]
      })
    ).rejects.toMatchObject({
      code: "provider_http_error",
      status: 400,
      responseDetail: "maximum context length exceeded"
    });
  });
});

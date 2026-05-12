export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ProviderChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ProviderMetadata {
  id: string;
  mode: "mock" | "real";
  model: string;
  fallbackReason?: string;
  status?: string;
}

export interface ChatCompletionRequest {
  messages: ProviderChatMessage[];
  projectId: string;
  userId: string;
  requestId: string;
  signal?: AbortSignal;
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  stream?: boolean;
}

export interface ChatCompletionResult {
  text: string;
  toolCalls?: ChatToolCall[];
  provider: ProviderMetadata;
  fallbackUsed: boolean;
}

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionDelta {
  content?: string;
  toolCalls?: ChatToolCall[];
}

export interface ChatCompletionStreamResult {
  text: string;
  toolCalls: ChatToolCall[];
  provider: ProviderMetadata;
  fallbackUsed: boolean;
}

export interface ChatProvider {
  metadata: ProviderMetadata;
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
  completeStream?(request: ChatCompletionRequest): AsyncIterable<ChatCompletionDelta>;
}

export interface ProviderErrorOptions {
  code: string;
  status?: number;
  provider?: ProviderMetadata;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly provider?: ProviderMetadata;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code;
    if (options.status !== undefined) {
      this.status = options.status;
    }
    if (options.provider !== undefined) {
      this.provider = options.provider;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export type ProviderEnv = Record<string, string | undefined>;
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ResolveChatProviderOptions {
  fetch?: FetchLike;
  allowFallback?: boolean;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const MOCK_MODEL = "deterministic-local-mock";

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function envFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function normalizeProviderText(value: unknown, provider: ProviderMetadata): string {
  if (typeof value !== "string") {
    throw new ProviderError("Provider response did not include assistant text.", {
      code: "provider_malformed_response",
      provider
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 4000) {
    throw new ProviderError("Provider response assistant text was invalid.", {
      code: "provider_invalid_text",
      provider
    });
  }

  return trimmed;
}

function fallbackMetadata(reason: string, status = "fallback"): ProviderMetadata {
  return {
    id: "deterministic-mock",
    mode: "mock",
    model: MOCK_MODEL,
    fallbackReason: reason,
    status
  };
}

export function createDeterministicMockProvider(reason = "local_default"): ChatProvider {
  const metadata = fallbackMetadata(reason);

  return {
    metadata,
    async complete(request) {
      const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const normalized = lastUserMessage.replace(/\s+/gu, " ").trim();
      const text = normalized
        ? `Mock assistant response for ${request.projectId}: ${normalized}`
        : `Mock assistant response for ${request.projectId}.`;

      return {
        text,
        provider: metadata,
        fallbackUsed: true
      };
    }
  };
}

export function createDeterministicMockProviderWithTools(overrides: Partial<ChatProvider> = {}): ChatProvider {
  const metadata: ProviderMetadata = {
    id: "mock-with-tools",
    mode: "mock",
    model: MOCK_MODEL,
    status: "configured"
  };

  let toolCallCounter = 0;

  return {
    metadata,
    async complete(request) {
      const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const normalized = lastUserMessage.replace(/\s+/gu, " ").trim();

      // If message starts with "tool:", simulate tool calls
      if (normalized.startsWith("tool:") && request.tools && request.tools.length > 0) {
        const toolName = request.tools[0]!.function.name;
        toolCallCounter += 1;
        const toolCall: ChatToolCall = {
          id: `call_${String(toolCallCounter).padStart(4, "0")}`,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify({ query: normalized.slice(5).trim() || "test" })
          }
        };
        return {
          text: "",
          toolCalls: [toolCall],
          provider: metadata,
          fallbackUsed: false
        };
      }

      // If we have tool result messages (role: "tool"), this is the second turn — return final answer
      const hasToolResults = request.messages.some((m) => m.role === "tool");
      if (hasToolResults) {
        const toolMessages = request.messages.filter((m) => m.role === "tool");
        const lastToolResult = toolMessages.at(-1)?.content ?? "no result";
        return {
          text: `After running the tools, here's my analysis: ${normalized}. Tool results: ${lastToolResult}`,
          provider: metadata,
          fallbackUsed: false
        };
      }

      const text = normalized
        ? `Mock assistant response for ${request.projectId}: ${normalized}`
        : `Mock assistant response for ${request.projectId}.`;

      return { text, provider: metadata, fallbackUsed: false };
    },
    ...overrides
  };
}

export interface OpenAICompatibleProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetch?: FetchLike;
}

export function createOpenAICompatibleProvider(options: OpenAICompatibleProviderOptions): ChatProvider {
  const model = options.model?.trim() || DEFAULT_OPENAI_MODEL;
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/u, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const metadata: ProviderMetadata = {
    id: "openai-compatible",
    mode: "real",
    model,
    status: "configured"
  };

  if (typeof fetchImpl !== "function") {
    throw new ProviderError("No fetch implementation is available for provider requests.", {
      code: "provider_fetch_unavailable",
      provider: metadata
    });
  }

  function buildRequestBody(request: ChatCompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((message) => {
        const mapped: Record<string, unknown> = { role: message.role };
        if (message.content !== null) mapped.content = message.content;
        if (message.tool_calls) mapped.tool_calls = message.tool_calls;
        if (message.tool_call_id) mapped.tool_call_id = message.tool_call_id;
        if (message.name) mapped.name = message.name;
        return mapped;
      }),
      temperature: 0.2
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? "auto";
    }
    if (request.stream) {
      body.stream = true;
    }
    return body;
  }

  function parseToolCalls(body: Record<string, unknown>): ChatToolCall[] | undefined {
    const message = (body as { choices?: Array<{ message?: { tool_calls?: unknown } }> }).choices?.[0]?.message;
    if (!message || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
      return undefined;
    }
    return message.tool_calls as ChatToolCall[];
  }

  return {
    metadata,
    async complete(request) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(buildRequestBody(request)),
          ...(request.signal ? { signal: request.signal } : {})
        });
      } catch (cause) {
        throw new ProviderError("Chat provider request failed.", {
          code: "provider_request_failed",
          provider: metadata,
          cause
        });
      }

      if (!response.ok) {
        throw new ProviderError("Chat provider returned an unsuccessful status.", {
          code: "provider_http_error",
          status: response.status,
          provider: { ...metadata, status: String(response.status) }
        });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ProviderError("Chat provider returned malformed JSON.", {
          code: "provider_malformed_response",
          provider: metadata,
          cause
        });
      }

      const bodyRecord = body as Record<string, unknown>;
      const choice = (bodyRecord.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      const text = (typeof message?.content === "string" ? message.content : "") || "";
      const toolCalls = parseToolCalls(bodyRecord);

      if (!text && !toolCalls) {
        throw new ProviderError("Provider response did not include assistant text or tool calls.", {
          code: "provider_malformed_response",
          provider: metadata
        });
      }

      const result: ChatCompletionResult = {
        text: text || (toolCalls ? "Calling tools..." : ""),
        provider: metadata,
        fallbackUsed: false
      };
      if (toolCalls) result.toolCalls = toolCalls;
      return result;
    },

    async *completeStream(request) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(buildRequestBody({ ...request, stream: true })),
        ...(request.signal ? { signal: request.signal } : {})
      });

      if (!response.ok) {
        throw new ProviderError("Chat provider streaming request failed.", {
          code: "provider_http_error",
          status: response.status,
          provider: { ...metadata, status: String(response.status) }
        });
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new ProviderError("Chat provider streaming response had no body.", {
          code: "provider_malformed_response",
          provider: metadata
        });
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") return;

            try {
              const parsed = JSON.parse(data);
              const delta = (parsed as Record<string, unknown>).choices as Array<Record<string, unknown>> | undefined;
              if (!delta?.[0]) continue;

              const deltaMsg = delta[0].delta as Record<string, unknown> | undefined;
              if (!deltaMsg) continue;

              const result: ChatCompletionDelta = {};
              if (typeof deltaMsg.content === "string") {
                result.content = deltaMsg.content;
              }
              if (Array.isArray(deltaMsg.tool_calls)) {
                result.toolCalls = deltaMsg.tool_calls as ChatToolCall[];
              }
              if (result.content || result.toolCalls) {
                yield result;
              }
            } catch {
              // skip unparseable SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
}

export function resolveChatProvider(env: ProviderEnv, options: ResolveChatProviderOptions = {}): ChatProvider {
  const provider = nonEmpty(env.BUILDING_AGENT_LLM_PROVIDER);
  const apiKey = nonEmpty(env.BUILDING_AGENT_LLM_API_KEY ?? env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.CHAT_PROVIDER_API_KEY);
  const model = nonEmpty(env.BUILDING_AGENT_LLM_MODEL ?? env.LLM_MODEL ?? env.OPENAI_MODEL ?? env.CHAT_PROVIDER_MODEL) ?? DEFAULT_OPENAI_MODEL;
  const baseUrl = nonEmpty(env.BUILDING_AGENT_LLM_BASE_URL ?? env.LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? env.CHAT_PROVIDER_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL;

  if (provider && provider !== "mock" && provider !== "openai-compatible") {
    throw new ProviderError("Unsupported chat provider configured.", {
      code: "provider_unsupported",
      provider: { id: provider, mode: "real", model, status: "unsupported" }
    });
  }

  if (provider === "mock" || !apiKey) {
    return createDeterministicMockProvider("local_default");
  }

  return createOpenAICompatibleProvider({ apiKey, model, baseUrl, ...(options.fetch ? { fetch: options.fetch } : {}) });
}

export function shouldAllowProviderFallback(env: ProviderEnv, explicit?: boolean): boolean {
  return explicit ?? envFlag(env.BUILDING_AGENT_LLM_ALLOW_FALLBACK ?? env.LLM_ALLOW_FALLBACK ?? env.CHAT_PROVIDER_ALLOW_FALLBACK ?? env.ALLOW_PROVIDER_FALLBACK);
}

export function redactedProviderError(error: unknown): { code: string; status?: number; provider?: ProviderMetadata } {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.provider ? { provider: error.provider } : {})
    };
  }

  return { code: "provider_unknown_error" };
}

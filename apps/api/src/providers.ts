export type ChatRole = "user" | "assistant";

export interface ProviderChatMessage {
  role: ChatRole;
  content: string;
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
}

export interface ChatCompletionResult {
  text: string;
  provider: ProviderMetadata;
  fallbackUsed: boolean;
}

export interface ChatProvider {
  metadata: ProviderMetadata;
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
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
          body: JSON.stringify({
            model,
            messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
            temperature: 0.2
          }),
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

      const text = normalizeProviderText(
        (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content,
        metadata
      );

      return {
        text,
        provider: metadata,
        fallbackUsed: false
      };
    }
  };
}

export function resolveChatProvider(env: ProviderEnv, options: ResolveChatProviderOptions = {}): ChatProvider {
  const provider = nonEmpty(env.BUILDING_AGENT_LLM_PROVIDER);
  const apiKey = nonEmpty(env.BUILDING_AGENT_LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.CHAT_PROVIDER_API_KEY);
  const model = nonEmpty(env.BUILDING_AGENT_LLM_MODEL ?? env.OPENAI_MODEL ?? env.CHAT_PROVIDER_MODEL) ?? DEFAULT_OPENAI_MODEL;
  const baseUrl = nonEmpty(env.BUILDING_AGENT_LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? env.CHAT_PROVIDER_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL;

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
  return explicit ?? envFlag(env.BUILDING_AGENT_LLM_ALLOW_FALLBACK ?? env.CHAT_PROVIDER_ALLOW_FALLBACK ?? env.ALLOW_PROVIDER_FALLBACK);
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

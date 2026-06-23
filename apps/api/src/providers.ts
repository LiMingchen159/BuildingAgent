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
  maxTokens?: number;
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

export interface ProgressEvent {
  /** User-facing activity label */
  label: string;
  /** Machine-readable activity kind for dedup / icons */
  kind: "tool" | "memory" | "kb" | "file" | "response" | "context";
  /** Raw event name for debug panel (hidden from users) */
  raw?: string;
}

export interface ChatCompletionDelta {
  content?: string;
  toolCalls?: ChatToolCall[];
  progress?: ProgressEvent;
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
  /** Sanitized upstream response snippet (HTTP error bodies, etc.). */
  responseDetail?: string;
}

export class ProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly provider?: ProviderMetadata;
  readonly responseDetail?: string;

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
    if (options.responseDetail !== undefined) {
      this.responseDetail = options.responseDetail;
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
/** Five total attempts (initial + 4 retries) before surfacing a provider error. */
const PROVIDER_FETCH_MAX_RETRIES = 4;

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "I am unable to connect to a real LLM provider right now. Configure the LLM provider credentials and base URL to enable BuildingGPT streaming.";

function sanitizeProviderErrorDetail(value: string): string {
  return value
    .replace(/[A-Za-z0-9_./\\-]*(?:api[_-]?key|token|secret|password|authorization)[A-Za-z0-9_./\\-]*/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

async function readProviderErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const nested = body.error;
      if (typeof nested === "object" && nested !== null) {
        const nestedMessage = (nested as { message?: unknown }).message;
        if (typeof nestedMessage === "string" && nestedMessage.trim()) {
          return sanitizeProviderErrorDetail(nestedMessage);
        }
      }
      if (typeof body.message === "string" && body.message.trim()) {
        return sanitizeProviderErrorDetail(body.message);
      }
    } catch {
      // fall through to raw text
    }
    return sanitizeProviderErrorDetail(text);
  } catch {
    return undefined;
  }
}

/** User-facing message when the real LLM provider fails (fallback or hard error). */
export function formatProviderFailureMessage(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.code === "provider_not_configured") {
      return PROVIDER_UNAVAILABLE_MESSAGE;
    }

    const model = error.provider?.model;
    const lines = ["BuildingGPT could not finish this turn — the LLM provider returned an error."];
    if (model) {
      lines.push(`Model: ${model}.`);
    }
    if (error.status !== undefined) {
      lines.push(`HTTP status: ${error.status}.`);
    }
    lines.push(`Error code: ${error.code}.`);
    if (error.responseDetail) {
      lines.push(`Provider said: ${error.responseDetail}`);
    } else if (error.message && !error.message.includes("unsuccessful status") && !error.message.includes("request failed")) {
      lines.push(sanitizeProviderErrorDetail(error.message));
    }
    lines.push("If this keeps happening, check the provider credentials, base URL, and model.");
    return lines.join(" ");
  }

  if (typeof error === "string" && error.trim()) {
    return `BuildingGPT could not finish this turn — the LLM provider failed (${sanitizeProviderErrorDetail(error)}).`;
  }

  return PROVIDER_UNAVAILABLE_MESSAGE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriableProviderError(error: unknown): boolean {
  if (!(error instanceof ProviderError)) {
    return false;
  }
  if (error.code === "provider_request_failed") {
    return true;
  }
  if (error.code === "provider_http_error") {
    const status = error.status ?? 0;
    return status === 429 || status >= 500;
  }
  return false;
}

function providerRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof ProviderError && error.status === 429) {
    return 5000 + Math.floor(Math.random() * 5000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

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

function createProviderNotConfiguredError(metadata: ProviderMetadata): ProviderError {
  return new ProviderError("Chat provider is not configured.", {
    code: "provider_not_configured",
    status: 503,
    provider: metadata
  });
}

function mapProgressEvent(eventName: string | null, payload: Record<string, unknown> | null, _metadata: ProviderMetadata): ProgressEvent {
  const normalizedName = (eventName ?? "").toLowerCase();

  if (normalizedName.includes("tool")) {
    const tool = typeof payload?.tool === "string" ? payload.tool : null;
    const result: ProgressEvent = {
      label: tool ? `I am using ${tool}` : "I am running analysis tools",
      kind: "tool"
    };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (normalizedName.includes("memory")) {
    const result: ProgressEvent = { label: "I am checking project context", kind: "memory" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (normalizedName.includes("knowledge") || normalizedName.includes("search")) {
    const result: ProgressEvent = { label: "I am querying the knowledge base", kind: "kb" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (normalizedName.includes("file") || normalizedName.includes("read")) {
    const result: ProgressEvent = { label: "I am reading relevant files", kind: "file" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (normalizedName.includes("response")) {
    const result: ProgressEvent = { label: "I am organizing the answer", kind: "response" };
    if (eventName) result.raw = eventName;
    return result;
  }

  const stage = typeof payload?.stage === "string" ? payload.stage.toLowerCase() : "";
  if (stage.includes("tool")) {
    const result: ProgressEvent = { label: "I am running analysis tools", kind: "tool" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (stage.includes("memory")) {
    const result: ProgressEvent = { label: "I am checking project context", kind: "memory" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (stage.includes("knowledge") || stage.includes("search") || stage.includes("kb")) {
    const result: ProgressEvent = { label: "I am querying the knowledge base", kind: "kb" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (stage.includes("file") || stage.includes("read")) {
    const result: ProgressEvent = { label: "I am reading relevant files", kind: "file" };
    if (eventName) result.raw = eventName;
    return result;
  }
  if (stage.includes("final") || stage.includes("respond")) {
    const result: ProgressEvent = { label: "I am organizing the answer", kind: "response" };
    if (eventName) result.raw = eventName;
    return result;
  }

  const result: ProgressEvent = { label: "I am processing the request", kind: "context" };
  if (eventName) result.raw = eventName;
  return result;
}

export function createDeterministicMockProvider(reason = "local_default", sourceError?: unknown): ChatProvider {
  const metadata = fallbackMetadata(reason);
  const text = reason === "local_default"
    ? PROVIDER_UNAVAILABLE_MESSAGE
    : formatProviderFailureMessage(sourceError);

  return {
    metadata,
    async complete(_request) {
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

  function pickTools(request: ChatCompletionRequest): ChatToolCall[] {
    const userMsg = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const lowered = userMsg.toLowerCase();
    const available = request.tools ?? [];
    const byName = (name: string) => available.find((t) => t.function.name === name);

    const calls: ChatToolCall[] = [];
    toolCallCounter += 1;

    // Always search knowledge base first for relevant info
    if (byName("search_files") && (lowered.includes("ttl") || lowered.includes("brick") || lowered.includes("schema") || lowered.includes("file") || lowered.includes("knowledge"))) {
      calls.push({
        id: `call_${String(toolCallCounter).padStart(4, "0")}`,
        type: "function",
        function: { name: "search_files", arguments: JSON.stringify({ pattern: "ttl", mode: "files", glob: "*.ttl" }) }
      });
    }

    // Read a file if path mentioned
    if (byName("read_file") && (lowered.includes("read") || lowered.includes("check") || lowered.includes("inspect") || lowered.includes("look at"))) {
      calls.push({
        id: `call_${String(toolCallCounter + 1).padStart(4, "0")}`,
        type: "function",
        function: { name: "read_file", arguments: JSON.stringify({ path: "README.md" }) }
      });
    }

    // Terminal for analysis
    if (byName("terminal") && (lowered.includes("analyze") || lowered.includes("run") || lowered.includes("calculate") || lowered.includes("python"))) {
      calls.push({
        id: `call_${String(toolCallCounter + 2).padStart(4, "0")}`,
        type: "function",
        function: { name: "terminal", arguments: JSON.stringify({ command: "echo 'Analysis placeholder'" }) }
      });
    }

    // Reminder / scheduler patterns
    if (byName("schedule_reminder") && (lowered.includes("remind") || lowered.includes("reminder") || lowered.includes("提醒") || lowered.includes("秒") || lowered.includes("分钟") || lowered.includes("小时"))) {
      calls.push({
        id: `call_${String(toolCallCounter + 3).padStart(4, "0")}`,
        type: "function",
        function: { name: "schedule_reminder", arguments: JSON.stringify({ delay_seconds: 30, message: "Reminder from chat" }) }
      });
    }

    // Cancel reminder
    if (byName("cancel_reminder") && (lowered.includes("cancel") || lowered.includes("取消"))) {
      calls.push({
        id: `call_${String(toolCallCounter + 4).padStart(4, "0")}`,
        type: "function",
        function: { name: "cancel_reminder", arguments: JSON.stringify({ action: "cancel_recent" }) }
      });
    }

    // List reminders
    if (byName("list_reminders") && (lowered.includes("list") && (lowered.includes("remind") || lowered.includes("提醒")))) {
      calls.push({
        id: `call_${String(toolCallCounter + 5).padStart(4, "0")}`,
        type: "function",
        function: { name: "list_reminders", arguments: JSON.stringify({}) }
      });
    }

    // Fallback: use session_summary to show we're doing something
    if (calls.length === 0 && byName("session_summary")) {
      calls.push({
        id: `call_${String(toolCallCounter).padStart(4, "0")}`,
        type: "function",
        function: { name: "session_summary", arguments: JSON.stringify({}) }
      });
    }

    return calls;
  }

  return {
    metadata,
    async complete(request) {
      // If we already have tool results, this is a follow-up turn — synthesize a final answer
      const hasToolResults = request.messages.some((m) => m.role === "tool");
      if (hasToolResults) {
        const toolMessages = request.messages.filter((m) => m.role === "tool");
        const toolSummary = toolMessages.map((m) => {
          const content = m.content ?? "";
          try {
            const parsed = JSON.parse(content);
            if (parsed.matches) return `Found ${parsed.count ?? parsed.matches.length} matches in knowledge base`;
            if (parsed.content) return `Read file (${parsed.totalLines ?? "?"} lines)`;
            if (parsed.output) return `Command output: ${parsed.output.slice(0, 200)}`;
            if (parsed.projectId) return `Session summary for ${parsed.projectId}`;
            return JSON.stringify(parsed).slice(0, 150);
          } catch {
            return content.slice(0, 150);
          }
        }).join("; ");

        return {
          text: [
            `Here's what I found after running my analysis tools:\n\n`,
            `**Tool Results:** ${toolSummary}\n\n`,
            `Based on the data I gathered, here's my comprehensive analysis:\n\n`,
            `I've completed the following steps:\n`,
            `1. Searched the knowledge base for relevant files and schemas\n`,
            `2. Read the relevant configuration and data files\n`,
            `3. Analyzed the results to provide actionable insights\n\n`,
            PROVIDER_UNAVAILABLE_MESSAGE,
          ].join(""),
          provider: metadata,
          fallbackUsed: false
        };
      }

      // First turn: plan + execute tools
      const toolCalls = pickTools(request);
      if (toolCalls.length > 0) {
        const toolNames = toolCalls.map((t) => t.function.name).join(", ");
        return {
          text: `Let me analyze your request.\n\nI'll start by gathering information using these tools: ${toolNames}. One moment...`,
          toolCalls,
          provider: metadata,
          fallbackUsed: false
        };
      }

      const text = PROVIDER_UNAVAILABLE_MESSAGE;

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
    } else if (request.toolChoice === "none") {
      body.tool_choice = "none";
    }
    if (typeof request.maxTokens === "number" && request.maxTokens > 0) {
      body.max_tokens = request.maxTokens;
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

  function parseStreamingBlock(block: string): ChatCompletionDelta[] {
    const deltas: ChatCompletionDelta[] = [];
    let eventName: string | null = null;
    const dataLines: string[] = [];

    for (const rawLine of block.split(/\r?\n/u)) {
      const line = rawLine.trimEnd();
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") {
      return deltas;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return deltas;
    }

    const record = parsed as Record<string, unknown>;
    const choices = record.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (delta) {
      const item: ChatCompletionDelta = {};
      if (typeof delta.content === "string") {
        item.content = delta.content;
      }
      if (Array.isArray(delta.tool_calls)) {
        item.toolCalls = delta.tool_calls as ChatToolCall[];
      }
      if (item.content || item.toolCalls) {
        deltas.push(item);
      }
    }

    if (eventName === "hermes.tool.progress") {
      deltas.push({ progress: mapProgressEvent(eventName, record, metadata) });
      return deltas;
    }

    if (eventName && eventName !== "message" && eventName !== "response.output_text.delta") {
      deltas.push({ progress: mapProgressEvent(eventName, record, metadata) });
      return deltas;
    }

    if (eventName === "response.output_text.delta" && typeof record.delta === "string") {
      deltas.push({ content: record.delta });
    } else if (eventName === "response.output_text.done" && typeof record.text === "string") {
      deltas.push({ content: record.text });
    }

    return deltas;
  }

  async function postChatCompletions(request: ChatCompletionRequest): Promise<Response> {
    let lastError: unknown = null;
    const init: RequestInit = {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildRequestBody(request)),
      ...(request.signal ? { signal: request.signal } : {})
    };

    for (let attempt = 0; attempt <= PROVIDER_FETCH_MAX_RETRIES; attempt++) {
      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, init);
        if (!response.ok) {
          const responseDetail = await readProviderErrorDetail(response);
          throw new ProviderError("Chat provider returned an unsuccessful status.", {
            code: "provider_http_error",
            status: response.status,
            provider: { ...metadata, status: String(response.status) },
            ...(responseDetail ? { responseDetail } : {})
          });
        }
        return response;
      } catch (cause) {
        lastError = cause instanceof ProviderError
          ? cause
          : new ProviderError("Chat provider request failed.", {
              code: "provider_request_failed",
              provider: metadata,
              cause
            });
        if (attempt < PROVIDER_FETCH_MAX_RETRIES && isRetriableProviderError(lastError)) {
          await sleep(providerRetryDelayMs(lastError, attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError;
  }

  return {
    metadata,
    async complete(request) {
      const response = await postChatCompletions(request);

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
      const rawContent = typeof message?.content === "string" ? message.content : null;
      const toolCalls = parseToolCalls(bodyRecord);

      // Validate text content when present (only when no tool calls, to allow tool-only responses)
      let text: string;
      if (rawContent !== null && rawContent !== undefined) {
        text = normalizeProviderText(rawContent, metadata);
      } else if (toolCalls) {
        text = "Calling tools...";
      } else {
        throw new ProviderError("Provider response did not include assistant text or tool calls.", {
          code: "provider_malformed_response",
          provider: metadata
        });
      }

      const result: ChatCompletionResult = {
        text,
        provider: metadata,
        fallbackUsed: false
      };
      if (toolCalls) result.toolCalls = toolCalls;
      return result;
    },

    async *completeStream(request) {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= PROVIDER_FETCH_MAX_RETRIES; attempt++) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        try {
          const response = await postChatCompletions({ ...request, stream: true });
          reader = response.body?.getReader() ?? null;
          if (!reader) {
            throw new ProviderError("Chat provider streaming response had no body.", {
              code: "provider_malformed_response",
              provider: metadata
            });
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/u);
            buffer = blocks.pop() ?? "";

            for (const block of blocks) {
              if (block.includes("[DONE]")) {
                return;
              }
              for (const delta of parseStreamingBlock(block)) {
                yield delta;
              }
            }
          }

          if (buffer.includes("[DONE]")) {
            return;
          }
          for (const delta of parseStreamingBlock(buffer)) {
            yield delta;
          }
          return;
        } catch (cause) {
          lastError = cause instanceof ProviderError
            ? cause
            : new ProviderError("Chat provider streaming request failed.", {
                code: "provider_request_failed",
                provider: metadata,
                cause
              });
          if (attempt < PROVIDER_FETCH_MAX_RETRIES && isRetriableProviderError(lastError)) {
            await sleep(providerRetryDelayMs(lastError, attempt));
            continue;
          }
          throw lastError;
        } finally {
          reader?.releaseLock();
        }
      }

      throw lastError;
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

  if (provider === "mock") {
    return createDeterministicMockProvider("local_default");
  }

  if (!apiKey) {
    const metadata: ProviderMetadata = { id: "provider-not-configured", mode: "real", model, status: "unconfigured" };
    return {
      metadata,
      async complete() {
        throw createProviderNotConfiguredError(metadata);
      },
      async *completeStream() {
        throw createProviderNotConfiguredError(metadata);
      }
    };
  }

  return createOpenAICompatibleProvider({ apiKey, model, baseUrl, ...(options.fetch ? { fetch: options.fetch } : {}) });
}

export function shouldAllowProviderFallback(env: ProviderEnv, explicit?: boolean): boolean {
  return explicit ?? envFlag(env.BUILDING_AGENT_LLM_ALLOW_FALLBACK ?? env.LLM_ALLOW_FALLBACK ?? env.CHAT_PROVIDER_ALLOW_FALLBACK ?? env.ALLOW_PROVIDER_FALLBACK);
}

export function redactedProviderError(error: unknown): { code: string; status?: number; provider?: ProviderMetadata; responseDetail?: string } {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.provider ? { provider: error.provider } : {}),
      ...(error.responseDetail ? { responseDetail: error.responseDetail } : {})
    };
  }

  return { code: "provider_unknown_error" };
}

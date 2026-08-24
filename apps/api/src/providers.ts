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
/** One retry, owned by the provider adapter, after the initial attempt. */
const PROVIDER_FETCH_MAX_RETRIES = 1;
const PROVIDER_REQUEST_TIMEOUT_MS = 60_000;
const PROVIDER_REQUEST_MAX_BYTES = 4 * 1024 * 1024;

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
    if (error.code === "provider_payload_too_large") {
      return "BuildingGPT stopped this request locally before contacting the LLM provider because the serialized request exceeded the 4 MiB safety limit. Reduce the requested time range or data volume, then retry. Error code: provider_payload_too_large.";
    }
    if (error.code === "provider_timeout" || error.code === "agent_turn_timeout") {
      const scope = error.code === "provider_timeout" ? "LLM provider request" : "agent turn";
      return `BuildingGPT could not finish this turn because the ${scope} timed out. Reduce the request scope or try again. Error code: ${error.code}.`;
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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

interface ProviderDeadline {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
}

function createProviderDeadline(parentSignal?: AbortSignal): ProviderDeadline {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason);
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Provider request deadline exceeded.", "TimeoutError"));
  }, PROVIDER_REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
}

function raceWithProviderSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function normalizeProviderRequestError(
  cause: unknown,
  metadata: ProviderMetadata,
  deadline: ProviderDeadline,
  parentSignal?: AbortSignal,
  streaming = false
): ProviderError {
  if (cause instanceof ProviderError) {
    return cause;
  }
  if (deadline.didTimeout()) {
    return new ProviderError("Chat provider request timed out.", {
      code: "provider_timeout",
      status: 504,
      provider: metadata,
      responseDetail: `request exceeded ${PROVIDER_REQUEST_TIMEOUT_MS / 1000}s deadline`
    });
  }
  if (parentSignal?.aborted) {
    return new ProviderError("Chat provider request was cancelled.", {
      code: "provider_cancelled",
      provider: metadata
    });
  }
  return new ProviderError(
    streaming ? "Chat provider streaming request failed." : "Chat provider request failed.",
    {
      code: "provider_request_failed",
      provider: metadata,
      cause
    }
  );
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
  if (trimmed.length === 0) {
    throw new ProviderError("Provider response assistant text was invalid.", {
      code: "provider_empty_text",
      provider
    });
  }
  if (trimmed.length > 8000) {
    throw new ProviderError("Provider response assistant text was too long.", {
      code: "provider_text_too_long",
      provider,
      responseDetail: `assistant content length ${trimmed.length}`
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

  const isOfficialDeepSeekV4 = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com"
        && (model === "deepseek-v4-pro" || model === "deepseek-v4-flash");
    } catch {
      return false;
    }
  })();

  function isToolRequestOrContinuation(request: ChatCompletionRequest): boolean {
    return Boolean(
      request.tools?.length
      || request.messages.some((message) => message.role === "tool" || Boolean(message.tool_calls?.length))
    );
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
    // DeepSeek thinking-mode tool turns require opaque reasoning_content to be
    // replayed on every continuation. The runtime intentionally does not retain
    // hidden reasoning, so disable thinking for this narrowly scoped tool path.
    if (isOfficialDeepSeekV4 && isToolRequestOrContinuation(request)) {
      body.thinking = { type: "disabled" };
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

  function serializeRequestBody(request: ChatCompletionRequest): string {
    const serialized = JSON.stringify(buildRequestBody(request));
    const payloadBytes = new TextEncoder().encode(serialized).byteLength;
    if (payloadBytes > PROVIDER_REQUEST_MAX_BYTES) {
      throw new ProviderError("Chat provider request payload was too large.", {
        code: "provider_payload_too_large",
        status: 413,
        provider: metadata,
        responseDetail: `serialized request exceeded ${PROVIDER_REQUEST_MAX_BYTES} byte limit`
      });
    }
    return serialized;
  }

  async function postChatCompletions(request: ChatCompletionRequest, signal: AbortSignal): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json"
      },
      body: serializeRequestBody(request),
      signal
    };

    const response = await raceWithProviderSignal(fetchImpl(`${baseUrl}/chat/completions`, init), signal);
    if (!response.ok) {
      const responseDetail = await raceWithProviderSignal(readProviderErrorDetail(response), signal);
      throw new ProviderError("Chat provider returned an unsuccessful status.", {
        code: "provider_http_error",
        status: response.status,
        provider: { ...metadata, status: String(response.status) },
        ...(responseDetail ? { responseDetail } : {})
      });
    }
    return response;
  }

  return {
    metadata,
    async complete(request) {
      const deadline = createProviderDeadline(request.signal);
      try {
        let lastError: ProviderError | null = null;
        for (let attempt = 0; attempt <= PROVIDER_FETCH_MAX_RETRIES; attempt++) {
          try {
            const response = await postChatCompletions(request, deadline.signal);
            let body: unknown;
            try {
              body = await raceWithProviderSignal(response.json(), deadline.signal);
            } catch (cause) {
              if (deadline.signal.aborted) {
                throw cause;
              }
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

            const result: ChatCompletionResult = { text, provider: metadata, fallbackUsed: false };
            if (toolCalls) result.toolCalls = toolCalls;
            return result;
          } catch (cause) {
            lastError = normalizeProviderRequestError(cause, metadata, deadline, request.signal);
            if (attempt < PROVIDER_FETCH_MAX_RETRIES && isRetriableProviderError(lastError)) {
              try {
                await sleep(providerRetryDelayMs(lastError, attempt), deadline.signal);
              } catch (delayCause) {
                throw normalizeProviderRequestError(delayCause, metadata, deadline, request.signal);
              }
              continue;
            }
            throw lastError;
          }
        }
        throw lastError;
      } finally {
        deadline.dispose();
      }
    },

    async *completeStream(request) {
      const deadline = createProviderDeadline(request.signal);
      let lastError: ProviderError | null = null;
      let emittedDelta = false;
      try {
        for (let attempt = 0; attempt <= PROVIDER_FETCH_MAX_RETRIES; attempt++) {
          let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
          try {
            const response = await postChatCompletions({ ...request, stream: true }, deadline.signal);
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
              const { done, value } = await raceWithProviderSignal(reader.read(), deadline.signal);
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const blocks = buffer.split(/\r?\n\r?\n/u);
              buffer = blocks.pop() ?? "";

              for (const block of blocks) {
                if (block.includes("[DONE]")) {
                  return;
                }
                for (const delta of parseStreamingBlock(block)) {
                  emittedDelta = true;
                  yield delta;
                }
              }
            }

            if (buffer.includes("[DONE]")) {
              return;
            }
            for (const delta of parseStreamingBlock(buffer)) {
              emittedDelta = true;
              yield delta;
            }
            return;
          } catch (cause) {
            lastError = normalizeProviderRequestError(cause, metadata, deadline, request.signal, true);
            if (!emittedDelta && attempt < PROVIDER_FETCH_MAX_RETRIES && isRetriableProviderError(lastError)) {
              try {
                await sleep(providerRetryDelayMs(lastError, attempt), deadline.signal);
              } catch (delayCause) {
                throw normalizeProviderRequestError(delayCause, metadata, deadline, request.signal, true);
              }
              continue;
            }
            throw lastError;
          } finally {
            try {
              reader?.releaseLock();
            } catch {
              // A provider that ignores AbortSignal may leave reader.read()
              // pending. The logical request has still settled at the deadline.
            }
          }
        }
        throw lastError;
      } finally {
        deadline.dispose();
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

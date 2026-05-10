export interface ApiClientOptions {
  apiUrl: string;
  token?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface ApiErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
  };
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatProviderDiagnostics {
  id: string;
  mode: "mock" | "real";
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface ChatListResponse {
  messages: ChatMessage[];
  requestId: string;
}

export interface SendChatResponse {
  message: ChatMessage;
  assistantMessage: ChatMessage;
  provider: ChatProviderDiagnostics;
  fallbackUsed: boolean;
  requestId: string;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  toJSON(): { error: { code: string; message: string; status: number; requestId?: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        ...(this.requestId ? { requestId: this.requestId } : {})
      }
    };
  }
}

export class ApiClient {
  private readonly apiUrl: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/u, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async login(email: string, password: string): Promise<unknown> {
    return this.request("/api/login", {
      method: "POST",
      body: { email, password },
      auth: false
    });
  }

  async session(): Promise<unknown> {
    return this.request("/api/session", { method: "GET" });
  }

  async projects(): Promise<unknown> {
    return this.request("/api/projects", { method: "GET" });
  }

  async selectProject(projectId: string): Promise<unknown> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/select`, { method: "POST" });
  }

  async registry(): Promise<unknown> {
    return this.request("/api/registry", { method: "GET" });
  }

  async management(projectId: string): Promise<unknown> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/management`, { method: "GET" });
  }

  async listChat(projectId: string): Promise<ChatListResponse> {
    return parseChatListResponse(await this.request(`/api/projects/${encodeURIComponent(projectId)}/chat`, { method: "GET" }));
  }

  async sendChat(projectId: string, message: string): Promise<SendChatResponse> {
    return parseSendChatResponse(
      await this.request(`/api/projects/${encodeURIComponent(projectId)}/chat`, {
        method: "POST",
        body: { message }
      })
    );
  }

  private async request(
    path: string,
    options: { method: "GET" | "POST"; body?: unknown; auth?: boolean }
  ): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.auth !== false && this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }

    const requestInit: RequestInit = {
      method: options.method,
      headers
    };
    if (options.body !== undefined) {
      requestInit.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(`${this.apiUrl}${path}`, requestInit);

    const payload = await readJson(response);
    if (!response.ok) {
      throw errorFromResponse(response.status, payload);
    }
    return payload;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      throw new ApiClientError(response.status, "api_invalid_json", "API returned a non-JSON error response.");
    }
    throw new ApiClientError(response.status, "api_invalid_json", "API returned a non-JSON response.");
  }
}

function errorFromResponse(status: number, payload: unknown): ApiClientError {
  const body = payload as ApiErrorBody;
  const code = typeof body?.error?.code === "string" ? body.error.code : "api_error";
  const message = typeof body?.error?.message === "string" ? body.error.message : "API request failed.";
  const requestId = typeof body?.error?.requestId === "string" ? body.error.requestId : undefined;
  return new ApiClientError(status, code, message, requestId);
}

function malformed(message: string): ApiClientError {
  return new ApiClientError(200, "api_malformed", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseChatMessage(value: unknown, message: string): ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.userId !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string"
  ) {
    throw malformed(message);
  }

  return {
    id: value.id,
    projectId: value.projectId,
    userId: value.userId,
    role: value.role,
    content: value.content
  };
}

function parseProviderDiagnostics(value: unknown, fallbackUsed: boolean): ChatProviderDiagnostics {
  if (!isRecord(value) || typeof value.id !== "string" || (value.mode !== "mock" && value.mode !== "real") || typeof value.model !== "string") {
    throw malformed("Chat post returned unexpected provider diagnostics.");
  }
  if ("fallbackReason" in value && value.fallbackReason !== undefined && typeof value.fallbackReason !== "string") {
    throw malformed("Chat post returned unexpected provider diagnostics.");
  }

  return {
    id: value.id,
    mode: value.mode,
    model: value.model,
    fallbackUsed,
    ...(typeof value.fallbackReason === "string" ? { fallbackReason: value.fallbackReason } : {})
  };
}

function parseChatListResponse(payload: unknown): ChatListResponse {
  if (!isRecord(payload) || !Array.isArray(payload.messages) || typeof payload.requestId !== "string") {
    throw malformed("Chat returned an unexpected response.");
  }

  return {
    messages: payload.messages.map((message) => parseChatMessage(message, "Chat returned an unexpected message.")),
    requestId: payload.requestId
  };
}

function parseSendChatResponse(payload: unknown): SendChatResponse {
  if (!isRecord(payload) || typeof payload.requestId !== "string" || typeof payload.fallbackUsed !== "boolean") {
    throw malformed("Chat post returned an unexpected response.");
  }

  const userMessage = parseChatMessage(payload.message, "Chat post returned an unexpected user message.");
  if (userMessage.role !== "user") {
    throw malformed("Chat post returned an unexpected user message.");
  }

  const assistantMessage = parseChatMessage(payload.assistantMessage, "Chat post returned an unexpected assistant message.");
  if (assistantMessage.role !== "assistant") {
    throw malformed("Chat post returned an unexpected assistant message.");
  }

  return {
    message: userMessage,
    assistantMessage,
    provider: parseProviderDiagnostics(payload.provider, payload.fallbackUsed),
    fallbackUsed: payload.fallbackUsed,
    requestId: payload.requestId
  };
}

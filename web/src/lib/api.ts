"use client";

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  workspaceId: string;
  selectedProjectId?: string | null;
};

export type Project = {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  requestId?: string;

  constructor(message: string, code = "client_error", status = 0, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

type RequestOptions = {
  token?: string | null;
  method?: string;
  body?: unknown;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_BUILDINGAGENT_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const MAX_HISTORY_MESSAGES = 80;

function assertObject(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiClientError(`${context} returned malformed data`, "malformed_response");
  }
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ApiClientError(`Backend response omitted ${field}`, "malformed_response");
  }
  return value;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError("Backend returned a non-JSON response", "malformed_response", response.status);
  }
}

function errorFromEnvelope(payload: unknown, status: number): ApiClientError {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as ApiErrorEnvelope).error;
    if (error && typeof error.message === "string" && typeof error.code === "string") {
      return new ApiClientError(error.message, error.code, status, typeof error.requestId === "string" ? error.requestId : undefined);
    }
  }
  return new ApiClientError("Backend request failed", "backend_error", status);
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method: options.method || (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiClientError("Backend is unavailable. Check that the local API is running.", "backend_unavailable");
  }

  const payload = await parseJson(response);
  if (!response.ok) throw errorFromEnvelope(payload, response.status);
  return payload;
}

function parseUser(value: unknown): User {
  assertObject(value, "User");
  return {
    id: assertString(value.id, "user.id"),
    email: assertString(value.email, "user.email"),
    displayName: assertString(value.displayName, "user.displayName"),
    workspaceId: assertString(value.workspaceId, "user.workspaceId"),
    selectedProjectId: typeof value.selectedProjectId === "string" ? value.selectedProjectId : null,
  };
}

function parseProject(value: unknown): Project {
  assertObject(value, "Project");
  return {
    id: assertString(value.id, "project.id"),
    name: assertString(value.name, "project.name"),
    workspaceId: assertString(value.workspaceId, "project.workspaceId"),
    createdAt: assertString(value.createdAt, "project.createdAt"),
  };
}

function parseMessage(value: unknown): ChatMessage {
  assertObject(value, "Chat message");
  const role = assertString(value.role, "message.role");
  if (role !== "user" && role !== "assistant") throw new ApiClientError("Backend returned an unknown message role", "malformed_response");
  return {
    id: assertString(value.id, "message.id"),
    projectId: assertString(value.projectId, "message.projectId"),
    role,
    content: assertString(value.content, "message.content"),
    createdAt: assertString(value.createdAt, "message.createdAt"),
  };
}

export async function login(email: string, password: string): Promise<{ accessToken: string; tokenType: "bearer"; user: User }> {
  const payload = await request("/auth/login", { body: { email, password } });
  assertObject(payload, "Login");
  const tokenType = assertString(payload.tokenType, "tokenType");
  if (tokenType !== "bearer") throw new ApiClientError("Backend returned an unsupported token type", "malformed_response");
  return {
    accessToken: assertString(payload.accessToken, "accessToken"),
    tokenType,
    user: parseUser(payload.user),
  };
}

export async function getProjects(token: string): Promise<Project[]> {
  const payload = await request("/projects", { token });
  assertObject(payload, "Projects");
  if (!Array.isArray(payload.projects)) throw new ApiClientError("Backend response omitted projects", "malformed_response");
  return payload.projects.map(parseProject);
}

export async function selectProject(token: string, projectId: string): Promise<Project> {
  const payload = await request(`/projects/${encodeURIComponent(projectId)}/select`, { method: "POST", token });
  assertObject(payload, "Project selection");
  return parseProject(payload.selectedProject);
}

export async function getChatHistory(token: string, projectId: string): Promise<ChatMessage[]> {
  const payload = await request(`/projects/${encodeURIComponent(projectId)}/chat?limit=${MAX_HISTORY_MESSAGES}`, { token });
  assertObject(payload, "Chat history");
  if (!Array.isArray(payload.messages)) throw new ApiClientError("Backend response omitted messages", "malformed_response");
  return payload.messages.map(parseMessage).slice(-MAX_HISTORY_MESSAGES);
}

export async function sendChatMessage(token: string, projectId: string, message: string): Promise<ChatMessage[]> {
  const payload = await request(`/projects/${encodeURIComponent(projectId)}/chat`, { token, body: { message } });
  assertObject(payload, "Chat response");
  if (!Array.isArray(payload.messages)) throw new ApiClientError("Backend response omitted messages", "malformed_response");
  return payload.messages.map(parseMessage);
}

export function safeApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.requestId ? `${error.message} (request ${error.requestId})` : error.message;
  return "Something went wrong. No secret details were exposed.";
}

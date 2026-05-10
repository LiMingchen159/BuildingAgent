export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId?: string | undefined;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly status: number | undefined;

  constructor(detail: ApiErrorDetail, status?: number) {
    super(detail.message);
    this.name = "ApiClientError";
    this.code = detail.code;
    this.requestId = detail.requestId;
    this.status = status;
  }
}

export interface UserSummary {
  id: string;
  name: string;
}

export interface SessionSummary {
  userId: string;
  projectId: string | null;
  permissions: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  permissions: string[];
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user";
  content: string;
}

export interface LoginResponse {
  token: string;
  user: UserSummary;
  requestId: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const REQUEST_TIMEOUT_MS = 8000;

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApiError(value: unknown): ApiErrorDetail | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }
  const { code, message, requestId } = value.error;
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }
  return { code, message, requestId: typeof requestId === "string" ? requestId : undefined };
}

function malformed(message = "The API returned an unreadable response."): ApiClientError {
  return new ApiClientError({ code: "api_malformed", message });
}

function unavailable(): ApiClientError {
  return new ApiClientError({ code: "api_unavailable", message: "Local API is unavailable. Check that the API dev server is running, then retry." });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw malformed();
  }
}

async function requestJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "content-type": "application/json",
        ...options.headers
      },
      signal: controller.signal
    });
    const payload = await readJson(response);
    if (!response.ok) {
      const detail = parseApiError(payload) ?? { code: "api_malformed", message: "The API returned an error in an unexpected format." };
      throw new ApiClientError(detail, response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw unavailable();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const payload = await requestJson("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if (!isRecord(payload) || typeof payload.token !== "string" || !isRecord(payload.user) || typeof payload.user.id !== "string" || typeof payload.user.name !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Login returned an unexpected response.");
  }
  return { token: payload.token, user: { id: payload.user.id, name: payload.user.name }, requestId: payload.requestId };
}

export async function getSession(token: string): Promise<{ session: SessionSummary; requestId: string }> {
  const payload = await requestJson("/api/session", { headers: authHeaders(token) });
  if (!isRecord(payload) || !isRecord(payload.session) || typeof payload.session.userId !== "string" || !(typeof payload.session.projectId === "string" || payload.session.projectId === null) || !Array.isArray(payload.session.permissions) || typeof payload.requestId !== "string") {
    throw malformed("Session returned an unexpected response.");
  }
  return {
    session: {
      userId: payload.session.userId,
      projectId: payload.session.projectId,
      permissions: payload.session.permissions.filter((permission): permission is string => typeof permission === "string")
    },
    requestId: payload.requestId
  };
}

export async function listProjects(token: string): Promise<{ projects: ProjectSummary[]; requestId: string }> {
  const payload = await requestJson("/api/projects", { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.projects) || typeof payload.requestId !== "string") {
    throw malformed("Projects returned an unexpected response.");
  }
  return {
    projects: payload.projects.flatMap((project): ProjectSummary[] => {
      if (!isRecord(project) || typeof project.id !== "string" || typeof project.name !== "string" || !Array.isArray(project.permissions)) {
        return [];
      }
      return [{ id: project.id, name: project.name, permissions: project.permissions.filter((permission): permission is string => typeof permission === "string") }];
    }),
    requestId: payload.requestId
  };
}

export async function selectProject(token: string, projectId: string): Promise<{ session: SessionSummary; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/select`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || !isRecord(payload.session) || typeof payload.session.userId !== "string" || typeof payload.session.projectId !== "string" || !Array.isArray(payload.session.permissions) || typeof payload.requestId !== "string") {
    throw malformed("Project selection returned an unexpected response.");
  }
  return {
    session: {
      userId: payload.session.userId,
      projectId: payload.session.projectId,
      permissions: payload.session.permissions.filter((permission): permission is string => typeof permission === "string")
    },
    requestId: payload.requestId
  };
}

export async function getChat(token: string, projectId: string): Promise<{ messages: ChatMessage[]; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/chat`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.messages) || typeof payload.requestId !== "string") {
    throw malformed("Chat returned an unexpected response.");
  }
  return {
    messages: payload.messages.flatMap((message): ChatMessage[] => {
      if (!isRecord(message) || typeof message.id !== "string" || typeof message.projectId !== "string" || typeof message.userId !== "string" || message.role !== "user" || typeof message.content !== "string") {
        return [];
      }
      return [{ id: message.id, projectId: message.projectId, userId: message.userId, role: message.role, content: message.content }];
    }),
    requestId: payload.requestId
  };
}

export async function sendChatMessage(token: string, projectId: string, message: string): Promise<{ message: ChatMessage; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message })
  });
  if (!isRecord(payload) || !isRecord(payload.message) || typeof payload.message.id !== "string" || typeof payload.message.projectId !== "string" || typeof payload.message.userId !== "string" || payload.message.role !== "user" || typeof payload.message.content !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Chat post returned an unexpected response.");
  }
  return {
    message: {
      id: payload.message.id,
      projectId: payload.message.projectId,
      userId: payload.message.userId,
      role: payload.message.role,
      content: payload.message.content
    },
    requestId: payload.requestId
  };
}

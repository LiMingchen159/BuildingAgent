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

export type PlaceholderStatus = "placeholder" | "mock" | "not_configured";

interface PlaceholderBase {
  id: string;
  name: string;
  status: PlaceholderStatus;
  description: string;
}

export interface RuntimeProviderSummary extends PlaceholderBase {
  kind: "llm" | "embedding" | "workflow";
}

export interface ToolSummary extends PlaceholderBase {
  category: "analysis" | "retrieval" | "building";
}

export interface SkillSummary extends PlaceholderBase {
  domain: "building" | "project" | "runtime";
}

export interface GatewaySummary extends PlaceholderBase {
  protocol: "http" | "mcp" | "local";
}

export interface BuildingCapabilitySummary extends PlaceholderBase {
  domain: "energy" | "safety" | "maintenance" | "planning";
}

export interface RegistryResponse {
  runtimeProviders: RuntimeProviderSummary[];
  tools: ToolSummary[];
  skills: SkillSummary[];
  gateways: GatewaySummary[];
  buildingCapabilities: BuildingCapabilitySummary[];
  limit: number;
  placeholderOnly: true;
  requestId: string;
}

export interface ProjectManagementResponse {
  projectId: string;
  gateways: GatewaySummary[];
  capabilities: BuildingCapabilitySummary[];
  tools: ToolSummary[];
  limit: number;
  placeholderOnly: true;
  requestId: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const REQUEST_TIMEOUT_MS = 8000;
const PLACEHOLDER_STATUSES = new Set(["placeholder", "mock", "not_configured"]);
const RUNTIME_KINDS = new Set(["llm", "embedding", "workflow"]);
const TOOL_CATEGORIES = new Set(["analysis", "retrieval", "building"]);
const SKILL_DOMAINS = new Set(["building", "project", "runtime"]);
const GATEWAY_PROTOCOLS = new Set(["http", "mcp", "local"]);
const CAPABILITY_DOMAINS = new Set(["energy", "safety", "maintenance", "planning"]);

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringIn<T extends string>(value: unknown, allowed: Set<string>): value is T {
  return typeof value === "string" && allowed.has(value);
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

function hasPlaceholderBase(value: Record<string, unknown>): value is Record<string, unknown> & PlaceholderBase {
  return typeof value.id === "string" && typeof value.name === "string" && typeof value.description === "string" && isStringIn<PlaceholderStatus>(value.status, PLACEHOLDER_STATUSES);
}

function parseRuntimeProvider(value: unknown): RuntimeProviderSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<RuntimeProviderSummary["kind"]>(value.kind, RUNTIME_KINDS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, kind: value.kind };
}

function parseTool(value: unknown): ToolSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<ToolSummary["category"]>(value.category, TOOL_CATEGORIES)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, category: value.category };
}

function parseSkill(value: unknown): SkillSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<SkillSummary["domain"]>(value.domain, SKILL_DOMAINS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, domain: value.domain };
}

function parseGateway(value: unknown): GatewaySummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<GatewaySummary["protocol"]>(value.protocol, GATEWAY_PROTOCOLS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, protocol: value.protocol };
}

function parseCapability(value: unknown): BuildingCapabilitySummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<BuildingCapabilitySummary["domain"]>(value.domain, CAPABILITY_DOMAINS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, domain: value.domain };
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null, message: string): T[] {
  if (!Array.isArray(value)) {
    throw malformed(message);
  }
  return value.map((item) => {
    const parsed = parser(item);
    if (!parsed) {
      throw malformed(message);
    }
    return parsed;
  });
}

function assertPlaceholderMeta(payload: Record<string, unknown>, message: string): { limit: number; requestId: string } {
  if (typeof payload.limit !== "number" || payload.placeholderOnly !== true || typeof payload.requestId !== "string") {
    throw malformed(message);
  }
  return { limit: payload.limit, requestId: payload.requestId };
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

export async function getRegistry(token: string): Promise<RegistryResponse> {
  const payload = await requestJson("/api/registry", { headers: authHeaders(token) });
  if (!isRecord(payload)) {
    throw malformed("Registry returned an unexpected response.");
  }
  const meta = assertPlaceholderMeta(payload, "Registry returned an unexpected response.");
  return {
    runtimeProviders: parseArray(payload.runtimeProviders, parseRuntimeProvider, "Registry returned unexpected runtime providers."),
    tools: parseArray(payload.tools, parseTool, "Registry returned unexpected tools."),
    skills: parseArray(payload.skills, parseSkill, "Registry returned unexpected skills."),
    gateways: parseArray(payload.gateways, parseGateway, "Registry returned unexpected gateways."),
    buildingCapabilities: parseArray(payload.buildingCapabilities, parseCapability, "Registry returned unexpected building capabilities."),
    limit: meta.limit,
    placeholderOnly: true,
    requestId: meta.requestId
  };
}

export async function getProjectManagement(token: string, projectId: string): Promise<ProjectManagementResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/management`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.projectId !== "string") {
    throw malformed("Project management returned an unexpected response.");
  }
  const meta = assertPlaceholderMeta(payload, "Project management returned an unexpected response.");
  return {
    projectId: payload.projectId,
    gateways: parseArray(payload.gateways, parseGateway, "Project management returned unexpected gateways."),
    capabilities: parseArray(payload.capabilities, parseCapability, "Project management returned unexpected capabilities."),
    tools: parseArray(payload.tools, parseTool, "Project management returned unexpected tools."),
    limit: meta.limit,
    placeholderOnly: true,
    requestId: meta.requestId
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

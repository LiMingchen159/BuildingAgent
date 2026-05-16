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

export interface ChatMessageImage {
  src: string;
  alt: string;
  filename?: string | undefined;
  capturedAt?: string | undefined;
  source?: string | undefined;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatMessageImage[] | undefined;
  artifactId?: string | undefined;
  activities?: ChatStreamActivityEvent[] | undefined;
  workDuration?: number | undefined;
}

export interface KnowledgeBaseDocument {
  id: string;
  projectId: string;
  name: string;
  path: string;
  kind: "text" | "turtle" | "markdown" | "parquet" | "data" | "other";
  sizeBytes: number;
  excerpt?: string | undefined;
}

export interface RepositoryArtifact {
  id: string;
  projectId: string;
  name: string;
  path?: string;
  kind: "note" | "analysis" | "summary" | "image" | "chart" | "report" | "table";
  generatedAt: string;
  sourceMessageId?: string;
  description?: string;
  content?: string;
  sizeBytes?: number;
}

export interface ChatProviderDiagnostics {
  id: string;
  mode: "mock" | "real";
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string | undefined;
  status?: string | undefined;
}

export interface ChatLifecycleEvent {
  type: string;
  message: string;
  at: string;
  metadata?: Record<string, string | number | boolean> | undefined;
}

export interface ChatStreamActivityEvent {
  id?: string;
  label: string;
  kind: "tool" | "memory" | "kb" | "file" | "response" | "context";
  tool?: string;
  status?: "running" | "done";
  raw?: string;
  requestId?: string;
  detail?: string;
  output?: string;
  durationMs?: number;
  exitCode?: number;
}

export interface ChatStreamProgressEvent {
  message: string;
  requestId?: string;
}

export interface SendChatResponse {
  message: ChatMessage;
  assistantMessage: ChatMessage;
  conversationId?: string | undefined;
  conversationTitle?: string | undefined;
  artifact?: RepositoryArtifact | undefined;
  provider: ChatProviderDiagnostics;
  fallbackUsed: boolean;
  lifecycle?: ChatLifecycleEvent[] | undefined;
  requestId: string;
}

export interface StreamEventHandlers {
  onLifecycle?: (event: ChatLifecycleEvent) => void;
  onProgress?: (event: ChatStreamProgressEvent) => void;
  onActivity?: (event: ChatStreamActivityEvent) => void;
  onToken?: (content: string) => void;
  onTokenReset?: () => void;
  onError?: (error: ApiErrorDetail) => void;
  onDone?: (response: SendChatResponse) => void;
}

export async function sendChatMessageStream(
  token: string,
  projectId: string,
  message: string,
  handlers: StreamEventHandlers,
  conversationId?: string,
  signal?: AbortSignal
): Promise<void> {
  const url = apiUrl(`/api/projects/${encodeURIComponent(projectId)}/chat/stream`);

  const streamHeaders = new Headers(authHeaders(token));
  streamHeaders.set("Content-Type", "application/json");

  const fetchInit: RequestInit = {
    method: "POST",
    headers: streamHeaders,
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) })
  };
  if (signal) {
    fetchInit.signal = signal;
  }

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch {
    handlers.onError?.({ code: "api_unavailable", message: "Local API is unavailable. Check that the API dev server is running, then retry." });
    return;
  }

  if (!response.ok) {
    const detail = parseApiError(await readJson(response));
    handlers.onError?.(detail ?? { code: "stream_failed", message: "Stream connection failed" });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.({ code: "stream_unsupported", message: "No response body available for streaming" });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventType = "";
  let completed = false;
  let failed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);

            switch (currentEventType) {
              case "lifecycle":
                if (isChatLifecycleEvent(parsed)) {
                  handlers.onLifecycle?.(parsed);
                }
                break;
              case "activity":
                if (typeof (parsed as Record<string, unknown>).label === "string") {
                  const act = parsed as Record<string, unknown>;
                  handlers.onActivity?.({
                    ...(typeof act.id === "string" ? { id: act.id } : {}),
                    label: act.label as string,
                    kind: (act.kind as ChatStreamActivityEvent["kind"]) ?? "context",
                    ...(typeof act.tool === "string" ? { tool: act.tool } : {}),
                    ...(typeof act.status === "string" ? { status: act.status as "running" | "done" } : {}),
                    ...(typeof act.raw === "string" ? { raw: act.raw } : {}),
                    ...(typeof act.requestId === "string" ? { requestId: act.requestId } : {}),
                    ...(typeof act.detail === "string" ? { detail: act.detail } : {}),
                    ...(typeof act.output === "string" ? { output: act.output } : {}),
                    ...(typeof act.durationMs === "number" ? { durationMs: act.durationMs } : {}),
                    ...(typeof act.exitCode === "number" ? { exitCode: act.exitCode } : {})
                  });
                }
                break;
              case "progress":
                if (typeof (parsed as Record<string, unknown>).message === "string") {
                  const payload = parsed as Record<string, unknown>;
                  handlers.onProgress?.({ message: payload.message as string, ...(typeof payload.requestId === "string" ? { requestId: payload.requestId } : {}) });
                }
                break;
              case "token":
                if (typeof (parsed as Record<string, unknown>).content === "string") {
                  handlers.onToken?.((parsed as { content: string }).content);
                }
                break;
              case "token_reset":
                handlers.onTokenReset?.();
                break;
              case "error":
                failed = true;
                handlers.onError?.({
                  code: typeof parsed.code === "string" ? parsed.code : "stream_error",
                  message: typeof parsed.message === "string" ? parsed.message : "Stream error",
                  ...(typeof parsed.requestId === "string" ? { requestId: parsed.requestId } : {})
                });
                break;
              case "done":
                completed = true;
                handlers.onDone?.(parsed as SendChatResponse);
                break;
            }
          } catch {
            // skip unparseable lines
          }
          currentEventType = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!completed && !failed) {
    handlers.onError?.({
      code: "stream_incomplete",
      message: "Chat stream ended before the assistant returned a final response."
    });
  }
}

function isChatLifecycleEvent(value: unknown): value is ChatLifecycleEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).type === "string" &&
    typeof (value as Record<string, unknown>).message === "string" &&
    typeof (value as Record<string, unknown>).at === "string"
  );
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
  limit: number;
  requestId: string;
}

export interface CreateConversationResponse {
  conversation: ConversationSummary;
  requestId: string;
}

export interface SelectConversationResponse {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  requestId: string;
}

export interface CreateProjectResponse {
  project: ProjectSummary;
  session: SessionSummary;
  requestId: string;
}

export interface ResetChatResponse {
  projectId: string;
  clearedMessages: number;
  clearedMemories: number;
  requestId: string;
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
    const headers = new Headers(options.headers);
    if (options.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(apiUrl(path), {
      ...options,
      headers,
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
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export interface BmsCapabilitySet {
  discover_points: boolean;
  read_latest: boolean;
  read_history: boolean;
  write_point: boolean;
}

export interface BmsHealthResponse {
  ok: boolean;
  service: string;
  request_id?: string;
}

export type BmsVendorType =
  | "mock"
  | "custom_rest_api"
  | "bacnet_ip"
  | "haystack"
  | "niagara_honeywell_webs"
  | "schneider_ebo"
  | "jci_metasys"
  | "siemens_building_x"
  | "csv_manual";

export type BmsProtocolType =
  | "mock"
  | "rest"
  | "bacnet_ip"
  | "haystack"
  | "webs"
  | "ebo"
  | "metasys"
  | "building_x"
  | "csv";

export type BmsAuthType = "none" | "basic" | "bearer" | "token";

export interface BmsSourcePayload {
  project_id: string;
  building_id: string;
  name: string;
  vendor_type: BmsVendorType;
  protocol_type: BmsProtocolType;
  base_url: string | null;
  host: string | null;
  port: number | null;
  auth_type: BmsAuthType;
  read_only: boolean;
  config: Record<string, unknown>;
}

export interface BmsConnectionTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  capabilities: BmsCapabilitySet;
  tested_at: string;
}

export interface BmsSourceSummary extends BmsSourcePayload {
  source_id: string;
  status: "draft" | "configured" | "testing" | "connected" | "failed" | "discovering" | "ready" | "ingesting";
  created_at: string;
  updated_at: string;
  last_connection_test?: BmsConnectionTestResponse | undefined;
  last_ingestion_job_id?: string | undefined;
}

export interface BmsPointSummary {
  id: string;
  point_name: string;
  vendor_point_id: string;
  unit: string;
  equipment_name: string;
  system_name: string;
  location: string;
  point_type: string;
  writable: boolean;
  semantic_class: string;
  status: string;
}

export interface BmsDiscoverPointsResponse {
  source_id: string;
  points: BmsPointSummary[];
  count: number;
}

export interface BmsMinimalIngestionRequest {
  source_id: string;
  point_ids: string[];
  sample_count: number;
  interval_seconds: number;
}

export interface BmsIngestionJobStatusResponse {
  job_id: string;
  source_id: string;
  status: "running" | "completed" | "failed";
  sample_count: number;
  interval_seconds: number;
  total_expected_records: number;
  inserted_records: number;
  success_rate: number;
  started_at: string;
  finished_at: string | null;
  errors: string[];
}

export interface BmsIngestionSeriesValue {
  timestamp: string;
  value: number;
  quality: "good" | "bad" | "uncertain";
}

export interface BmsIngestionSeries {
  point_id: string;
  point_name: string;
  unit: string;
  values: BmsIngestionSeriesValue[];
}

export interface BmsIngestionResultsResponse {
  job_id: string;
  series: BmsIngestionSeries[];
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

export async function getChat(token: string, projectId: string, conversationId?: string): Promise<{ messages: ChatMessage[]; activeConversationId?: string | null; requestId: string }> {
  let url = `/api/projects/${encodeURIComponent(projectId)}/chat`;
  if (conversationId) {
    url += `?conversationId=${encodeURIComponent(conversationId)}`;
  }
  const payload = await requestJson(url, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.messages) || typeof payload.requestId !== "string") {
    throw malformed("Chat returned an unexpected response.");
  }
  const result: { messages: ChatMessage[]; activeConversationId?: string | null; requestId: string } = {
    messages: payload.messages.map((message) => parseChatMessage(message, "Chat returned an unexpected message.")),
    requestId: payload.requestId
  };
  if (typeof payload.activeConversationId === "string" || payload.activeConversationId === null) {
    result.activeConversationId = payload.activeConversationId;
  }
  return result;
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

function parseChatMessageActivity(value: unknown): ChatStreamActivityEvent | null {
  if (!isRecord(value) || typeof value.label !== "string") return null;
  const kind = typeof value.kind === "string" ? value.kind : "context";
  const allowedKinds = new Set(["tool", "memory", "kb", "file", "response", "context"]);
  if (!allowedKinds.has(kind)) return null;
  const result: ChatStreamActivityEvent = {
    label: value.label,
    kind: kind as ChatStreamActivityEvent["kind"]
  };
  if (typeof value.id === "string") result.id = value.id;
  if (typeof value.tool === "string") result.tool = value.tool;
  if (value.status === "running" || value.status === "done") result.status = value.status;
  if (typeof value.raw === "string") result.raw = value.raw;
  if (typeof value.requestId === "string") result.requestId = value.requestId;
  if (typeof value.detail === "string") result.detail = value.detail;
  if (typeof value.output === "string") result.output = value.output;
  if (typeof value.durationMs === "number") result.durationMs = value.durationMs;
  if (typeof value.exitCode === "number") result.exitCode = value.exitCode;
  return result;
}

function parseChatMessageActivities(value: unknown): ChatStreamActivityEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ChatStreamActivityEvent[] = [];
  for (const entry of value) {
    const parsed = parseChatMessageActivity(entry);
    if (parsed) out.push(parsed);
  }
  return out.length > 0 ? out : undefined;
}

function parseChatMessage(value: unknown, message: string): ChatMessage {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.projectId !== "string" || typeof value.userId !== "string" || (value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") {
    throw malformed(message);
  }
  const images = parseChatMessageImages(value.images, message);
  const activities = parseChatMessageActivities(value.activities);
  return {
    id: value.id,
    projectId: value.projectId,
    userId: value.userId,
    role: value.role,
    content: value.content,
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(images ? { images } : {}),
    ...(activities ? { activities } : {}),
    ...(typeof value.workDuration === "number" ? { workDuration: value.workDuration } : {})
  };
}

function parseKnowledgeBaseDocument(value: unknown): KnowledgeBaseDocument | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.projectId !== "string" || typeof value.name !== "string" || typeof value.path !== "string" || typeof value.sizeBytes !== "number") {
    return null;
  }
  if (!isStringIn<KnowledgeBaseDocument["kind"]>(value.kind, new Set(["text", "turtle", "markdown", "parquet", "data", "other"]))) {
    return null;
  }
  return {
    id: value.id,
    projectId: value.projectId,
    name: value.name,
    path: value.path,
    kind: value.kind,
    sizeBytes: value.sizeBytes,
    ...(typeof value.excerpt === "string" ? { excerpt: value.excerpt } : {})
  };
}

function parseRepositoryArtifact(value: unknown): RepositoryArtifact | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.projectId !== "string" || typeof value.name !== "string" || typeof value.generatedAt !== "string") {
    return null;
  }
  if (!isStringIn<RepositoryArtifact["kind"]>(value.kind, new Set(["note", "analysis", "summary", "image", "chart", "report", "table"]))) {
    return null;
  }
  // sourceMessageId, description, content, sizeBytes are optional for disk-scanned files
  if ("sourceMessageId" in value && value.sourceMessageId !== undefined && typeof value.sourceMessageId !== "string") return null;
  if ("description" in value && value.description !== undefined && typeof value.description !== "string") return null;
  if ("content" in value && value.content !== undefined && typeof value.content !== "string") return null;
  if ("sizeBytes" in value && value.sizeBytes !== undefined && typeof value.sizeBytes !== "number") return null;
  const sourceMessageId = typeof value.sourceMessageId === "string" ? value.sourceMessageId : undefined;
  const description = typeof value.description === "string" ? value.description : undefined;
  const content = typeof value.content === "string" ? value.content : undefined;
  const sizeBytes = typeof value.sizeBytes === "number" ? value.sizeBytes : undefined;
  return {
    id: value.id,
    projectId: value.projectId,
    name: value.name,
    kind: value.kind,
    generatedAt: value.generatedAt,
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(description ? { description } : {}),
    ...(content ? { content } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {})
  };
}

function parseChatMessageImages(value: unknown, message: string): ChatMessageImage[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw malformed(message);
  }
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.src !== "string" || typeof entry.alt !== "string") {
      throw malformed(message);
    }
    return {
      src: entry.src,
      alt: entry.alt,
      ...(typeof entry.filename === "string" ? { filename: entry.filename } : {}),
      ...(typeof entry.capturedAt === "string" ? { capturedAt: entry.capturedAt } : {}),
      ...(typeof entry.source === "string" ? { source: entry.source } : {})
    };
  });
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
    ...(typeof value.fallbackReason === "string" ? { fallbackReason: value.fallbackReason } : {}),
    ...(typeof value.status === "string" ? { status: value.status } : {})
  };
}

function parseLifecycleEvents(value: unknown): ChatLifecycleEvent[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw malformed("Chat post returned unexpected lifecycle events.");
  }
  return value.map((event) => {
    if (!isRecord(event) || typeof event.type !== "string" || typeof event.message !== "string" || typeof event.at !== "string") {
      throw malformed("Chat post returned unexpected lifecycle events.");
    }
    return {
      type: event.type,
      message: event.message,
      at: event.at,
      ...(isRecord(event.metadata) ? { metadata: event.metadata as Record<string, string | number | boolean> } : {})
    };
  });
}

export async function sendChatMessage(token: string, projectId: string, message: string, conversationId?: string): Promise<SendChatResponse> {
  const body: Record<string, unknown> = { message };
  if (conversationId) {
    body.conversationId = conversationId;
  }
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body)
  });
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
  const lifecycle = parseLifecycleEvents(payload.lifecycle);
  const artifact = payload.artifact === undefined ? undefined : parseRepositoryArtifact(payload.artifact);
  if (payload.artifact !== undefined && !artifact) {
    throw malformed("Chat post returned an unexpected repository artifact.");
  }
  return {
    message: userMessage,
    assistantMessage,
    ...(typeof payload.conversationId === "string" ? { conversationId: payload.conversationId } : {}),
    ...(typeof payload.conversationTitle === "string" ? { conversationTitle: payload.conversationTitle } : {}),
    ...(artifact ? { artifact } : {}),
    provider: parseProviderDiagnostics(payload.provider, payload.fallbackUsed),
    fallbackUsed: payload.fallbackUsed,
    ...(lifecycle ? { lifecycle } : {}),
    requestId: payload.requestId
  };
}

export async function getKnowledgeBase(token: string, projectId: string): Promise<{ documents: KnowledgeBaseDocument[]; totalCount: number; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/knowledge-base`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.documents) || typeof payload.requestId !== "string") {
    throw malformed("Knowledge base returned an unexpected response.");
  }
  return {
    documents: payload.documents.map((document) => {
      const parsed = parseKnowledgeBaseDocument(document);
      if (!parsed) {
        throw malformed("Knowledge base returned an unexpected document.");
      }
      return parsed;
    }),
    totalCount: typeof payload.totalCount === "number" ? payload.totalCount : payload.documents.length,
    requestId: payload.requestId
  };
}

export async function getRepository(token: string, projectId: string): Promise<{ artifacts: RepositoryArtifact[]; totalCount: number; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/repository`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.artifacts) || typeof payload.requestId !== "string") {
    throw malformed("Repository returned an unexpected response.");
  }
  return {
    artifacts: payload.artifacts.map((artifact) => {
      const parsed = parseRepositoryArtifact(artifact);
      if (!parsed) {
        throw malformed("Repository returned an unexpected artifact.");
      }
      return parsed;
    }),
    totalCount: typeof payload.totalCount === "number" ? payload.totalCount : payload.artifacts.length,
    requestId: payload.requestId
  };
}

export async function resetChat(token: string, projectId: string, conversationId?: string): Promise<ResetChatResponse> {
  let url = `/api/projects/${encodeURIComponent(projectId)}/chat`;
  if (conversationId) {
    url += `?conversationId=${encodeURIComponent(conversationId)}`;
  }
  const payload = await requestJson(url, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.projectId !== "string" || typeof payload.clearedMessages !== "number" || typeof payload.clearedMemories !== "number" || typeof payload.requestId !== "string") {
    throw malformed("Chat reset returned an unexpected response.");
  }
  return {
    projectId: payload.projectId,
    clearedMessages: payload.clearedMessages,
    clearedMemories: payload.clearedMemories,
    requestId: payload.requestId
  };
}

export async function createProject(token: string, name: string): Promise<CreateProjectResponse> {
  const payload = await requestJson("/api/projects", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name })
  });
  if (!isRecord(payload) || !isRecord(payload.project) || typeof payload.project.id !== "string" || typeof payload.project.name !== "string" || !Array.isArray(payload.project.permissions) || !isRecord(payload.session) || typeof payload.session.userId !== "string" || typeof payload.session.projectId !== "string" || !Array.isArray(payload.session.permissions) || typeof payload.requestId !== "string") {
    throw malformed("Create project returned an unexpected response.");
  }
  return {
    project: {
      id: payload.project.id,
      name: payload.project.name,
      permissions: payload.project.permissions.filter((p): p is string => typeof p === "string")
    },
    session: {
      userId: payload.session.userId,
      projectId: payload.session.projectId,
      permissions: payload.session.permissions.filter((p): p is string => typeof p === "string")
    },
    requestId: payload.requestId
  };
}

export async function getConversations(token: string, projectId: string): Promise<ConversationsResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/conversations`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.conversations) || typeof payload.requestId !== "string") {
    throw malformed("Conversations returned an unexpected response.");
  }
  return {
    conversations: payload.conversations.map((c) => {
      if (!isRecord(c) || typeof c.id !== "string" || typeof c.title !== "string" || typeof c.messageCount !== "number" || typeof c.createdAt !== "string") {
        throw malformed("Conversations returned an unexpected entry.");
      }
      return { id: c.id, title: c.title, messageCount: c.messageCount, createdAt: c.createdAt };
    }),
    limit: typeof payload.limit === "number" ? payload.limit : 50,
    requestId: payload.requestId
  };
}

export async function createConversation(token: string, projectId: string): Promise<CreateConversationResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || !isRecord(payload.conversation) || typeof payload.conversation.id !== "string" || typeof payload.conversation.title !== "string" || typeof payload.conversation.messageCount !== "number" || typeof payload.conversation.createdAt !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Create conversation returned an unexpected response.");
  }
  return {
    conversation: {
      id: payload.conversation.id,
      title: payload.conversation.title,
      messageCount: payload.conversation.messageCount,
      createdAt: payload.conversation.createdAt
    },
    requestId: payload.requestId
  };
}

export async function selectConversation(token: string, projectId: string, convId: string): Promise<SelectConversationResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(convId)}/select`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || !isRecord(payload.conversation) || typeof payload.conversation.id !== "string" || typeof payload.conversation.title !== "string" || typeof payload.conversation.messageCount !== "number" || typeof payload.conversation.createdAt !== "string" || !Array.isArray(payload.messages) || typeof payload.requestId !== "string") {
    throw malformed("Select conversation returned an unexpected response.");
  }
  return {
    conversation: {
      id: payload.conversation.id,
      title: payload.conversation.title,
      messageCount: payload.conversation.messageCount,
      createdAt: payload.conversation.createdAt
    },
    messages: payload.messages.map((message) => parseChatMessage(message, "Select conversation returned an unexpected message.")),
    requestId: payload.requestId
  };
}

export interface RenameConversationResponse {
  conversation: ConversationSummary;
  requestId: string;
}

export interface DeleteConversationResponse {
  deleted: boolean;
  conversationId: string;
  removedMessages: number;
  requestId: string;
}

export interface DeleteProjectResponse {
  deleted: boolean;
  projectId: string;
  requestId: string;
}

export async function renameConversation(token: string, projectId: string, convId: string, title: string): Promise<RenameConversationResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(convId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ title })
  });
  if (!isRecord(payload) || !isRecord(payload.conversation) || typeof payload.conversation.id !== "string" || typeof payload.conversation.title !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Rename conversation returned an unexpected response.");
  }
  return {
    conversation: {
      id: payload.conversation.id,
      title: payload.conversation.title,
      messageCount: typeof payload.conversation.messageCount === "number" ? payload.conversation.messageCount : 0,
      createdAt: typeof payload.conversation.createdAt === "string" ? payload.conversation.createdAt : ""
    },
    requestId: payload.requestId
  };
}

export async function deleteConversation(token: string, projectId: string, convId: string): Promise<DeleteConversationResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(convId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.deleted !== "boolean" || typeof payload.conversationId !== "string" || typeof payload.removedMessages !== "number" || typeof payload.requestId !== "string") {
    throw malformed("Delete conversation returned an unexpected response.");
  }
  return {
    deleted: payload.deleted,
    conversationId: payload.conversationId,
    removedMessages: payload.removedMessages,
    requestId: payload.requestId
  };
}

export async function deleteProject(token: string, projectId: string): Promise<DeleteProjectResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.deleted !== "boolean" || typeof payload.projectId !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Delete project returned an unexpected response.");
  }
  return {
    deleted: payload.deleted,
    projectId: payload.projectId,
    requestId: payload.requestId
  };
}

export async function getBmsHealth(token: string): Promise<BmsHealthResponse> {
  const payload = await requestJson("/api/bms/health", { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.ok !== "boolean" || typeof payload.service !== "string") {
    throw malformed("BMS health returned an unexpected response.");
  }
  return {
    ok: payload.ok,
    service: payload.service,
    ...(typeof payload.request_id === "string" ? { request_id: payload.request_id } : {})
  };
}

export async function createBmsSource(token: string, payload: BmsSourcePayload): Promise<BmsSourceSummary> {
  const response = await requestJson("/api/bms/sources", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.source_id !== "string" || typeof response.project_id !== "string") {
    throw malformed("BMS create source returned an unexpected response.");
  }
  return response as unknown as BmsSourceSummary;
}

export async function listBmsSources(token: string, projectId: string): Promise<BmsSourceSummary[]> {
  const payload = await requestJson(`/api/bms/sources?project_id=${encodeURIComponent(projectId)}`, { headers: authHeaders(token) });
  if (!Array.isArray(payload)) {
    throw malformed("BMS source list returned an unexpected response.");
  }
  return payload as unknown as BmsSourceSummary[];
}

export async function getBmsSource(token: string, sourceId: string): Promise<BmsSourceSummary> {
  const payload = await requestJson(`/api/bms/sources/${encodeURIComponent(sourceId)}`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.source_id !== "string") {
    throw malformed("BMS source returned an unexpected response.");
  }
  return payload as unknown as BmsSourceSummary;
}

export async function saveBmsCredentials(token: string, sourceId: string, payload: { auth_type: BmsAuthType; username?: string; password?: string; token?: string }): Promise<BmsSourceSummary> {
  const response = await requestJson(`/api/bms/sources/${encodeURIComponent(sourceId)}/credentials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.source_id !== "string") {
    throw malformed("BMS credentials save returned an unexpected response.");
  }
  return response as unknown as BmsSourceSummary;
}

export async function testBmsConnection(token: string, sourceId: string): Promise<BmsConnectionTestResponse> {
  const payload = await requestJson(`/api/bms/sources/${encodeURIComponent(sourceId)}/test-connection`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.source_id !== "string" || typeof payload.success !== "boolean" || typeof payload.message !== "string" || !isRecord(payload.capabilities) || typeof payload.tested_at !== "string") {
    throw malformed("BMS connection test returned an unexpected response.");
  }
  return payload as unknown as BmsConnectionTestResponse;
}

export async function discoverBmsPoints(token: string, sourceId: string): Promise<BmsDiscoverPointsResponse> {
  const payload = await requestJson(`/api/bms/sources/${encodeURIComponent(sourceId)}/discover-points`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.source_id !== "string" || !Array.isArray(payload.points) || typeof payload.count !== "number") {
    throw malformed("BMS discover points returned an unexpected response.");
  }
  return payload as unknown as BmsDiscoverPointsResponse;
}

export async function listBmsPoints(token: string, sourceId: string): Promise<BmsDiscoverPointsResponse> {
  const payload = await requestJson(`/api/bms/sources/${encodeURIComponent(sourceId)}/points`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.source_id !== "string" || !Array.isArray(payload.points)) {
    throw malformed("BMS point list returned an unexpected response.");
  }
  return payload as unknown as BmsDiscoverPointsResponse;
}

export async function suggestBmsSemanticMapping(token: string, pointIds: string[]): Promise<never> {
  void token;
  void pointIds;
  throw new ApiClientError({ code: "not_implemented", message: "Semantic mapping is not available in MVP yet." }, 501);
}

export async function runMinimalBmsIngestionTest(token: string, payload: BmsMinimalIngestionRequest): Promise<{ job_id: string; status: "running"; message: string }> {
  const response = await requestJson("/api/bms/ingestion/test", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.job_id !== "string" || typeof response.status !== "string" || typeof response.message !== "string") {
    throw malformed("BMS ingestion test returned an unexpected response.");
  }
  return { job_id: response.job_id, status: "running", message: response.message };
}

export async function getBmsIngestionJob(token: string, jobId: string): Promise<BmsIngestionJobStatusResponse> {
  const payload = await requestJson(`/api/bms/ingestion/jobs/${encodeURIComponent(jobId)}`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.job_id !== "string" || typeof payload.source_id !== "string" || typeof payload.status !== "string") {
    throw malformed("BMS job returned an unexpected response.");
  }
  return payload as unknown as BmsIngestionJobStatusResponse;
}

export async function getBmsIngestionResults(token: string, jobId: string): Promise<BmsIngestionResultsResponse> {
  const payload = await requestJson(`/api/bms/ingestion/jobs/${encodeURIComponent(jobId)}/results`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.job_id !== "string" || !Array.isArray(payload.series)) {
    throw malformed("BMS results returned an unexpected response.");
  }
  return payload as unknown as BmsIngestionResultsResponse;
}

// ---- WebSocket ----

export type WsEventHandler = (data: Record<string, unknown>) => void;

export interface ProjectSocket {
  close(): void;
  on(event: "message", handler: WsEventHandler): void;
  on(event: "close", handler: () => void): void;
}

/** Create a WebSocket connection for real-time project updates. */
export function createProjectSocket(
  projectId: string,
  token: string,
  apiBaseUrl?: string
): ProjectSocket {
  const base = (apiBaseUrl ?? API_BASE_URL).replace(/\/+$/, "");
  const isHttps = base.startsWith("https://");
  const wsBase = isHttps ? base.replace("https://", "wss://") : base.replace("http://", "ws://");
  const url = `${wsBase}/api/projects/${encodeURIComponent(projectId)}/ws?token=${encodeURIComponent(token)}`;

  const handlers: { message: WsEventHandler[]; close: (() => void)[] } = { message: [], close: [] };
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function connect(): void {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      // Connected
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        for (const handler of handlers.message) {
          handler(data as Record<string, unknown>);
        }
      } catch {
        // skip unparseable
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!closed) {
        scheduleReconnect();
      } else {
        for (const handler of handlers.close) handler();
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect(): void {
    if (closed) return;
    reconnectTimer = setTimeout(connect, 5000);
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
    on(event: "message" | "close", handler: WsEventHandler | (() => void)) {
      if (event === "message") {
        handlers.message.push(handler as WsEventHandler);
      } else {
        handlers.close.push(handler as () => void);
      }
    }
  };
}

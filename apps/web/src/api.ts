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

export interface PlatformBoundsLayer {
  mutable: boolean;
  description: string;
}

export interface PlatformBoundsResponse {
  layers: {
    platform: PlatformBoundsLayer;
    operator: PlatformBoundsLayer;
    playbook: PlatformBoundsLayer;
    userMemory: PlatformBoundsLayer;
    projectMemory: PlatformBoundsLayer;
    /** @deprecated Use userMemory */
    personalMemory: PlatformBoundsLayer;
  };
  currentUser: {
    canConfigure: boolean;
  };
}

export interface ChatMessageImage {
  src: string;
  alt: string;
  filename?: string | undefined;
  capturedAt?: string | undefined;
  source?: string | undefined;
}

export interface ChatMessageDownload {
  path: string;
  filename: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatMessageImage[] | undefined;
  downloads?: ChatMessageDownload[] | undefined;
  artifactId?: string | undefined;
  activities?: ChatStreamActivityEvent[] | undefined;
  workDuration?: number | undefined;
  /** Tool-only duration per work segment (client-computed; excludes narration). */
  workSegmentDurations?: number[] | undefined;
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

export type DashboardVisibility = "private" | "project";
export type DashboardWidgetKind = "live_value_grid" | "timeseries_chart" | "stat_value" | "bar_comparison" | "status_grid" | "fdd_fault_rate_comparison" | "fdd_attribution_analysis" | "note";
export type DashboardSectionKind = "overview" | "analysis" | "comparison" | "trends" | "custom";
export type DashboardNoteTone = "yellow" | "blue" | "green" | "pink" | "neutral";
export type DashboardPointSource = "bms" | "derived_metric";

export interface DashboardPointBinding {
  id?: string;
  source?: DashboardPointSource;
  bmsSourceId?: string;
  pointName?: string;
  objectRef?: string;
  metricInstanceId?: string;
  metricKey?: string;
  entityId?: string;
  label?: string;
  role?: string;
  dependencyRole?: string;
  defaultVisible?: boolean;
  groupId?: string;
  unit?: string;
  description?: string;
  fddParameters?: Array<Record<string, unknown>>;
}

export interface DashboardLayoutItem {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  pointBindings: DashboardPointBinding[];
  defaultTimeRange?: string;
  content?: string;
  tone?: DashboardNoteTone;
}

export interface DashboardSection {
  id: string;
  title: string;
  kind: DashboardSectionKind;
  widgetIds: string[];
  collapsed?: boolean;
}

export interface DashboardRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  visibility: DashboardVisibility;
  title: string;
  description?: string;
  layoutVersion?: number;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidget[];
  sections?: DashboardSection[];
  createdAt: string;
  updatedAt: string;
  sourceConversationId?: string;
}

export type DerivedMetricFormulaKind = "ratio" | "difference" | "fdd_rule";
export type DerivedMetricInvalidValuePolicy = "null" | "zero";
export type DerivedMetricAlignmentPolicy = "exact" | "nearest";

export interface DerivedMetricDependency {
  dependencyId: string;
  instanceId: string;
  role: string;
  sourceType: "raw_point" | "metric";
  sourceId: string;
  pointName?: string;
  objectRef?: string;
  unit?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivedMetricInstance {
  instanceId: string;
  projectId: string;
  definitionId: string;
  versionId: string;
  metricKey: string;
  metricType: string;
  entityId: string;
  entityName?: string;
  displayName: string;
  unit?: string;
  formulaVersion: string;
  formula: string;
  formulaDescription?: string;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  dependencies: DerivedMetricDependency[];
}

export interface DerivedMetricSample {
  sampleId: string;
  instanceId: string;
  projectId: string;
  ts: string;
  valueNum?: number;
  valueText?: string;
  quality: string;
  status: string;
  formulaVersionId: string;
  calculationRunId?: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DerivedMetricMaterialization {
  instanceId: string;
  projectId: string;
  enabled: boolean;
  intervalSeconds: number;
  lookbackSeconds: number;
  formulaKind?: DerivedMetricFormulaKind;
  leftRole?: string;
  rightRole?: string;
  invalidValuePolicy?: DerivedMetricInvalidValuePolicy;
  alignmentPolicy?: DerivedMetricAlignmentPolicy;
  alignmentToleranceSeconds?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  watermarkTs?: string;
  status: string;
  lastError?: string;
  updatedAt: string;
}

export interface DerivedMetricDashboardLink {
  id: string;
  title: string;
  widgetCount: number;
  path: string;
}

export interface DerivedMetricAsset {
  instance: DerivedMetricInstance;
  latest: DerivedMetricSample | null;
  materialization: DerivedMetricMaterialization | null;
  linkedDashboards: DerivedMetricDashboardLink[];
}

export type FddAlgorithmScope = "global_builtin" | "global_community";
export type FddEquipmentType = "ahu" | "chiller" | "pump" | "cooling_tower" | "fcu" | "vav" | "sensor";
export type FddMethod = "rule_based" | "bayesian_network" | "performance_indicator" | "statistical";
export type FddDeployabilityStatus = "can_deploy" | "uncertain" | "cannot_deploy";
export type FddTaskStatus = "checking" | "ready" | "running" | "paused" | "cannot_deploy";
export type FddTaskSource = "global_library" | "project_upload" | "buildinggpt_generated";
export type FddSharingScope = "project_only" | "global_community";
export type FddQuantityKind = "temperature" | "flow_rate" | "power" | "energy" | "load" | "status" | "pressure" | "humidity" | "position" | "speed" | "current" | "level" | "concentration" | "unknown";
export type FddDefinitionStatus = "implementation_ready" | "requires_configuration" | "requires_review";
export type FddDefinitionParameterResolution = "source_default" | "source_expression" | "site_required";
export type FddUnitCompatibility = "match" | "convertible" | "mismatch" | "unknown";
export type FddParameterType = "number" | "boolean" | "select";
export type FddParameterValue = string | number | boolean;
export type FddParameterSource = "algorithm_default" | "buildinggpt_recommended" | "user_override";

export interface FddRequiredPoint {
  slot: string;
  label: string;
  semantic: string;
  required: boolean;
  quantityKind: FddQuantityKind;
  unitRoleDescription: string;
  acceptableUnits?: string[];
  keywords?: string[];
  sourceSymbols?: string[];
  sourceBrickClasses?: string[];
  historyRequirement?: {
    minDays: number;
    preferredDays: number;
  };
}

export interface FddDefinitionParameter {
  symbol: string;
  rawDefault?: string;
  resolution: FddDefinitionParameterResolution;
}

export interface FddSourceDefinition {
  ruleId: string;
  sourceFile: string;
  sha256: string;
  requiredPointsRaw: string;
  tunableParametersRaw: string;
  brickClassesRaw: string;
}

export interface FddOutput {
  key: string;
  label: string;
  type: "boolean" | "number" | "text";
  unit?: string;
}

export interface FddParameterSpec {
  key: string;
  label: string;
  type: FddParameterType;
  defaultValue: FddParameterValue;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description: string;
  editable: boolean;
}

export interface FddTaskParameterValue {
  key: string;
  value: FddParameterValue;
  unit?: string;
  source: FddParameterSource;
  confidence?: number;
  reason: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface FddAlgorithm {
  id: string;
  scope: FddAlgorithmScope;
  algorithmKey: string;
  version: string;
  name: string;
  equipmentType: FddEquipmentType;
  faultType: string;
  method: FddMethod;
  categoryKey: string;
  categoryLabel: string;
  requiredPoints: FddRequiredPoint[];
  outputs: FddOutput[];
  parameters: FddParameterSpec[];
  formula: string;
  logicSummary: string;
  sourcePaperId?: string;
  authorUserId?: string;
  deployableRuntime: boolean;
  definitionStatus?: FddDefinitionStatus;
  definitionIssues?: string[];
  definitionParameters?: FddDefinitionParameter[];
  sourceDefinition?: FddSourceDefinition;
}

export interface FddPointCandidate {
  slot: string;
  pointName: string;
  entityKey?: string;
  objectRef?: string;
  unit?: string;
  unitCompatibility: FddUnitCompatibility;
  dimensionReason: string;
  rejectionReason?: string;
  confidence: number;
  reason: string;
  historyDays?: number;
}

export interface FddPointMapping {
  slot: string;
  pointName: string;
  objectRef?: string;
  unit?: string;
}

export interface FddAmbiguousInput {
  slot: string;
  label: string;
  candidates: FddPointCandidate[];
}

export interface FddEntityDeployability {
  entityKey: string;
  status: FddDeployabilityStatus;
  selectedMappings: FddPointMapping[];
  ambiguousInputs: FddAmbiguousInput[];
  missingPoints: string[];
  historyIssues: string[];
  confidence: number;
}

export interface FddCheckAgentWorkflow {
  agentId: "buildinggpt";
  skillId: string;
  skillName: string;
  mode: "deterministic_core" | "llm_deep_inference";
  kbDocuments: string[];
  skillIds?: string[];
  memory?: {
    userEntries: number;
    projectEntries: number;
  };
  groundingRules?: Array<{
    id: string;
    name?: string;
    source?: string;
    content?: string;
  }>;
  steps: string[];
}

export interface FddDeployabilityCheck {
  algorithmId?: string;
  projectTaskId?: string;
  algorithmVersion: string;
  checkPolicyVersion?: string;
  projectId: string;
  status: FddDeployabilityStatus;
  pointCandidates: FddPointCandidate[];
  exampleEntityKey?: string;
  selectedMappings?: FddPointMapping[];
  deployableEntities?: FddEntityDeployability[];
  ambiguousInputs: FddAmbiguousInput[];
  rejectedCandidates: FddPointCandidate[];
  missingPoints: string[];
  historyIssues: string[];
  checkedAt: string;
  source: "auto" | "manual";
  projectDataSignature: string;
  agentWorkflow?: FddCheckAgentWorkflow;
}

export interface ProjectFddTask {
  id: string;
  projectId: string;
  source: FddTaskSource;
  sharingScope: FddSharingScope;
  globalAlgorithmId?: string;
  algorithmSnapshot: FddAlgorithm;
  status: FddTaskStatus;
  deployabilityCheck?: FddDeployabilityCheck;
  parameterValues?: FddTaskParameterValue[];
  createdAt: string;
  updatedAt: string;
}

export interface FddLibraryResponse {
  projectId: string;
  algorithms: FddAlgorithm[];
  checks: FddDeployabilityCheck[];
  tasks: ProjectFddTask[];
  checksPending?: boolean;
  requestId: string;
}

export interface CreateFddTaskPayload {
  name: string;
  equipmentType: FddEquipmentType;
  faultType: string;
  method: FddMethod;
  formula?: string;
  logicSummary: string;
  sharingScope: FddSharingScope;
  requiredPoints?: FddRequiredPoint[];
  parameters?: FddParameterSpec[];
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
  at?: number;
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

export interface ActiveChatStreamSnapshot {
  projectId: string;
  conversationId: string;
  requestId: string;
  startedAt: number;
  updatedAt: number;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activities: ChatStreamActivityEvent[];
  interimNarration: string;
  answerPhase: boolean;
  workElapsedMs: number;
  workSegmentStartedAt: number | null;
  workTimelinePaused: boolean;
  streamTimelineFinalized: boolean;
}

export interface ActiveChatStreamsResponse {
  projectId: string;
  streams: ActiveChatStreamSnapshot[];
  requestId: string;
}

export interface StreamEventHandlers {
  onLifecycle?: (event: ChatLifecycleEvent) => void;
  onProgress?: (event: ChatStreamProgressEvent) => void;
  onActivity?: (event: ChatStreamActivityEvent) => void;
  onToken?: (content: string) => void;
  onNarrationToken?: (content: string) => void;
  onNarrationReset?: () => void;
  onAnswerToken?: (content: string) => void;
  onTokenReset?: () => void;
  onFinalAnswerStart?: () => void;
  onConversationTitle?: (payload: { conversationId: string; title: string }) => void;
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
    handlers.onError?.({ code: "api_unavailable", message: "BuildingAgent API is unavailable. Check the server connection, then retry." });
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
                    ...(typeof act.exitCode === "number" ? { exitCode: act.exitCode } : {}),
                    ...(typeof act.at === "number" ? { at: act.at } : {})
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
              case "narration_token":
                if (typeof (parsed as Record<string, unknown>).content === "string") {
                  const content = (parsed as { content: string }).content;
                  console.debug("[SSE] narration_token", content.slice(0, 30));
                  handlers.onNarrationToken?.(content);
                }
                break;
              case "answer_token":
                if (typeof (parsed as Record<string, unknown>).content === "string") {
                  const chunk = (parsed as { content: string }).content;
                  console.debug("[SSE] answer_token", chunk.slice(0, 30));
                  handlers.onAnswerToken?.(chunk);
                  handlers.onToken?.(chunk);
                }
                break;
              case "narration_reset":
              case "token_reset":
                handlers.onNarrationReset?.();
                handlers.onTokenReset?.();
                break;
              case "final_answer_start":
                console.debug("[SSE] final_answer_start");
                handlers.onFinalAnswerStart?.();
                break;
              case "final_answer_end":
                console.debug("[SSE] final_answer_end");
                break;
              case "conversation_title":
                if (
                  typeof (parsed as Record<string, unknown>).conversationId === "string"
                  && typeof (parsed as Record<string, unknown>).title === "string"
                ) {
                  handlers.onConversationTitle?.({
                    conversationId: (parsed as { conversationId: string }).conversationId,
                    title: (parsed as { title: string }).title
                  });
                }
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
      message: "The connection closed before the assistant finished. Long think/tool runs can hit proxy timeouts — please retry; your question may already be saved."
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
  tokenType: "Bearer";
  /** ISO-8601 expiry, or null when the token does not expire. */
  expiresAt: string | null;
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
const REQUEST_TIMEOUT_MS = 30000;
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
  return new ApiClientError({ code: "api_unavailable", message: "BuildingAgent API is unavailable. Check the server connection, then retry." });
}

function timedOut(): ApiClientError {
  return new ApiClientError({ code: "api_timeout", message: "BuildingAgent API request timed out. The server may still be working; refresh or retry in a moment." });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    if (!response.ok) {
      throw new ApiClientError({
        code: "api_empty_response",
        message: `API returned HTTP ${response.status} with an empty response.`
      }, response.status);
    }
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown content type";
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
    const statusLabel = response.statusText ? `${response.status} ${response.statusText}` : `${response.status}`;
    throw new ApiClientError({
      code: "api_non_json_response",
      message: `API returned HTTP ${statusLabel} as ${contentType}${snippet ? `: ${snippet}` : "."}`
    }, response.status);
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
    if (isAbortError(error)) {
      throw timedOut();
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
  if (
    !isRecord(payload) ||
    typeof payload.token !== "string" ||
    !isRecord(payload.user) ||
    typeof payload.user.id !== "string" ||
    typeof payload.user.name !== "string" ||
    typeof payload.requestId !== "string"
  ) {
    throw malformed("Login returned an unexpected response.");
  }
  const tokenType = payload.tokenType === "Bearer" ? "Bearer" : "Bearer";
  const expiresAt =
    payload.expiresAt === null || typeof payload.expiresAt === "string" ? payload.expiresAt : null;
  return {
    token: payload.token,
    tokenType,
    expiresAt,
    user: { id: payload.user.id, name: payload.user.name },
    requestId: payload.requestId
  };
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

export interface MemoryBankResponse {
  projectId?: string;
  scope: "project" | "global";
  entries: string[];
  usage: string;
  charLimit: number;
  mutable: boolean;
  requestId: string;
}

export interface MemoryGroundingRule {
  id: string;
  content: string;
  createdAt: string;
  name?: string;
  scope?: string;
  trigger?: string;
  action?: string;
  wrongPattern?: string;
  triggerTopics?: string[];
  status?: string;
  source?: string;
}

export interface MemoryPlaybookSummary {
  id: string;
  title: string;
  triggerTopics: string[];
  groundingSummary: string;
  active: boolean;
}

export interface MemoryProposalSummary {
  id: string;
  target: "user" | "project";
  content: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface ProjectMemoryRulesResponse {
  projectId: string;
  grounding: MemoryGroundingRule[];
  playbooks: MemoryPlaybookSummary[];
  pendingMemoryProposals: MemoryProposalSummary[];
  requestId: string;
}

export async function getProjectUserMemory(token: string, projectId: string): Promise<MemoryBankResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/user`, {
    headers: authHeaders(token)
  });
  return parseMemoryBankResponse(payload, "project");
}

export async function patchProjectUserMemory(
  token: string,
  projectId: string,
  entries: string[]
): Promise<{ entries: string[]; usage?: string; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/user`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ entries })
  });
  if (!isRecord(payload) || !Array.isArray(payload.entries) || typeof payload.requestId !== "string") {
    throw malformed("User memory update returned an unexpected response.");
  }
  return {
    entries: payload.entries.filter((entry): entry is string => typeof entry === "string"),
    ...(typeof payload.usage === "string" ? { usage: payload.usage } : {}),
    requestId: payload.requestId
  };
}

export async function getProjectMemoryBank(token: string, projectId: string): Promise<MemoryBankResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/project`, {
    headers: authHeaders(token)
  });
  return parseMemoryBankResponse(payload, "project");
}

export async function patchProjectMemoryBank(
  token: string,
  projectId: string,
  entries: string[]
): Promise<{ entries: string[]; usage?: string; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/project`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ entries })
  });
  if (!isRecord(payload) || !Array.isArray(payload.entries) || typeof payload.requestId !== "string") {
    throw malformed("Project memory update returned an unexpected response.");
  }
  return {
    entries: payload.entries.filter((entry): entry is string => typeof entry === "string"),
    ...(typeof payload.usage === "string" ? { usage: payload.usage } : {}),
    requestId: payload.requestId
  };
}

export async function getGlobalUserMemory(token: string, projectId: string): Promise<MemoryBankResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/global`, {
    headers: authHeaders(token)
  });
  return parseMemoryBankResponse(payload, "global");
}

export async function patchGlobalUserMemory(
  token: string,
  projectId: string,
  entries: string[]
): Promise<{ entries: string[]; usage?: string; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/global`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ entries })
  });
  if (!isRecord(payload) || !Array.isArray(payload.entries) || typeof payload.requestId !== "string") {
    throw malformed("Global memory update returned an unexpected response.");
  }
  return {
    entries: payload.entries.filter((entry): entry is string => typeof entry === "string"),
    ...(typeof payload.usage === "string" ? { usage: payload.usage } : {}),
    requestId: payload.requestId
  };
}

export async function getProjectMemoryRules(token: string, projectId: string): Promise<ProjectMemoryRulesResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/memory/rules`, {
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.projectId !== "string" || typeof payload.requestId !== "string") {
    throw malformed("Memory rules returned an unexpected response.");
  }
  return {
    projectId: payload.projectId,
    grounding: Array.isArray(payload.grounding)
      ? payload.grounding
          .map((rule) => {
            if (!isRecord(rule) || typeof rule.id !== "string" || typeof rule.content !== "string") {
              return null;
            }
            return {
              id: rule.id,
              content: rule.content,
              createdAt: typeof rule.createdAt === "string" ? rule.createdAt : "",
              ...(typeof rule.name === "string" ? { name: rule.name } : {}),
              ...(typeof rule.scope === "string" ? { scope: rule.scope } : {}),
              ...(typeof rule.trigger === "string" ? { trigger: rule.trigger } : {}),
              ...(typeof rule.action === "string" ? { action: rule.action } : {}),
              ...(typeof rule.wrongPattern === "string" ? { wrongPattern: rule.wrongPattern } : {}),
              ...(Array.isArray(rule.triggerTopics)
                ? { triggerTopics: rule.triggerTopics.filter((topic): topic is string => typeof topic === "string") }
                : {}),
              ...(typeof rule.status === "string" ? { status: rule.status } : {}),
              ...(typeof rule.source === "string" ? { source: rule.source } : {})
            };
          })
          .filter((rule): rule is MemoryGroundingRule => rule !== null)
      : [],
    playbooks: Array.isArray(payload.playbooks)
      ? payload.playbooks
          .map((playbook) => {
            if (!isRecord(playbook) || typeof playbook.id !== "string" || typeof playbook.title !== "string") {
              return null;
            }
            return {
              id: playbook.id,
              title: playbook.title,
              triggerTopics: Array.isArray(playbook.triggerTopics)
                ? playbook.triggerTopics.filter((topic): topic is string => typeof topic === "string")
                : [],
              groundingSummary: typeof playbook.groundingSummary === "string" ? playbook.groundingSummary : "",
              active: playbook.active !== false
            };
          })
          .filter((playbook): playbook is MemoryPlaybookSummary => playbook !== null)
      : [],
    pendingMemoryProposals: Array.isArray(payload.pendingMemoryProposals)
      ? payload.pendingMemoryProposals
          .map((proposal) => {
            if (!isRecord(proposal) || typeof proposal.id !== "string" || typeof proposal.content !== "string") {
              return null;
            }
            return {
              id: proposal.id,
              target: proposal.target === "project" ? "project" : "user",
              content: proposal.content,
              reason: typeof proposal.reason === "string" ? proposal.reason : "",
              status: typeof proposal.status === "string" ? proposal.status : "proposed",
              createdAt: typeof proposal.createdAt === "string" ? proposal.createdAt : ""
            };
          })
          .filter((proposal): proposal is MemoryProposalSummary => proposal !== null)
      : [],
    requestId: payload.requestId
  };
}

function parseMemoryBankResponse(payload: unknown, scope: "project" | "global"): MemoryBankResponse {
  if (!isRecord(payload) || !Array.isArray(payload.entries) || typeof payload.requestId !== "string") {
    throw malformed("Memory bank returned an unexpected response.");
  }
  return {
    ...(typeof payload.projectId === "string" ? { projectId: payload.projectId } : {}),
    scope,
    entries: payload.entries.filter((entry): entry is string => typeof entry === "string"),
    usage: typeof payload.usage === "string" ? payload.usage : "",
    charLimit: typeof payload.charLimit === "number" ? payload.charLimit : 0,
    mutable: payload.mutable !== false,
    requestId: payload.requestId
  };
}

export async function getProjectBounds(token: string, projectId: string): Promise<PlatformBoundsResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/bounds`, {
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || !isRecord(payload.layers) || !isRecord(payload.currentUser)) {
    throw malformed("Project bounds returned an unexpected response.");
  }
  const layers = payload.layers as Record<string, unknown>;
  const layer = (key: string): PlatformBoundsLayer => {
    const value = layers[key];
    if (!isRecord(value) || typeof value.mutable !== "boolean" || typeof value.description !== "string") {
      throw malformed("Project bounds returned an unexpected response.");
    }
    return { mutable: value.mutable, description: value.description };
  };
  if (typeof payload.currentUser.canConfigure !== "boolean") {
    throw malformed("Project bounds returned an unexpected response.");
  }
  return {
    layers: {
      platform: layer("platform"),
      operator: layer("operator"),
      playbook: layer("playbook"),
      userMemory: layer("userMemory"),
      projectMemory: layer("projectMemory"),
      personalMemory: layer("personalMemory")
    },
    currentUser: { canConfigure: payload.currentUser.canConfigure }
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

export function parseActiveChatStreamSnapshot(value: unknown): ActiveChatStreamSnapshot | null {
  if (
    !isRecord(value)
    || typeof value.projectId !== "string"
    || typeof value.conversationId !== "string"
    || typeof value.requestId !== "string"
    || typeof value.startedAt !== "number"
    || typeof value.updatedAt !== "number"
    || typeof value.interimNarration !== "string"
    || typeof value.answerPhase !== "boolean"
    || typeof value.workElapsedMs !== "number"
    || !(typeof value.workSegmentStartedAt === "number" || value.workSegmentStartedAt === null)
    || typeof value.workTimelinePaused !== "boolean"
    || typeof value.streamTimelineFinalized !== "boolean"
  ) {
    return null;
  }
  try {
    return {
      projectId: value.projectId,
      conversationId: value.conversationId,
      requestId: value.requestId,
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
      userMessage: parseChatMessage(value.userMessage, "Active stream returned an unexpected user message."),
      assistantMessage: parseChatMessage(value.assistantMessage, "Active stream returned an unexpected assistant message."),
      activities: parseChatMessageActivities(value.activities) ?? [],
      interimNarration: value.interimNarration,
      answerPhase: value.answerPhase,
      workElapsedMs: value.workElapsedMs,
      workSegmentStartedAt: value.workSegmentStartedAt,
      workTimelinePaused: value.workTimelinePaused,
      streamTimelineFinalized: value.streamTimelineFinalized
    };
  } catch {
    return null;
  }
}

export async function getActiveChatStreams(token: string, projectId: string): Promise<ActiveChatStreamsResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/chat/active-streams`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.projectId !== "string" || !Array.isArray(payload.streams) || typeof payload.requestId !== "string") {
    throw malformed("Active streams returned an unexpected response.");
  }
  const streams = payload.streams.map(parseActiveChatStreamSnapshot);
  if (streams.some((stream) => stream === null)) {
    throw malformed("Active streams returned an unexpected stream.");
  }
  return {
    projectId: payload.projectId,
    streams: streams as ActiveChatStreamSnapshot[],
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
  if (typeof value.at === "number") result.at = value.at;
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
  const downloads = parseChatMessageDownloads(value.downloads, message);
  const activities = parseChatMessageActivities(value.activities);
  return {
    id: value.id,
    projectId: value.projectId,
    userId: value.userId,
    role: value.role,
    content: value.content,
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(images ? { images } : {}),
    ...(downloads ? { downloads } : {}),
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

function parseDashboardPointBinding(value: unknown): DashboardPointBinding | null {
  if (!isRecord(value)) return null;
  const pointName = typeof value.pointName === "string" ? value.pointName : undefined;
  const objectRef = typeof value.objectRef === "string" ? value.objectRef : undefined;
  const metricInstanceId = typeof value.metricInstanceId === "string" ? value.metricInstanceId : undefined;
  const metricKey = typeof value.metricKey === "string" ? value.metricKey : undefined;
  const entityId = typeof value.entityId === "string" ? value.entityId : undefined;
  const bmsSourceId = typeof value.bmsSourceId === "string" ? value.bmsSourceId : undefined;
  const source = value.source === "derived_metric" || metricInstanceId || metricKey
    ? "derived_metric"
    : value.source === "bms"
      ? "bms"
      : undefined;
  const fddParameters = Array.isArray(value.fddParameters)
    ? value.fddParameters.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : undefined;
  if (source === "derived_metric" && !metricInstanceId && (!metricKey || !entityId)) return null;
  if (source !== "derived_metric" && !pointName && !objectRef) return null;
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(source ? { source } : {}),
    ...(source !== "derived_metric" && bmsSourceId ? { bmsSourceId } : {}),
    ...(pointName ? { pointName } : {}),
    ...(objectRef ? { objectRef } : {}),
    ...(metricInstanceId ? { metricInstanceId } : {}),
    ...(metricKey ? { metricKey } : {}),
    ...(entityId ? { entityId } : {}),
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(typeof value.role === "string" ? { role: value.role } : {}),
    ...(typeof value.dependencyRole === "string" ? { dependencyRole: value.dependencyRole } : {}),
    ...(typeof value.defaultVisible === "boolean" ? { defaultVisible: value.defaultVisible } : {}),
    ...(typeof value.groupId === "string" ? { groupId: value.groupId } : {}),
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(fddParameters && fddParameters.length > 0 ? { fddParameters } : {})
  };
}

function parseDashboardLayoutItem(value: unknown): DashboardLayoutItem | null {
  if (!isRecord(value) || typeof value.widgetId !== "string" || typeof value.x !== "number" || typeof value.y !== "number" || typeof value.w !== "number" || typeof value.h !== "number") {
    return null;
  }
  return { widgetId: value.widgetId, x: value.x, y: value.y, w: value.w, h: value.h };
}

function parseDashboardWidget(value: unknown): DashboardWidget | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.pointBindings)) {
    return null;
  }
  if (value.kind !== "live_value_grid" && value.kind !== "timeseries_chart" && value.kind !== "stat_value" && value.kind !== "bar_comparison" && value.kind !== "status_grid" && value.kind !== "fdd_fault_rate_comparison" && value.kind !== "fdd_attribution_analysis" && value.kind !== "note") {
    return null;
  }
  const pointBindings = value.pointBindings.map((entry) => parseDashboardPointBinding(entry)).filter((entry): entry is DashboardPointBinding => entry !== null);
  if (pointBindings.length !== value.pointBindings.length || (pointBindings.length === 0 && value.kind !== "note")) {
    return null;
  }
  const tone = value.tone === "yellow" || value.tone === "blue" || value.tone === "green" || value.tone === "pink" || value.tone === "neutral" ? value.tone : undefined;
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    pointBindings,
    ...(typeof value.defaultTimeRange === "string" ? { defaultTimeRange: value.defaultTimeRange } : {}),
    ...(typeof value.content === "string" ? { content: value.content } : {}),
    ...(tone ? { tone } : {})
  };
}

function parseDashboardSection(value: unknown): DashboardSection | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.widgetIds)) {
    return null;
  }
  if (value.kind !== "overview" && value.kind !== "analysis" && value.kind !== "comparison" && value.kind !== "trends" && value.kind !== "custom") {
    return null;
  }
  const widgetIds = value.widgetIds.filter((entry): entry is string => typeof entry === "string");
  if (widgetIds.length !== value.widgetIds.length || widgetIds.length === 0) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    kind: value.kind,
    widgetIds,
    ...(typeof value.collapsed === "boolean" ? { collapsed: value.collapsed } : {})
  };
}

function parseDashboardRecord(value: unknown): DashboardRecord | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.projectId !== "string"
    || typeof value.ownerUserId !== "string"
    || (value.visibility !== "private" && value.visibility !== "project")
    || typeof value.title !== "string"
    || !Array.isArray(value.layout)
    || !Array.isArray(value.widgets)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string") {
    return null;
  }
  const layout = value.layout.map((entry) => parseDashboardLayoutItem(entry)).filter((entry): entry is DashboardLayoutItem => entry !== null);
  const widgets = value.widgets.map((entry) => parseDashboardWidget(entry)).filter((entry): entry is DashboardWidget => entry !== null);
  const sections = Array.isArray(value.sections)
    ? value.sections.map((entry) => parseDashboardSection(entry)).filter((entry): entry is DashboardSection => entry !== null)
    : undefined;
  if (layout.length !== value.layout.length || widgets.length !== value.widgets.length) {
    return null;
  }
  if (Array.isArray(value.sections) && sections?.length !== value.sections.length) {
    return null;
  }
  return {
    id: value.id,
    projectId: value.projectId,
    ownerUserId: value.ownerUserId,
    visibility: value.visibility,
    title: value.title,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.layoutVersion === "number" && Number.isFinite(value.layoutVersion) ? { layoutVersion: Math.trunc(value.layoutVersion) } : {}),
    layout,
    widgets,
    ...(sections ? { sections } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.sourceConversationId === "string" ? { sourceConversationId: value.sourceConversationId } : {})
  };
}

function parseDerivedMetricDependency(value: unknown): DerivedMetricDependency | null {
  if (!isRecord(value)
    || typeof value.dependencyId !== "string"
    || typeof value.instanceId !== "string"
    || typeof value.role !== "string"
    || (value.sourceType !== "raw_point" && value.sourceType !== "metric")
    || typeof value.sourceId !== "string") {
    return null;
  }
  return {
    dependencyId: value.dependencyId,
    instanceId: value.instanceId,
    role: value.role,
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    ...(typeof value.pointName === "string" ? { pointName: value.pointName } : {}),
    ...(typeof value.objectRef === "string" ? { objectRef: value.objectRef } : {}),
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {})
  };
}

function parseDerivedMetricInstance(value: unknown): DerivedMetricInstance | null {
  if (!isRecord(value)
    || typeof value.instanceId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.definitionId !== "string"
    || typeof value.versionId !== "string"
    || typeof value.metricKey !== "string"
    || typeof value.metricType !== "string"
    || typeof value.entityId !== "string"
    || typeof value.displayName !== "string"
    || typeof value.formulaVersion !== "string"
    || typeof value.formula !== "string"
    || typeof value.status !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || !Array.isArray(value.dependencies)) {
    return null;
  }
  const dependencies = value.dependencies
    .map((entry) => parseDerivedMetricDependency(entry))
    .filter((entry): entry is DerivedMetricDependency => entry !== null);
  if (dependencies.length !== value.dependencies.length) {
    return null;
  }
  return {
    instanceId: value.instanceId,
    projectId: value.projectId,
    definitionId: value.definitionId,
    versionId: value.versionId,
    metricKey: value.metricKey,
    metricType: value.metricType,
    entityId: value.entityId,
    displayName: value.displayName,
    formulaVersion: value.formulaVersion,
    formula: value.formula,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    dependencies,
    ...(typeof value.entityName === "string" ? { entityName: value.entityName } : {}),
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    ...(typeof value.formulaDescription === "string" ? { formulaDescription: value.formulaDescription } : {}),
    ...(typeof value.createdBy === "string" ? { createdBy: value.createdBy } : {}),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {})
  };
}

function parseDerivedMetricSample(value: unknown): DerivedMetricSample | null {
  if (!isRecord(value)
    || typeof value.sampleId !== "string"
    || typeof value.instanceId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.ts !== "string"
    || typeof value.quality !== "string"
    || typeof value.status !== "string"
    || typeof value.formulaVersionId !== "string"
    || typeof value.createdAt !== "string") {
    return null;
  }
  return {
    sampleId: value.sampleId,
    instanceId: value.instanceId,
    projectId: value.projectId,
    ts: value.ts,
    quality: value.quality,
    status: value.status,
    formulaVersionId: value.formulaVersionId,
    createdAt: value.createdAt,
    ...(typeof value.valueNum === "number" && Number.isFinite(value.valueNum) ? { valueNum: value.valueNum } : {}),
    ...(typeof value.valueText === "string" ? { valueText: value.valueText } : {}),
    ...(typeof value.calculationRunId === "string" ? { calculationRunId: value.calculationRunId } : {}),
    ...(typeof value.sourceWindowStart === "string" ? { sourceWindowStart: value.sourceWindowStart } : {}),
    ...(typeof value.sourceWindowEnd === "string" ? { sourceWindowEnd: value.sourceWindowEnd } : {}),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {})
  };
}

function parseDerivedMetricMaterialization(value: unknown): DerivedMetricMaterialization | null {
  if (!isRecord(value)
    || typeof value.instanceId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.enabled !== "boolean"
    || typeof value.intervalSeconds !== "number"
    || typeof value.lookbackSeconds !== "number"
    || typeof value.status !== "string"
    || typeof value.updatedAt !== "string") {
    return null;
  }
  const formulaKind = value.formulaKind === "ratio" || value.formulaKind === "difference" ? value.formulaKind : undefined;
  const invalidValuePolicy = value.invalidValuePolicy === "zero" || value.invalidValuePolicy === "null" ? value.invalidValuePolicy : undefined;
  const alignmentPolicy = value.alignmentPolicy === "exact" || value.alignmentPolicy === "nearest" ? value.alignmentPolicy : undefined;
  return {
    instanceId: value.instanceId,
    projectId: value.projectId,
    enabled: value.enabled,
    intervalSeconds: value.intervalSeconds,
    lookbackSeconds: value.lookbackSeconds,
    status: value.status,
    updatedAt: value.updatedAt,
    ...(formulaKind ? { formulaKind } : {}),
    ...(typeof value.leftRole === "string" ? { leftRole: value.leftRole } : {}),
    ...(typeof value.rightRole === "string" ? { rightRole: value.rightRole } : {}),
    ...(invalidValuePolicy ? { invalidValuePolicy } : {}),
    ...(alignmentPolicy ? { alignmentPolicy } : {}),
    ...(typeof value.alignmentToleranceSeconds === "number" ? { alignmentToleranceSeconds: value.alignmentToleranceSeconds } : {}),
    ...(typeof value.lastRunAt === "string" ? { lastRunAt: value.lastRunAt } : {}),
    ...(typeof value.nextRunAt === "string" ? { nextRunAt: value.nextRunAt } : {}),
    ...(typeof value.watermarkTs === "string" ? { watermarkTs: value.watermarkTs } : {}),
    ...(typeof value.lastError === "string" ? { lastError: value.lastError } : {})
  };
}

function parseDerivedMetricDashboardLink(value: unknown): DerivedMetricDashboardLink | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.title !== "string"
    || typeof value.widgetCount !== "number"
    || typeof value.path !== "string") {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    widgetCount: value.widgetCount,
    path: value.path
  };
}

function parseDerivedMetricAsset(value: unknown): DerivedMetricAsset | null {
  if (!isRecord(value) || !Array.isArray(value.linkedDashboards)) return null;
  const instance = parseDerivedMetricInstance(value.instance);
  const latest = value.latest === null ? null : parseDerivedMetricSample(value.latest);
  const materialization = value.materialization === null ? null : parseDerivedMetricMaterialization(value.materialization);
  const linkedDashboards = value.linkedDashboards
    .map((entry) => parseDerivedMetricDashboardLink(entry))
    .filter((entry): entry is DerivedMetricDashboardLink => entry !== null);
  if (!instance || latest === null && value.latest !== null || materialization === null && value.materialization !== null || linkedDashboards.length !== value.linkedDashboards.length) {
    return null;
  }
  return { instance, latest, materialization, linkedDashboards };
}

function parseFddRequiredPoint(value: unknown): FddRequiredPoint | null {
  if (!isRecord(value) || typeof value.slot !== "string" || typeof value.label !== "string" || typeof value.semantic !== "string" || typeof value.required !== "boolean") {
    return null;
  }
  const historyRequirement = isRecord(value.historyRequirement)
    && typeof value.historyRequirement.minDays === "number"
    && typeof value.historyRequirement.preferredDays === "number"
    ? {
        minDays: value.historyRequirement.minDays,
        preferredDays: value.historyRequirement.preferredDays
      }
    : undefined;
  const acceptableUnits = Array.isArray(value.acceptableUnits) ? value.acceptableUnits.filter((unit): unit is string => typeof unit === "string") : undefined;
  const quantityKind = parseFddQuantityKind(value.quantityKind) ?? inferFddQuantityKind(value.slot, value.label, value.semantic, acceptableUnits);
  return {
    slot: value.slot,
    label: value.label,
    semantic: value.semantic,
    required: value.required,
    quantityKind,
    unitRoleDescription: typeof value.unitRoleDescription === "string" && value.unitRoleDescription.trim()
      ? value.unitRoleDescription.trim()
      : `${value.label} provides ${quantityKind.replace(/_/g, " ")} evidence for the FDD formula.`,
    ...(acceptableUnits ? { acceptableUnits } : {}),
    ...(Array.isArray(value.keywords) ? { keywords: value.keywords.filter((keyword): keyword is string => typeof keyword === "string") } : {}),
    ...(Array.isArray(value.sourceSymbols) ? { sourceSymbols: value.sourceSymbols.filter((symbol): symbol is string => typeof symbol === "string") } : {}),
    ...(Array.isArray(value.sourceBrickClasses) ? { sourceBrickClasses: value.sourceBrickClasses.filter((brickClass): brickClass is string => typeof brickClass === "string") } : {}),
    ...(historyRequirement ? { historyRequirement } : {})
  };
}

function parseFddDefinitionParameter(value: unknown): FddDefinitionParameter | null {
  if (!isRecord(value)
    || typeof value.symbol !== "string"
    || (value.resolution !== "source_default" && value.resolution !== "source_expression" && value.resolution !== "site_required")) {
    return null;
  }
  return {
    symbol: value.symbol,
    ...(typeof value.rawDefault === "string" ? { rawDefault: value.rawDefault } : {}),
    resolution: value.resolution
  };
}

function parseFddSourceDefinition(value: unknown): FddSourceDefinition | null {
  if (!isRecord(value)
    || typeof value.ruleId !== "string"
    || typeof value.sourceFile !== "string"
    || typeof value.sha256 !== "string"
    || typeof value.requiredPointsRaw !== "string"
    || typeof value.tunableParametersRaw !== "string"
    || typeof value.brickClassesRaw !== "string") {
    return null;
  }
  return {
    ruleId: value.ruleId,
    sourceFile: value.sourceFile,
    sha256: value.sha256,
    requiredPointsRaw: value.requiredPointsRaw,
    tunableParametersRaw: value.tunableParametersRaw,
    brickClassesRaw: value.brickClassesRaw
  };
}

function parseFddQuantityKind(value: unknown): FddQuantityKind | null {
  return value === "temperature" || value === "flow_rate" || value === "power" || value === "energy" || value === "load" || value === "status" || value === "pressure" || value === "humidity" || value === "position" || value === "speed" || value === "current" || value === "level" || value === "concentration" || value === "unknown"
    ? value
    : null;
}

function inferFddQuantityKind(slot: string, label: string, semantic: string, acceptableUnits?: string[]): FddQuantityKind {
  const text = `${slot} ${label} ${semantic} ${(acceptableUnits ?? []).join(" ")}`.toLowerCase();
  if (/\b(status|proof|running|run|enable|on[\/\s-]?off)\b/u.test(text)) return "status";
  if (/\b(load|cooling output|cooling capacity|refrigeration ton|rt)\b/u.test(text)) return "load";
  if (/kwh|kw-?h|kilowatt[\s-]?hour|\benergy\b/u.test(text)) return "energy";
  if (/\b(current|amps?|amperes?|amperage)\b/u.test(text) || /\ba\b/u.test((acceptableUnits ?? []).join(" ").toLowerCase())) return "current";
  if (/kw(?!h)|\b(kilowatt|watt|power|demand|motor)\b/u.test(text)) return "power";
  if (/\b(consumption|accumulated)\b/u.test(text)) return "energy";
  if (/\b(temp|temperature|chwst|chwrt|sat|mat|oat|rat|degf|degc)\b/u.test(text)) return "temperature";
  if (/\b(flow|flowrate|gpm|l\/s|m3\/h|cfm)\b/u.test(text)) return "flow_rate";
  if (/\b(pressure|delta p|differential pressure|\bdp\b|pa|kpa|psi|inh2o)\b/u.test(text)) return "pressure";
  if (/\b(humidity|humid|rh|g\/kg)\b/u.test(text)) return "humidity";
  if (/\b(level|water level|height)\b/u.test(text)) return "level";
  if (/\b(co2|carbon dioxide|concentration|ppm|ppb)\b/u.test(text)) return "concentration";
  if (/\b(damper|valve|position|command|%)\b/u.test(text)) return "position";
  if (/\b(speed|rpm|hz)\b/u.test(text)) return "speed";
  return "unknown";
}

function fallbackFddCategory(equipmentType: FddEquipmentType, faultType: string): { categoryKey: string; categoryLabel: string } {
  if (equipmentType === "ahu") {
    const normalizedFault = faultType.toLowerCase();
    if (normalizedFault === "sensor") return { categoryKey: "AHU-Sensor", categoryLabel: "AHU-Sensor" };
    if (normalizedFault === "damper") return { categoryKey: "AHU-Damper", categoryLabel: "AHU-Damper" };
    if (normalizedFault === "fan") return { categoryKey: "AHU-Fan", categoryLabel: "AHU-Fan" };
    if (normalizedFault === "duct") return { categoryKey: "AHU-Duct", categoryLabel: "AHU-Duct" };
    if (normalizedFault === "filter") return { categoryKey: "AHU-Filter", categoryLabel: "AHU-Filter" };
    if (normalizedFault === "coil") return { categoryKey: "AHU-Coil", categoryLabel: "AHU-Coil" };
    if (normalizedFault === "secondary water") return { categoryKey: "AHU-WaterSide", categoryLabel: "AHU-WaterSide" };
  }
  const equipment = equipmentType.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  const fault = faultType.split(/[^a-z0-9]+/iu).filter(Boolean).map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  const label = `${equipment}-${fault || "General"}`;
  return { categoryKey: label, categoryLabel: label };
}

function parseFddOutput(value: unknown): FddOutput | null {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.label !== "string") return null;
  if (value.type !== "boolean" && value.type !== "number" && value.type !== "text") return null;
  return {
    key: value.key,
    label: value.label,
    type: value.type,
    ...(typeof value.unit === "string" ? { unit: value.unit } : {})
  };
}

function parseFddParameterValue(value: unknown): FddParameterValue | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function parseFddParameterSpec(value: unknown): FddParameterSpec | null {
  if (!isRecord(value)
    || typeof value.key !== "string"
    || typeof value.label !== "string"
    || (value.type !== "number" && value.type !== "boolean" && value.type !== "select")
    || typeof value.description !== "string"
    || typeof value.editable !== "boolean") {
    return null;
  }
  const defaultValue = parseFddParameterValue(value.defaultValue);
  if (defaultValue === null) return null;
  if (value.type === "number" && typeof defaultValue !== "number") return null;
  if (value.type === "boolean" && typeof defaultValue !== "boolean") return null;
  if (value.type === "select" && typeof defaultValue !== "string") return null;
  return {
    key: value.key,
    label: value.label,
    type: value.type,
    defaultValue,
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    ...(typeof value.min === "number" ? { min: value.min } : {}),
    ...(typeof value.max === "number" ? { max: value.max } : {}),
    ...(typeof value.step === "number" ? { step: value.step } : {}),
    ...(Array.isArray(value.options) ? { options: value.options.filter((option): option is string => typeof option === "string") } : {}),
    description: value.description,
    editable: value.editable
  };
}

function parseFddTaskParameterValue(value: unknown): FddTaskParameterValue | null {
  if (!isRecord(value)
    || typeof value.key !== "string"
    || (value.source !== "algorithm_default" && value.source !== "buildinggpt_recommended" && value.source !== "user_override")
    || typeof value.reason !== "string"
    || typeof value.updatedAt !== "string") {
    return null;
  }
  const parameterValue = parseFddParameterValue(value.value);
  if (parameterValue === null) return null;
  return {
    key: value.key,
    value: parameterValue,
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    source: value.source,
    ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {}),
    reason: value.reason,
    updatedAt: value.updatedAt,
    ...(typeof value.updatedBy === "string" ? { updatedBy: value.updatedBy } : {})
  };
}

function parseFddAlgorithm(value: unknown): FddAlgorithm | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || (value.scope !== "global_builtin" && value.scope !== "global_community")
    || typeof value.algorithmKey !== "string"
    || typeof value.version !== "string"
    || typeof value.name !== "string"
    || (value.equipmentType !== "ahu" && value.equipmentType !== "chiller" && value.equipmentType !== "pump" && value.equipmentType !== "cooling_tower" && value.equipmentType !== "fcu" && value.equipmentType !== "vav" && value.equipmentType !== "sensor")
    || (value.method !== "rule_based" && value.method !== "bayesian_network" && value.method !== "performance_indicator" && value.method !== "statistical")
    || typeof value.faultType !== "string"
    || !Array.isArray(value.requiredPoints)
    || !Array.isArray(value.outputs)
    || typeof value.logicSummary !== "string"
    || typeof value.deployableRuntime !== "boolean") {
    return null;
  }
  const requiredPoints = value.requiredPoints.map((entry) => parseFddRequiredPoint(entry)).filter((entry): entry is FddRequiredPoint => entry !== null);
  const outputs = value.outputs.map((entry) => parseFddOutput(entry)).filter((entry): entry is FddOutput => entry !== null);
  const parameters = Array.isArray(value.parameters)
    ? value.parameters.map((entry) => parseFddParameterSpec(entry)).filter((entry): entry is FddParameterSpec => entry !== null)
    : [];
  const definitionParameters = Array.isArray(value.definitionParameters)
    ? value.definitionParameters.map((entry) => parseFddDefinitionParameter(entry)).filter((entry): entry is FddDefinitionParameter => entry !== null)
    : undefined;
  const sourceDefinition = value.sourceDefinition === undefined ? undefined : parseFddSourceDefinition(value.sourceDefinition);
  if (requiredPoints.length !== value.requiredPoints.length
    || outputs.length !== value.outputs.length
    || (Array.isArray(value.parameters) && parameters.length !== value.parameters.length)
    || (Array.isArray(value.definitionParameters) && definitionParameters?.length !== value.definitionParameters.length)
    || (value.sourceDefinition !== undefined && !sourceDefinition)) return null;
  const category = typeof value.categoryKey === "string" && typeof value.categoryLabel === "string"
    ? { categoryKey: value.categoryKey, categoryLabel: value.categoryLabel }
    : fallbackFddCategory(value.equipmentType, value.faultType);
  return {
    id: value.id,
    scope: value.scope,
    algorithmKey: value.algorithmKey,
    version: value.version,
    name: value.name,
    equipmentType: value.equipmentType,
    faultType: value.faultType,
    method: value.method,
    categoryKey: category.categoryKey,
    categoryLabel: category.categoryLabel,
    requiredPoints,
    outputs,
    parameters,
    formula: typeof value.formula === "string" ? value.formula : value.logicSummary,
    logicSummary: value.logicSummary,
    ...(typeof value.sourcePaperId === "string" ? { sourcePaperId: value.sourcePaperId } : {}),
    ...(typeof value.authorUserId === "string" ? { authorUserId: value.authorUserId } : {}),
    deployableRuntime: value.deployableRuntime,
    ...(value.definitionStatus === "implementation_ready" || value.definitionStatus === "requires_configuration" || value.definitionStatus === "requires_review"
      ? { definitionStatus: value.definitionStatus }
      : {}),
    ...(Array.isArray(value.definitionIssues)
      ? { definitionIssues: value.definitionIssues.filter((issue): issue is string => typeof issue === "string") }
      : {}),
    ...(definitionParameters ? { definitionParameters } : {}),
    ...(sourceDefinition ? { sourceDefinition } : {})
  };
}

function parseFddPointCandidate(value: unknown): FddPointCandidate | null {
  if (!isRecord(value) || typeof value.slot !== "string" || typeof value.pointName !== "string" || typeof value.confidence !== "number" || typeof value.reason !== "string") return null;
  const unitCompatibility = value.unitCompatibility === "match" || value.unitCompatibility === "convertible" || value.unitCompatibility === "mismatch" || value.unitCompatibility === "unknown"
    ? value.unitCompatibility
    : "unknown";
  return {
    slot: value.slot,
    pointName: value.pointName,
    ...(typeof value.entityKey === "string" ? { entityKey: value.entityKey } : {}),
    confidence: value.confidence,
    reason: value.reason,
    ...(typeof value.objectRef === "string" ? { objectRef: value.objectRef } : {}),
    ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    unitCompatibility,
    dimensionReason: typeof value.dimensionReason === "string" ? value.dimensionReason : "No unit dimension metadata was provided.",
    ...(typeof value.rejectionReason === "string" ? { rejectionReason: value.rejectionReason } : {}),
    ...(typeof value.historyDays === "number" ? { historyDays: value.historyDays } : {})
  };
}

function parseFddPointMapping(value: unknown): FddPointMapping | null {
  if (!isRecord(value) || typeof value.slot !== "string" || typeof value.pointName !== "string") return null;
  return {
    slot: value.slot,
    pointName: value.pointName,
    ...(typeof value.objectRef === "string" ? { objectRef: value.objectRef } : {}),
    ...(typeof value.unit === "string" ? { unit: value.unit } : {})
  };
}

function parseFddAmbiguousInput(value: unknown): FddAmbiguousInput | null {
  if (!isRecord(value) || typeof value.slot !== "string" || typeof value.label !== "string" || !Array.isArray(value.candidates)) return null;
  const candidates = value.candidates.map((entry) => parseFddPointCandidate(entry)).filter((entry): entry is FddPointCandidate => entry !== null);
  if (candidates.length !== value.candidates.length) return null;
  return {
    slot: value.slot,
    label: value.label,
    candidates
  };
}

function parseFddEntityDeployability(value: unknown): FddEntityDeployability | null {
  if (!isRecord(value)
    || typeof value.entityKey !== "string"
    || (value.status !== "can_deploy" && value.status !== "uncertain" && value.status !== "cannot_deploy")
    || !Array.isArray(value.selectedMappings)
    || !Array.isArray(value.ambiguousInputs)
    || !Array.isArray(value.missingPoints)
    || !Array.isArray(value.historyIssues)
    || typeof value.confidence !== "number") {
    return null;
  }
  const selectedMappings = value.selectedMappings.map((entry) => parseFddPointMapping(entry)).filter((entry): entry is FddPointMapping => entry !== null);
  const ambiguousInputs = value.ambiguousInputs.map((entry) => parseFddAmbiguousInput(entry)).filter((entry): entry is FddAmbiguousInput => entry !== null);
  if (selectedMappings.length !== value.selectedMappings.length || ambiguousInputs.length !== value.ambiguousInputs.length) return null;
  return {
    entityKey: value.entityKey,
    status: value.status,
    selectedMappings,
    ambiguousInputs,
    missingPoints: value.missingPoints.filter((entry): entry is string => typeof entry === "string"),
    historyIssues: value.historyIssues.filter((entry): entry is string => typeof entry === "string"),
    confidence: value.confidence
  };
}

function parseFddCheckAgentWorkflow(value: unknown): FddCheckAgentWorkflow | null {
  if (!isRecord(value)
    || value.agentId !== "buildinggpt"
    || typeof value.skillId !== "string"
    || typeof value.skillName !== "string"
    || (value.mode !== "deterministic_core" && value.mode !== "llm_deep_inference")
    || !Array.isArray(value.kbDocuments)
    || !Array.isArray(value.steps)) {
    return null;
  }
  const kbDocuments = value.kbDocuments.filter((entry): entry is string => typeof entry === "string");
  const steps = value.steps.filter((entry): entry is string => typeof entry === "string");
  if (kbDocuments.length !== value.kbDocuments.length || steps.length !== value.steps.length) return null;
  return {
    agentId: value.agentId,
    skillId: value.skillId,
    skillName: value.skillName,
    mode: value.mode,
    kbDocuments,
    steps
  };
}

function parseFddDeployabilityCheck(value: unknown): FddDeployabilityCheck | null {
  if (!isRecord(value)
    || typeof value.algorithmVersion !== "string"
    || typeof value.projectId !== "string"
    || (value.status !== "can_deploy" && value.status !== "uncertain" && value.status !== "cannot_deploy")
    || !Array.isArray(value.pointCandidates)
    || !Array.isArray(value.missingPoints)
    || !Array.isArray(value.historyIssues)
    || typeof value.checkedAt !== "string"
    || (value.source !== "auto" && value.source !== "manual")
    || typeof value.projectDataSignature !== "string") {
    return null;
  }
  const pointCandidates = value.pointCandidates.map((entry) => parseFddPointCandidate(entry)).filter((entry): entry is FddPointCandidate => entry !== null);
  const selectedMappings = Array.isArray(value.selectedMappings)
    ? value.selectedMappings.map((entry) => parseFddPointMapping(entry)).filter((entry): entry is FddPointMapping => entry !== null)
    : undefined;
  const ambiguousInputs = Array.isArray(value.ambiguousInputs)
    ? value.ambiguousInputs.map((entry) => parseFddAmbiguousInput(entry)).filter((entry): entry is FddAmbiguousInput => entry !== null)
    : [];
  const rejectedCandidates = Array.isArray(value.rejectedCandidates)
    ? value.rejectedCandidates.map((entry) => parseFddPointCandidate(entry)).filter((entry): entry is FddPointCandidate => entry !== null)
    : [];
  const deployableEntities = Array.isArray(value.deployableEntities)
    ? value.deployableEntities.map((entry) => parseFddEntityDeployability(entry)).filter((entry): entry is FddEntityDeployability => entry !== null)
    : undefined;
  const agentWorkflow = value.agentWorkflow === undefined ? undefined : parseFddCheckAgentWorkflow(value.agentWorkflow);
  if (pointCandidates.length !== value.pointCandidates.length) return null;
  if (Array.isArray(value.selectedMappings) && selectedMappings?.length !== value.selectedMappings.length) return null;
  if (Array.isArray(value.ambiguousInputs) && ambiguousInputs.length !== value.ambiguousInputs.length) return null;
  if (Array.isArray(value.rejectedCandidates) && rejectedCandidates.length !== value.rejectedCandidates.length) return null;
  if (Array.isArray(value.deployableEntities) && deployableEntities?.length !== value.deployableEntities.length) return null;
  if (value.agentWorkflow !== undefined && !agentWorkflow) return null;
  return {
    ...(typeof value.algorithmId === "string" ? { algorithmId: value.algorithmId } : {}),
    ...(typeof value.projectTaskId === "string" ? { projectTaskId: value.projectTaskId } : {}),
    algorithmVersion: value.algorithmVersion,
    ...(typeof value.checkPolicyVersion === "string" ? { checkPolicyVersion: value.checkPolicyVersion } : {}),
    projectId: value.projectId,
    status: value.status,
    pointCandidates,
    ...(typeof value.exampleEntityKey === "string" ? { exampleEntityKey: value.exampleEntityKey } : typeof value.selectedEntityKey === "string" ? { exampleEntityKey: value.selectedEntityKey } : {}),
    ...(selectedMappings ? { selectedMappings } : {}),
    ...(deployableEntities ? { deployableEntities } : {}),
    ambiguousInputs,
    rejectedCandidates,
    missingPoints: value.missingPoints.filter((entry): entry is string => typeof entry === "string"),
    historyIssues: value.historyIssues.filter((entry): entry is string => typeof entry === "string"),
    checkedAt: value.checkedAt,
    source: value.source,
    projectDataSignature: value.projectDataSignature,
    ...(agentWorkflow ? { agentWorkflow } : {})
  };
}

function parseProjectFddTask(value: unknown): ProjectFddTask | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.projectId !== "string"
    || (value.source !== "global_library" && value.source !== "project_upload" && value.source !== "buildinggpt_generated")
    || (value.sharingScope !== "project_only" && value.sharingScope !== "global_community")
    || (value.status !== "checking" && value.status !== "ready" && value.status !== "running" && value.status !== "paused" && value.status !== "cannot_deploy")
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string") {
    return null;
  }
  const algorithmSnapshot = parseFddAlgorithm(value.algorithmSnapshot);
  const deployabilityCheck = value.deployabilityCheck === undefined ? undefined : parseFddDeployabilityCheck(value.deployabilityCheck);
  const parameterValues = Array.isArray(value.parameterValues)
    ? value.parameterValues.map((entry) => parseFddTaskParameterValue(entry)).filter((entry): entry is FddTaskParameterValue => entry !== null)
    : undefined;
  if (!algorithmSnapshot || (value.deployabilityCheck !== undefined && !deployabilityCheck) || (Array.isArray(value.parameterValues) && parameterValues?.length !== value.parameterValues.length)) return null;
  return {
    id: value.id,
    projectId: value.projectId,
    source: value.source,
    sharingScope: value.sharingScope,
    ...(typeof value.globalAlgorithmId === "string" ? { globalAlgorithmId: value.globalAlgorithmId } : {}),
    algorithmSnapshot,
    status: value.status,
    ...(deployabilityCheck ? { deployabilityCheck } : {}),
    ...(parameterValues ? { parameterValues } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
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

function parseChatMessageDownloads(value: unknown, message: string): ChatMessageDownload[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw malformed(message);
  }
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.filename !== "string") {
      throw malformed(message);
    }
    return {
      path: entry.path,
      filename: entry.filename
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

export async function getDashboards(token: string, projectId: string): Promise<{ dashboards: DashboardRecord[]; totalCount: number; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/dashboards`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.dashboards) || typeof payload.requestId !== "string") {
    throw malformed("Dashboards returned an unexpected response.");
  }
  return {
    dashboards: payload.dashboards.map((entry) => {
      const parsed = parseDashboardRecord(entry);
      if (!parsed) {
        throw malformed("Dashboards returned an unexpected dashboard.");
      }
      return parsed;
    }),
    totalCount: typeof payload.totalCount === "number" ? payload.totalCount : payload.dashboards.length,
    requestId: payload.requestId
  };
}

export async function getDashboard(token: string, projectId: string, dashboardId: string): Promise<{ dashboard: DashboardRecord; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("Dashboard returned an unexpected response.");
  }
  const parsed = parseDashboardRecord(payload.dashboard);
  if (!parsed) {
    throw malformed("Dashboard returned an unexpected dashboard.");
  }
  return { dashboard: parsed, requestId: payload.requestId };
}

export async function getDerivedMetrics(token: string, projectId: string): Promise<{ metrics: DerivedMetricAsset[]; totalCount: number; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/derived-metrics`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.metrics) || typeof payload.requestId !== "string") {
    throw malformed("Derived metrics returned an unexpected response.");
  }
  return {
    metrics: payload.metrics.map((entry) => {
      const parsed = parseDerivedMetricAsset(entry);
      if (!parsed) {
        throw malformed("Derived metrics returned an unexpected metric.");
      }
      return parsed;
    }),
    totalCount: typeof payload.totalCount === "number" ? payload.totalCount : payload.metrics.length,
    requestId: payload.requestId
  };
}

export async function getDerivedMetric(token: string, projectId: string, instanceId: string): Promise<{ metric: DerivedMetricAsset; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/derived-metrics/${encodeURIComponent(instanceId)}`, { headers: authHeaders(token) });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("Derived metric returned an unexpected response.");
  }
  const metric = parseDerivedMetricAsset(payload.metric);
  if (!metric) {
    throw malformed("Derived metric returned an unexpected metric.");
  }
  return { metric, requestId: payload.requestId };
}

export async function updateDerivedMetricMaterialization(
  token: string,
  projectId: string,
  instanceId: string,
  payload: { enabled: boolean }
): Promise<{ metric: DerivedMetricAsset; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/derived-metrics/${encodeURIComponent(instanceId)}/materialization`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.requestId !== "string") {
    throw malformed("Derived metric materialization returned an unexpected response.");
  }
  const metric = parseDerivedMetricAsset(response.metric);
  if (!metric) {
    throw malformed("Derived metric materialization returned an unexpected metric.");
  }
  return { metric, requestId: response.requestId };
}

export async function deleteDerivedMetric(
  token: string,
  projectId: string,
  instanceId: string
): Promise<{ deleted: boolean; instanceId: string; deletedDashboardIds: string[]; updatedDashboardIds: string[]; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/derived-metrics/${encodeURIComponent(instanceId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(response) || typeof response.deleted !== "boolean" || typeof response.instanceId !== "string" || typeof response.requestId !== "string") {
    throw malformed("Derived metric delete returned an unexpected response.");
  }
  return {
    deleted: response.deleted,
    instanceId: response.instanceId,
    deletedDashboardIds: Array.isArray(response.deletedDashboardIds) ? response.deletedDashboardIds.filter((entry): entry is string => typeof entry === "string") : [],
    updatedDashboardIds: Array.isArray(response.updatedDashboardIds) ? response.updatedDashboardIds.filter((entry): entry is string => typeof entry === "string") : [],
    requestId: response.requestId
  };
}

export async function getFddLibrary(token: string, projectId: string): Promise<FddLibraryResponse> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-library`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.algorithms) || !Array.isArray(payload.checks) || !Array.isArray(payload.tasks) || typeof payload.projectId !== "string" || typeof payload.requestId !== "string") {
    throw malformed("FDD library returned an unexpected response.");
  }
  const algorithms = payload.algorithms.map((entry) => parseFddAlgorithm(entry));
  const checks = payload.checks.map((entry) => parseFddDeployabilityCheck(entry));
  const tasks = payload.tasks.map((entry) => parseProjectFddTask(entry));
  if (algorithms.some((entry) => entry === null) || checks.some((entry) => entry === null) || tasks.some((entry) => entry === null)) {
    throw malformed("FDD library returned an unexpected entry.");
  }
  return {
    projectId: payload.projectId,
    algorithms: algorithms as FddAlgorithm[],
    checks: checks as FddDeployabilityCheck[],
    tasks: tasks as ProjectFddTask[],
    ...(typeof payload.checksPending === "boolean" ? { checksPending: payload.checksPending } : {}),
    requestId: payload.requestId
  };
}

export async function testFddAlgorithm(token: string, projectId: string, algorithmId: string): Promise<{ algorithm: FddAlgorithm; check: FddDeployabilityCheck; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-library/${encodeURIComponent(algorithmId)}/test`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("FDD algorithm test returned an unexpected response.");
  }
  const algorithm = parseFddAlgorithm(payload.algorithm);
  const check = parseFddDeployabilityCheck(payload.check);
  if (!algorithm || !check) {
    throw malformed("FDD algorithm test returned an unexpected entry.");
  }
  return { algorithm, check, requestId: payload.requestId };
}

export async function deployFddAlgorithm(token: string, projectId: string, algorithmId: string): Promise<{ task: ProjectFddTask; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-library/${encodeURIComponent(algorithmId)}/deploy`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("FDD algorithm deploy returned an unexpected response.");
  }
  const task = parseProjectFddTask(payload.task);
  if (!task) {
    throw malformed("FDD algorithm deploy returned an unexpected task.");
  }
  return { task, requestId: payload.requestId };
}

export async function getFddTasks(token: string, projectId: string): Promise<{ tasks: ProjectFddTask[]; totalCount: number; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks`, { headers: authHeaders(token) });
  if (!isRecord(payload) || !Array.isArray(payload.tasks) || typeof payload.requestId !== "string") {
    throw malformed("FDD tasks returned an unexpected response.");
  }
  const tasks = payload.tasks.map((entry) => parseProjectFddTask(entry));
  if (tasks.some((entry) => entry === null)) {
    throw malformed("FDD tasks returned an unexpected task.");
  }
  return {
    tasks: tasks as ProjectFddTask[],
    totalCount: typeof payload.totalCount === "number" ? payload.totalCount : payload.tasks.length,
    requestId: payload.requestId
  };
}

export async function createFddTask(token: string, projectId: string, payload: CreateFddTaskPayload): Promise<{ task: ProjectFddTask; algorithm: FddAlgorithm | null; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.requestId !== "string") {
    throw malformed("FDD task create returned an unexpected response.");
  }
  const task = parseProjectFddTask(response.task);
  const algorithm = response.algorithm === null || response.algorithm === undefined ? null : parseFddAlgorithm(response.algorithm);
  if (!task || (response.algorithm !== null && response.algorithm !== undefined && !algorithm)) {
    throw malformed("FDD task create returned an unexpected entry.");
  }
  return { task, algorithm, requestId: response.requestId };
}

export async function testFddTask(token: string, projectId: string, taskId: string): Promise<{ task: ProjectFddTask; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks/${encodeURIComponent(taskId)}/test`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("FDD task test returned an unexpected response.");
  }
  const task = parseProjectFddTask(payload.task);
  if (!task) {
    throw malformed("FDD task test returned an unexpected task.");
  }
  return { task, requestId: payload.requestId };
}

export async function deployFddTask(token: string, projectId: string, taskId: string): Promise<{ task: ProjectFddTask; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks/${encodeURIComponent(taskId)}/deploy`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("FDD task deploy returned an unexpected response.");
  }
  const task = parseProjectFddTask(payload.task);
  if (!task) {
    throw malformed("FDD task deploy returned an unexpected task.");
  }
  return { task, requestId: payload.requestId };
}

export async function deleteFddTask(
  token: string,
  projectId: string,
  taskId: string
): Promise<{ deleted: boolean; taskId: string; deletedMetricIds: string[]; deletedDashboardIds: string[]; updatedDashboardIds: string[]; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(payload) || typeof payload.deleted !== "boolean" || typeof payload.taskId !== "string" || typeof payload.requestId !== "string") {
    throw malformed("FDD task delete returned an unexpected response.");
  }
  return {
    deleted: payload.deleted,
    taskId: payload.taskId,
    deletedMetricIds: Array.isArray(payload.deletedMetricIds) ? payload.deletedMetricIds.filter((entry): entry is string => typeof entry === "string") : [],
    deletedDashboardIds: Array.isArray(payload.deletedDashboardIds) ? payload.deletedDashboardIds.filter((entry): entry is string => typeof entry === "string") : [],
    updatedDashboardIds: Array.isArray(payload.updatedDashboardIds) ? payload.updatedDashboardIds.filter((entry): entry is string => typeof entry === "string") : [],
    requestId: payload.requestId
  };
}

export async function updateFddTaskParameters(
  token: string,
  projectId: string,
  taskId: string,
  parameters: Array<{ key: string; value: FddParameterValue }>
): Promise<{ task: ProjectFddTask; requestId: string }> {
  const payload = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/fdd-tasks/${encodeURIComponent(taskId)}/parameters`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ parameters })
  });
  if (!isRecord(payload) || typeof payload.requestId !== "string") {
    throw malformed("FDD task parameters returned an unexpected response.");
  }
  const task = parseProjectFddTask(payload.task);
  if (!task) {
    throw malformed("FDD task parameters returned an unexpected task.");
  }
  return { task, requestId: payload.requestId };
}

export async function createDashboard(token: string, projectId: string, payload: Partial<DashboardRecord> & Pick<DashboardRecord, "title" | "layout" | "widgets">): Promise<{ dashboard: DashboardRecord; path: string; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/dashboards`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.requestId !== "string" || typeof response.path !== "string") {
    throw malformed("Dashboard create returned an unexpected response.");
  }
  const parsed = parseDashboardRecord(response.dashboard);
  if (!parsed) {
    throw malformed("Dashboard create returned an unexpected dashboard.");
  }
  return { dashboard: parsed, path: response.path, requestId: response.requestId };
}

export async function updateDashboard(token: string, projectId: string, dashboardId: string, payload: Partial<DashboardRecord> & Pick<DashboardRecord, "title" | "layout" | "widgets">): Promise<{ dashboard: DashboardRecord; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!isRecord(response) || typeof response.requestId !== "string") {
    throw malformed("Dashboard update returned an unexpected response.");
  }
  const parsed = parseDashboardRecord(response.dashboard);
  if (!parsed) {
    throw malformed("Dashboard update returned an unexpected dashboard.");
  }
  return { dashboard: parsed, requestId: response.requestId };
}

export async function deleteDashboard(token: string, projectId: string, dashboardId: string): Promise<{ deleted: boolean; dashboardId: string; requestId: string }> {
  const response = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!isRecord(response) || typeof response.deleted !== "boolean" || typeof response.dashboardId !== "string" || typeof response.requestId !== "string") {
    throw malformed("Dashboard delete returned an unexpected response.");
  }
  return { deleted: response.deleted, dashboardId: response.dashboardId, requestId: response.requestId };
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
  send(data: Record<string, unknown>): void;
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
    },
    send(data: Record<string, unknown>) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }
  };
}

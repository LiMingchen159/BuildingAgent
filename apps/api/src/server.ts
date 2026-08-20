import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  authenticateRequest,
  getPermissionsForSelectedProject,
  requestIdFor,
  requirePermission,
  requireProjectMembership,
  requireSelectedProject,
  sendError,
  writeSessionForToken
} from "./auth.js";
import {
  ensureTokenMeta,
  getTokenTtlMs,
  issueTokenForUser,
  resolveUserIdForToken,
  tokenExpiresAtIso
} from "./authTokens.js";
import {
  createSeedStore,
  ensureStoreDashboardsByProject,
  type ChatMessage,
  type ChatMessageActivity,
  type ChatMessageDownload,
  type ChatMessageImage,
  type Conversation,
  type KnowledgeBaseDocument,
  type RepositoryArtifact,
  type SeedStore
} from "./seed.js";
import {
  finalizeAssistantDownloads,
  sanitizeRepositoryDownloadMarkdown,
  type RepositoryDownloadLink
} from "./repositoryDownloadLinks.js";
import {
  ProviderError,
  createDeterministicMockProvider,
  formatProviderFailureMessage,
  redactedProviderError,
  resolveChatProvider,
  shouldAllowProviderFallback,
  type ChatProvider,
  type FetchLike,
  type ProviderEnv,
  type ProviderMetadata
} from "./providers.js";
import { createGenericToolRegistry, normalizeDashboardCreateArgs } from "./agent/genericTools.js";
import { AgentMemoryStore } from "./agent/memory.js";
import { SessionSearchIndex } from "./sessionIndex.js";
import { ProcessRegistry } from "./agent/processRegistry.js";
import { createParallelToolActivityCoordinator } from "./agent/parallelToolActivity.js";
import { AgentRuntime } from "./agent/runtime.js";
import { createGenericSkillRegistry } from "./agent/skills.js";
import { createProjectSkillBindings, ensureStoreSkillsByProject, mergeSkillIdsForRegistry } from "./projectSkills.js";
import {
  createProjectGroundingBindings,
  ensureStoreProjectGrounding,
  restoreGroundingSequence,
  type ProjectGroundingRule
} from "./projectGrounding.js";
import {
  captureFeedbackEpisode,
  createProjectFeedbackBindings,
  ensureStoreProjectFeedback,
  restoreFeedbackSequence
} from "./projectFeedback.js";
import { createEmbeddingProvider } from "./embeddingProvider.js";
import {
  DerivedMetricStore,
  type FddDeploymentReceipt,
  type DerivedMetricFormulaKind,
  type DerivedMetricInstance,
  type DerivedMetricInvalidValuePolicy,
  type DerivedMetricMaterialization,
  type DerivedMetricSample
} from "./derivedMetrics.js";
import {
  alignNumericSeries,
  DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
  DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS
} from "./derivedMetricAlignment.js";
import { GroundingRuleIndex } from "./groundingRuleIndex.js";
import { retrieveGroundingRules, selectGroundingForTurn, type GroundingRetrievalDiagnostics } from "./groundingRuleRetrieval.js";
import { hasConfigurePermission, platformBoundsPayload } from "./platformBounds.js";
import {
  createProjectMemoryProposalBindings,
  ensureStoreMemoryProposals,
  restoreMemoryProposalSequence
} from "./projectMemoryProposals.js";
import { countFiles, dataRoot, indexKnowledgeBase, indexRepository, kbRootForProject, repoRootForProject } from "./agent/knowledgeBase.js";
import { loadStoreSync, saveStoreSync, scheduleSave } from "./persistence.js";
import { SchedulerService, parseTimeExpression, parseRecurringExpression, parseCancelCommand, parseListCommand } from "./scheduler.js";
import { orderedConversationMessages } from "./conversationMessages.js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { StructuredLogger, attachStructuredLogging } from "./agent/logger.js";
import { randomUUID } from "node:crypto";
import { BmsDatabaseBridge } from "./bmsDatabaseBridge.js";
import { proxyBmsCollector } from "./bmsCollectorProxy.js";
import {
  BMS_SOURCE_NOT_CONFIGURED,
  BMS_SOURCE_UNAVAILABLE,
  type ProjectBmsAccessError,
  type ProjectBmsAccessResult
} from "./bmsProjectAccess.js";
import { fetchTimeseries, type BmsTimeseriesRow } from "./bmsTimeseries.js";
import {
  canManageDashboard,
  canReadDashboard,
  DASHBOARD_LAYOUT_VERSION,
  dashboardPath,
  parseDashboardMutationInput,
  type DashboardMutationInput,
  type DashboardPointBinding,
  type DashboardRecord,
  type DashboardSection,
  type DashboardWidget
} from "./dashboards.js";
import {
  alignFddV4CandidatesToExampleEntity,
  applyFddHomogeneousV4FleetDecision,
  createFddAlgorithmFromInput,
  ensureStoreFddLibrary,
  evaluateFddDeployability,
  FDD_DEPLOYABILITY_POLICY_VERSION,
  fddV4DecisionHasFleetCoverage,
  latestFddCheck,
  normalizeFddCreateInput,
  planFddHomogeneousV4Fleet,
  planFleetGuard,
  fleetGuardStructuralPlanSignature,
  validateFleetGuardAuthorization,
  type FleetGuardAuthorizationToken,
  type FleetGuardPlan,
  type FleetGuardPlanInput,
  projectFddV4FleetCandidateEvidence,
  sortFddPointCandidatesForRequiredPoint,
  type FddAlgorithm,
  type FddCheckSource,
  type FddCheckAgentWorkflow,
  type FddDeployabilityCheck,
  type FddEntityDeployability,
  type FddEquipmentAvailability,
  type FddEquipmentType,
  type FddPointCandidate,
  type FddPointMapping,
  type FddTaskParameterValue,
  type FddQuantityKind,
  type FddUnitCompatibility,
  type ProjectFddTask
} from "./fddLibrary.js";
import {
  evaluateFddRuleSample,
  materializerNearestNumericPoint,
  materializerSortedSeries,
  type FddRuleEvaluationState
} from "./fdd/evaluator.js";
import {
  fddEngineeringUnitIsAccepted,
  fddInventoryEvidenceSignature,
  fddKbSummaryHasCompleteEquipmentInventory,
  parseMinimalBrickFacts
} from "./fdd/equipmentEvidence.js";
import {
  fddEvaluatorRegistrationCanonicalSignature,
  fleetGuardEvaluatorRegistration,
  isExecutableFddAlgorithm
} from "./fdd/runtimeRegistry.js";
import {
  FddBindingProposerShadowService,
  ProjectFddBindingProposerAuditStore,
  fddBindingProposerConfigFromEnv,
  type FddBindingProposerAuditRecord,
  type FddBindingProposerScheduleResult
} from "./fdd/bindingProposer.js";
import { createFddBindingProposerCompletionPort } from "./fdd/bindingProposerProvider.js";
import {
  buildFleetGuardShadowInputFromV4Evidence,
  fddFleetGuardAlgorithmEvidenceSignature,
  fddFleetGuardEvaluatorEvidenceSignature
} from "./fdd/bindingProposerEvidenceAdapter.js";
import {
  applyFddFleetTemplateVersionToPlannerInput,
  applyCurrentFddFleetTemplateToPlannerInput,
  createFddFleetTemplateBindings,
  currentFddFleetTemplateHead,
  ensureStoreFddFleetTemplates,
  fddFleetTemplateVersionByRef,
  FddFleetTemplateError,
  type FddFleetTemplateVersion
} from "./fdd/fleetTemplates.js";
import {
  createFddFleetGuardRolloutBindings,
  currentFddFleetGuardRollout,
  ensureStoreFddFleetGuardRollouts,
  fddFleetGuardGlobalConfigFromEnv,
  isFddFleetGuardCanarySelected,
  FddFleetGuardRolloutError
} from "./fdd/fleetGuardRollout.js";
import {
  fddFleetGuardAssessment,
  fddFleetGuardParameterSignature,
  parseFddFleetGuardAuthorization,
  type FddFleetGuardAssessment
} from "./fdd/fleetGuardAuthorization.js";
export { fddPersistenceWindowGraceMs } from "./fdd/evaluator.js";

type DashboardDataSource = "bms" | "derived_metric";
const ELEMENT_BMS_PROJECT_ID = "project_element";
const BMS_SOURCE_NOT_CONFIGURED_MESSAGE = "No BMS source is configured for this project.";
const BMS_SOURCE_UNAVAILABLE_MESSAGE = "The configured BMS source does not expose a live BMS catalog.";

const FDD_ANALYSIS_TITLE = "Fault Cause Analysis";
const FDD_ANALYSIS_RANGE = "7d";
const FDD_TRENDS_TITLE = "Chiller Trends";
const FDD_ATTRIBUTION_ANALYSIS_PROMPT_MAX_CHARS = 24_000;
const FDD_ATTRIBUTION_ANALYSIS_MAX_TOKENS = 2_000;

interface BmsDashboardHistoryBatchQuery {
  key: string;
  source: DashboardDataSource;
  bms_source_id?: string;
  name?: string;
  point_id?: string;
  object_ref?: string;
  metric_instance_id?: string;
  metric_key?: string;
  entity_id?: string;
  from: string;
  to?: string;
  range?: string;
  limit?: string;
  order?: string;
}

interface BmsDashboardLatestBatchQuery {
  key: string;
  source: DashboardDataSource;
  bms_source_id?: string;
  name?: string;
  point_id?: string;
  object_ref?: string;
  metric_instance_id?: string;
  metric_key?: string;
  entity_id?: string;
}

interface ActiveChatStreamSnapshot {
  projectId: string;
  conversationId: string;
  requestId: string;
  startedAt: number;
  updatedAt: number;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activities: ChatMessageActivity[];
  interimNarration: string;
  answerPhase: boolean;
  workElapsedMs: number;
  workSegmentStartedAt: number | null;
  workTimelinePaused: boolean;
  streamTimelineFinalized: boolean;
}

interface BuildServerOptions {
  store?: SeedStore;
  chatProvider?: ChatProvider;
  resolveChatProvider?: (env: ProviderEnv) => ChatProvider;
  env?: ProviderEnv;
  fetch?: FetchLike;
  allowProviderFallback?: boolean;
  persist?: boolean;
  fddTestHooks?: {
    beforeRegisterMetric?: (input: { projectId: string; algorithmKey: string; entityId: string }) => void;
    beforeInsertFleetGuardReceipt?: (input: { projectId: string; taskId: string; receiptId: string }) => void;
    afterInsertFleetGuardReceipt?: (input: { projectId: string; taskId: string; receiptId: string }) => void;
    beforeFleetGuardStorePersist?: (input: { projectId: string; taskId: string; receiptId: string }) => void;
    onAuthorizationRefresh?: (input: { projectId: string; taskId: string }) => void;
    onFddMaterialized?: (input: { projectId: string; instanceId: string }) => void;
    onMaterializerReady?: (run: () => Promise<void>) => void;
    beforeBindingProposerProjection?: (input: { projectId: string; algorithmId: string }) => void | Promise<void>;
    onBindingProposerScheduled?: (input: {
      projectId: string;
      algorithmId: string;
      result: FddBindingProposerScheduleResult;
    }) => void;
    onBindingProposerCompleted?: (record: FddBindingProposerAuditRecord) => void;
  };
}

interface BmsSourceState {
  source: BmsSourceSummary;
  points: BmsPointSummary[];
}

interface BmsJobState {
  job: BmsIngestionJobStatusResponse;
  results: BmsIngestionResultsResponse;
  pollsRemaining: number;
}

function tryLoadEnv(): void {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env")
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (key && !(key in process.env)) {
          process.env[key] = trimmed.slice(eq + 1).trim();
        }
      }
      return;
    } catch {
      // try next candidate
    }
  }
}

function resolveConfiguredDataDir(value: string | undefined, fallbackBase = process.cwd()): string | null {
  const configured = value?.trim();
  if (!configured) return null;
  return path.isAbsolute(configured) ? configured : path.resolve(fallbackBase, configured);
}

function repositoryFileRootsForProject(projectId: string, env: ProviderEnv): string[] {
  const currentRoot = path.resolve(repoRootForProject(projectId, env));
  const legacyDataRoots = [
    resolveConfiguredDataDir(env.BUILDING_AGENT_LEGACY_DATA_DIR),
    path.resolve(process.cwd(), "../data"),
    "/root/data"
  ].filter((entry): entry is string => Boolean(entry));
  const roots = [currentRoot];
  const seen = new Set([currentRoot]);
  for (const dataDir of legacyDataRoots) {
    const legacyRoot = path.resolve(dataDir, projectId, "repository");
    if (seen.has(legacyRoot) || !existsSync(legacyRoot)) continue;
    roots.push(legacyRoot);
    seen.add(legacyRoot);
  }
  return roots;
}

function resolveRepositoryFileForRead(projectId: string, requestedPath: string, env: ProviderEnv): string | null {
  for (const repoRoot of repositoryFileRootsForProject(projectId, env)) {
    const resolvedRoot = path.resolve(repoRoot);
    const absolutePath = path.resolve(resolvedRoot, requestedPath);
    if (!absolutePath.startsWith(resolvedRoot + path.sep) && absolutePath !== resolvedRoot) {
      continue;
    }
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

interface ProjectParams {
  projectId: string;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface ChatBody {
  message?: unknown;
}

interface BmsSourcePayload {
  project_id: string;
  building_id: string;
  name: string;
  vendor_type: string;
  protocol_type: string;
  base_url: string | null;
  host: string | null;
  port: number | null;
  auth_type: string;
  read_only: boolean;
  config: Record<string, unknown>;
}

interface BmsSourceSummary extends BmsSourcePayload {
  source_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_connection_test?: BmsConnectionTestResponse | undefined;
  last_ingestion_job_id?: string | undefined;
}

interface BmsCapabilitySet {
  discover_points: boolean;
  read_latest: boolean;
  read_history: boolean;
  write_point: boolean;
}

interface BmsConnectionTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  capabilities: BmsCapabilitySet;
  tested_at: string;
}

interface BmsPointSummary {
  id: string;
  point_name: string;
  vendor_point_id: string;
  api_path?: string | null;
  unit: string;
  equipment_name: string;
  system_name: string;
  location: string;
  point_type: string;
  writable: boolean;
  semantic_class: string;
  status: string;
  description?: string;
  warnings?: string[];
  raw_row?: Record<string, string>;
}

interface BmsDiscoverPointsResponse {
  source_id: string;
  points: BmsPointSummary[];
  count: number;
}

interface BmsMinimalIngestionRequest {
  source_id: string;
  point_ids: string[];
  sample_count: number;
  interval_seconds: number;
}

interface BmsIngestionJobStatusResponse {
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

interface BmsIngestionSeriesValue {
  timestamp: string;
  value: number;
  quality: "good" | "bad" | "uncertain";
}

interface BmsIngestionSeries {
  point_id: string;
  point_name: string;
  unit: string;
  values: BmsIngestionSeriesValue[];
}

interface BmsIngestionResultsResponse {
  job_id: string;
  series: BmsIngestionSeries[];
}

interface BmsSourceCredentialsPayload {
  auth_type: string;
  username?: string;
  password?: string;
  token?: string;
}

interface BmsPointImportPayload {
  source_id: string;
  points: BmsPointSummary[];
}

interface BmsLiveValueRow {
  point_id: string;
  point_name: string;
  vendor_point_id: string;
  api_path?: string | null;
  value: string | number | boolean | null;
  unit: string;
  quality: string;
  timestamp: string;
  success: boolean;
  error_message?: string;
  raw_payload_keys?: string[];
}

interface BmsLiveValueTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  tested_at: string;
  rows: BmsLiveValueRow[];
}

interface BmsTempUploadPayload {
  project_id: string;
  file_name: string;
  mime_type?: string;
  content_base64: string;
  row_count?: number;
  preview_headers?: string[];
  preview_rows?: Array<Record<string, string>>;
  points?: BmsPointSummary[];
  warnings?: string[];
}

interface BmsTempUploadResponse {
  upload_id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  temp_file_token: string;
  temp_relative_path: string;
  uploaded_at: string;
  row_count: number;
  preview_headers: string[];
  preview_rows: Array<Record<string, string>>;
  points: BmsPointSummary[];
  warnings?: string[];
}

interface ParsedPreviewData {
  headers: string[];
  rows: Array<Record<string, string>>;
  points: BmsPointSummary[];
  rowCount: number;
  warnings?: string[];
}

const DOWNLOAD_ATTACHMENT_EXTENSIONS = new Set([
  ".csv",
  ".md",
  ".json",
  ".txt",
  ".pdf",
  ".xlsx",
  ".xls",
  ".zip",
  ".yaml",
  ".yml",
  ".xml",
  ".tsv"
]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".csv": "text/csv",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "text/typescript"
};

function normalizeRepositoryImagePath(rawPath: string): string {
  let normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const kbMatch = normalized.match(/(?:^|\.\.\/|\/)kb\/outputs\/(.+)/i);
  if (kbMatch) {
    normalized = `outputs/${kbMatch[1]}`;
  }
  return normalized;
}

function extractMarkdownImagePaths(content: string): string[] {
  const matches = content.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g);
  return [...matches].map((match) => normalizeRepositoryImagePath(match[1] ?? ""));
}

function filterImagesReferencedInContent(
  images: ChatMessageImage[] | undefined,
  content: string
): ChatMessageImage[] | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }
  const referenced = new Set(extractMarkdownImagePaths(content).map((value) => value.toLowerCase()));
  if (referenced.size === 0) {
    return undefined;
  }
  const filtered = images.filter((image) => referenced.has(normalizeRepositoryImagePath(image.src).toLowerCase()));
  return filtered.length > 0 ? filtered : undefined;
}

function dedupeChatImages(images: ChatMessageImage[] | undefined): ChatMessageImage[] | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const deduped: ChatMessageImage[] = [];
  for (const image of images) {
    const normalized = normalizeRepositoryImagePath(image.src);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...image, src: normalized });
  }
  return deduped.length > 0 ? deduped : undefined;
}

function finalizeAssistantImages(
  images: ChatMessageImage[] | undefined,
  content: string
): ChatMessageImage[] | undefined {
  return filterImagesReferencedInContent(dedupeChatImages(images), content);
}

function finalizeAssistantContent(
  text: string,
  images: ChatMessageImage[] | undefined,
  downloads: RepositoryDownloadLink[] | undefined
): { content: string; images?: ChatMessageImage[]; downloads?: ChatMessageDownload[] } {
  const content = sanitizeRepositoryDownloadMarkdown(text);
  const finalizedImages = finalizeAssistantImages(images, content);
  const finalizedDownloads = finalizeAssistantDownloads(downloads, content);
  return {
    content,
    ...(finalizedImages ? { images: finalizedImages } : {}),
    ...(finalizedDownloads ? { downloads: finalizedDownloads } : {})
  };
}

function markdownLinkLabel(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function dashboardsCreatedAfter(
  store: SeedStore,
  projectId: string,
  existingDashboardIds: ReadonlySet<string>
): DashboardRecord[] {
  return (store.dashboardsByProject[projectId] ?? [])
    .filter((dashboard) => !existingDashboardIds.has(dashboard.id));
}

function appendCreatedDashboardLinks(
  content: string,
  projectId: string,
  dashboards: DashboardRecord[]
): string {
  const missingLinks = dashboards
    .map((dashboard) => ({
      dashboard,
      path: dashboardPath(projectId, dashboard.id)
    }))
    .filter(({ path }) => !content.includes(path));
  if (missingLinks.length === 0) {
    return content;
  }
  const linkLines = missingLinks
    .map(({ dashboard, path }) => `- [${markdownLinkLabel(dashboard.title)}](${path})`)
    .join("\n");
  const heading = missingLinks.length === 1 ? "Dashboard link:" : "Dashboard links:";
  return `${content.trimEnd()}\n\n${heading}\n${linkLines}`;
}

function stripProviderThinkingMarkup(content: string): string {
  return content
    .replace(/<(think|redacted_thinking)>[\s\S]*?<\/(think|redacted_thinking)>/gi, "")
    .replace(/<(think|redacted_thinking)>[\s\S]*$/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackConversationTitle(userText: string): string {
  const compact = userText.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 60) : "New conversation";
}

function sanitizeConversationTitle(text: string): string {
  const stripped = stripProviderThinkingMarkup(text);
  return stripped
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function isFirstConversationExchange(conversation: Conversation, messages: ChatMessage[]): boolean {
  const convoMessages = conversation.messageIds
    .map((id) => messages.find((message) => message.id === id))
    .filter((message): message is ChatMessage => Boolean(message));
  return convoMessages.filter((message) => message.role === "user").length === 1
    && convoMessages.filter((message) => message.role === "assistant").length === 1;
}

/** Placeholder title from the user's question (shown immediately). */
function tryInstantConversationTitle(params: {
  conversation: Conversation;
  userText: string;
  onUpdated?: (title: string) => void;
}): string | null {
  if (params.conversation.title !== "New conversation") {
    return null;
  }
  const title = fallbackConversationTitle(params.userText);
  if (title === "New conversation") {
    return null;
  }
  params.conversation.title = title;
  params.onUpdated?.(title);
  return title;
}

/** Best-effort deterministic title refinement after the first assistant reply. */
async function refineConversationTitleWithBuildingGptContext(params: {
  conversation: Conversation;
  userText: string;
  assistantText: string;
  onUpdated?: (title: string) => void;
}): Promise<void> {
  const current = params.conversation.title;
  const userTitle = fallbackConversationTitle(params.userText);
  const assistantTitle = fallbackConversationTitle(stripProviderThinkingMarkup(params.assistantText));
  const title = current === "New conversation"
    ? userTitle
    : current.length < 12 && assistantTitle !== "New conversation"
      ? assistantTitle
      : current;
  const sanitized = sanitizeConversationTitle(title);
  if (sanitized && sanitized !== current) {
    params.conversation.title = sanitized;
    params.onUpdated?.(sanitized);
  }
}

let messageSequence = 0;
let conversationSequence = 0;
let dashboardSequence = 0;

function nextMessageId(): string {
  messageSequence += 1;
  return `msg_${String(messageSequence).padStart(6, "0")}`;
}

function nextConversationId(): string {
  conversationSequence += 1;
  return `conv_${String(conversationSequence).padStart(6, "0")}`;
}

function nextDashboardId(): string {
  dashboardSequence += 1;
  return `dash_${String(dashboardSequence).padStart(6, "0")}`;
}

function sortedDashboards(dashboards: DashboardRecord[]): DashboardRecord[] {
  return [...dashboards].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function readableDashboardsForProject(store: SeedStore, projectId: string, userId: string): DashboardRecord[] {
  return sortedDashboards((store.dashboardsByProject[projectId] ?? []).filter((dashboard) => canReadDashboard(dashboard, userId)));
}

function restoreDashboardSequence(store: SeedStore): void {
  let maxSeen = dashboardSequence;
  for (const dashboards of Object.values(store.dashboardsByProject ?? {})) {
    for (const dashboard of dashboards) {
      const match = dashboard.id.match(/^dash_(\d+)$/u);
      if (!match) continue;
      maxSeen = Math.max(maxSeen, Number(match[1]));
    }
  }
  dashboardSequence = maxSeen;
}

function createDashboardRecord(input: DashboardMutationInput, projectId: string, userId: string): DashboardRecord {
  const now = new Date().toISOString();
  return {
    id: nextDashboardId(),
    projectId,
    ownerUserId: userId,
    visibility: input.visibility ?? "private",
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    layoutVersion: input.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
    layout: input.layout.map((item) => ({ ...item })),
    widgets: input.widgets.map((widget) => ({
      ...widget,
      pointBindings: widget.pointBindings.map((binding) => ({ ...binding }))
    })),
    ...(input.sections ? {
      sections: input.sections.map((section) => ({
        ...section,
        widgetIds: [...section.widgetIds]
      }))
    } : {}),
    createdAt: now,
    updatedAt: now,
    ...(input.sourceConversationId ? { sourceConversationId: input.sourceConversationId } : {})
  };
}

function updateDashboardRecord(existing: DashboardRecord, input: DashboardMutationInput): DashboardRecord {
  return {
    ...existing,
    title: input.title,
    visibility: input.visibility ?? existing.visibility,
    layoutVersion: input.layoutVersion ?? existing.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
    layout: input.layout.map((item) => ({ ...item })),
    widgets: input.widgets.map((widget) => ({
      ...widget,
      pointBindings: widget.pointBindings.map((binding) => ({ ...binding }))
    })),
    ...(input.sections ? {
      sections: input.sections.map((section) => ({
        ...section,
        widgetIds: [...section.widgetIds]
      }))
    } : existing.sections ? {
      sections: existing.sections.map((section) => ({
        ...section,
        widgetIds: [...section.widgetIds]
      }))
    } : {}),
    updatedAt: new Date().toISOString(),
    ...(input.description ? { description: input.description } : existing.description ? { description: existing.description } : {}),
    ...(input.sourceConversationId ? { sourceConversationId: input.sourceConversationId } : {})
  };
}

function dashboardPointBindingIdentity(binding: DashboardPointBinding): string {
  const source = binding.source ?? (binding.metricInstanceId || binding.metricKey ? "derived_metric" : binding.pointName || binding.objectRef ? "bms" : "");
  return [
    source,
    binding.bmsSourceId ?? "",
    binding.metricInstanceId ?? "",
    binding.metricKey ?? "",
    binding.entityId ?? "",
    binding.pointName ?? "",
    binding.objectRef ?? ""
  ].join("|");
}

function dashboardBindingForDerivedMetricOutput(binding: DashboardPointBinding, instance: DerivedMetricInstance): DashboardPointBinding {
  const fddParameters = Array.isArray(instance.metadata?.fddParameters)
    ? instance.metadata.fddParameters.filter((parameter): parameter is Record<string, unknown> => isRecordValue(parameter))
    : undefined;
  return {
    ...binding,
    source: "derived_metric",
    metricInstanceId: instance.instanceId,
    metricKey: binding.metricKey ?? instance.metricKey,
    entityId: binding.entityId ?? instance.entityId,
    groupId: binding.groupId ?? instance.entityId,
    label: binding.label ?? instance.displayName,
    role: binding.role ?? "fault_status",
    dependencyRole: "output",
    defaultVisible: true,
    unit: binding.unit ?? instance.unit ?? "boolean",
    description: binding.description ?? instance.formulaDescription ?? instance.formula ?? instance.displayName,
    ...(fddParameters ? { fddParameters } : {})
  };
}

function dashboardPointDescription(pointName: string | undefined, role: string | undefined): string | undefined {
  const name = pointName ?? "";
  const suffix = name.replace(/^.*[_-]([^_-]+)$/u, "$1").toUpperCase();
  if (suffix === "TLKW") return "Motor Kilowatts";
  if (suffix === "TLKWH") return "Motor Kilowatt-Hours";
  if (suffix === "Q") return "Cooling load";
  if (suffix === "P") return "Power";
  if (suffix === "COP") return "Coefficient of Performance";
  if (/_Run_Status$/u.test(name) || role === "chiller_status") return "Run Status";
  if (/CHWST$/u.test(name)) return "Chilled Water Supply Temperature";
  if (/CHWRT$/u.test(name)) return "Chilled Water Return Temperature";
  if (/CHWFWR$/u.test(name)) return "Chilled Water Flow Rate";
  if (/CHWFWS$/u.test(name)) return "Chilled Water Flow Status";
  if (role === "chiller_power") return "Motor Kilowatts";
  if (role === "cooling_load") return "Cooling load";
  return undefined;
}

function dashboardBindingsForDerivedMetricInputs(instance: DerivedMetricInstance): DashboardPointBinding[] {
  return instance.dependencies.map((dependency) => {
    const description = dashboardPointDescription(dependency.pointName ?? dependency.sourceId, dependency.role);
    const base: DashboardPointBinding = {
      entityId: instance.entityId,
      groupId: instance.entityId,
      label: dependency.label ?? dependency.role,
      role: dependency.role,
      dependencyRole: "input",
      defaultVisible: false,
      ...(dependency.unit ? { unit: dependency.unit } : {}),
      ...(description ? { description } : {})
    };
    if (dependency.sourceType === "metric") {
      return {
        ...base,
        source: "derived_metric",
        metricInstanceId: dependency.sourceId
      };
    }
    return {
      ...base,
      source: "bms",
      ...(dependency.pointName ? { pointName: dependency.pointName } : dependency.objectRef ? {} : { pointName: dependency.sourceId }),
      ...(dependency.objectRef ? { objectRef: dependency.objectRef } : {})
    };
  });
}

function derivedMetricInstanceForDashboardBinding(
  binding: DashboardPointBinding,
  derivedMetrics: DerivedMetricStore,
  projectId: string
): DerivedMetricInstance | null {
  if (binding.metricInstanceId) {
    const instance = derivedMetrics.getInstance(binding.metricInstanceId);
    return instance?.projectId === projectId ? instance : null;
  }
  if (binding.metricKey && binding.entityId) {
    return derivedMetrics.lookup({
      projectId,
      metricKey: binding.metricKey,
      entityId: binding.entityId,
      limit: 1
    })[0] ?? null;
  }
  return null;
}

function isFddAttributionDashboardWidget(widget: DashboardWidget): boolean {
  return widget.kind === "fdd_fault_rate_comparison" || widget.kind === "fdd_attribution_analysis";
}

function dashboardBindingListSignature(bindings: DashboardPointBinding[]): string {
  return JSON.stringify(bindings.map((binding) => ({
    id: binding.id ?? "",
    source: binding.source ?? "",
    pointName: binding.pointName ?? "",
    objectRef: binding.objectRef ?? "",
    metricInstanceId: binding.metricInstanceId ?? "",
    metricKey: binding.metricKey ?? "",
    entityId: binding.entityId ?? "",
    label: binding.label ?? "",
    role: binding.role ?? "",
    dependencyRole: binding.dependencyRole ?? "",
    defaultVisible: binding.defaultVisible ?? null,
    groupId: binding.groupId ?? "",
    unit: binding.unit ?? "",
    description: binding.description ?? "",
    fddParameters: binding.fddParameters ?? []
  })));
}

function migrateFddAttributionWidget(
  widget: DashboardWidget,
  derivedMetrics: DerivedMetricStore,
  projectId: string
): { widget: DashboardWidget; changed: boolean } {
  if (!isFddAttributionDashboardWidget(widget)) {
    return { widget, changed: false };
  }

  let changed = widget.kind !== "fdd_attribution_analysis" || widget.defaultTimeRange !== FDD_ANALYSIS_RANGE || widget.title !== FDD_ANALYSIS_TITLE;
  const title = FDD_ANALYSIS_TITLE;
  if (title !== widget.title) changed = true;

  const nextBindings: DashboardPointBinding[] = [];
  const seen = new Set<string>();
  for (const binding of widget.pointBindings) {
    const instance = derivedMetricInstanceForDashboardBinding(binding, derivedMetrics, projectId);
    const outputBinding = instance
      ? dashboardBindingForDerivedMetricOutput(binding, instance)
      : {
          ...binding,
          dependencyRole: binding.dependencyRole ?? "output",
          defaultVisible: binding.defaultVisible ?? true
        };
    const outputKey = dashboardPointBindingIdentity(outputBinding);
    if (!seen.has(outputKey)) {
      seen.add(outputKey);
      nextBindings.push(outputBinding);
    }
    if (!instance) continue;
    for (const inputBinding of dashboardBindingsForDerivedMetricInputs(instance)) {
      const inputKey = dashboardPointBindingIdentity(inputBinding);
      if (seen.has(inputKey)) continue;
      seen.add(inputKey);
      nextBindings.push(inputBinding);
      changed = true;
    }
  }

  if (dashboardBindingListSignature(nextBindings) !== dashboardBindingListSignature(widget.pointBindings)) changed = true;
  return {
    widget: {
      ...widget,
      kind: "fdd_attribution_analysis",
      title,
      pointBindings: nextBindings,
      defaultTimeRange: FDD_ANALYSIS_RANGE
    } as DashboardWidget,
    changed
  };
}

function uniqueWidgetIds(widgetIds: string[]): string[] {
  return [...new Set(widgetIds.filter(Boolean))];
}

function dashboardSectionDisplayRank(section: Pick<DashboardSection, "id" | "kind" | "title">): number {
  const id = section.id.toLowerCase();
  const title = section.title.toLowerCase();
  if (section.kind === "overview" || id === "overview") return 0;
  if (section.kind === "analysis" || id === "analysis" || id === "attribution") return 1;
  if (section.kind === "comparison" || id === "comparison") return 2;
  if (section.kind === "trends" || id === "trends") return 3;
  if (id === "notes" || title === "notes") return 4;
  return 5;
}

function dashboardSectionListSignature(sections: DashboardSection[] | undefined): string {
  return (sections ?? [])
    .map((section) => `${section.id}:${section.title}:${section.kind}:${section.collapsed ? "1" : "0"}:${section.widgetIds.join(",")}`)
    .join("|");
}

function sortDashboardSectionsForDisplay(sections: DashboardSection[]): DashboardSection[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) => {
      const rankDelta = dashboardSectionDisplayRank(left.section) - dashboardSectionDisplayRank(right.section);
      return rankDelta || left.index - right.index;
    })
    .map((entry) => entry.section);
}

function normalizeFddDashboardSection(section: DashboardSection): DashboardSection {
  const id = section.id.toLowerCase();
  if (section.kind === "analysis" || id === "analysis" || id === "attribution") {
    return { ...section, id: "analysis", title: FDD_ANALYSIS_TITLE, kind: "analysis" };
  }
  if (section.kind === "trends" || id === "trends") {
    return { ...section, title: FDD_TRENDS_TITLE, collapsed: section.collapsed ?? true };
  }
  return section;
}

function fddDashboardSectionForWidget(widget: DashboardWidget): DashboardSection {
  if (widget.kind === "timeseries_chart") {
    return { id: "trends", title: FDD_TRENDS_TITLE, kind: "trends", widgetIds: [], collapsed: true };
  }
  if (isFddAttributionDashboardWidget(widget)) {
    return { id: "analysis", title: FDD_ANALYSIS_TITLE, kind: "analysis", widgetIds: [] };
  }
  if (widget.kind === "bar_comparison") {
    return { id: "comparison", title: "Comparison", kind: "comparison", widgetIds: [] };
  }
  if (widget.kind === "note") {
    return { id: "notes", title: "Notes", kind: "custom", widgetIds: [] };
  }
  return { id: "overview", title: "Overview", kind: "overview", widgetIds: [] };
}

function pushDashboardSectionWidgetIds(
  sections: DashboardSection[],
  sectionInfo: DashboardSection,
  widgetIds: string[]
): void {
  const nextWidgetIds = uniqueWidgetIds(widgetIds);
  if (nextWidgetIds.length === 0) return;
  const existing = sections.find((section) => section.id === sectionInfo.id);
  if (existing) {
    existing.widgetIds = uniqueWidgetIds([...existing.widgetIds, ...nextWidgetIds]);
    if (sectionInfo.id === "analysis") {
      existing.title = FDD_ANALYSIS_TITLE;
      existing.kind = "analysis";
    }
    if (sectionInfo.id === "trends") {
      existing.title = FDD_TRENDS_TITLE;
      existing.kind = "trends";
      existing.collapsed = existing.collapsed ?? true;
    }
    return;
  }
  sections.push({
    ...sectionInfo,
    widgetIds: nextWidgetIds
  });
}

function pushDashboardWidgetsToNaturalSections(
  sections: DashboardSection[],
  widgetIds: string[],
  widgetById: Map<string, DashboardWidget>
): void {
  for (const widgetId of widgetIds) {
    const widget = widgetById.get(widgetId);
    if (!widget) continue;
    pushDashboardSectionWidgetIds(sections, fddDashboardSectionForWidget(widget), [widgetId]);
  }
}

function migrateFddAttributionSections(
  sections: DashboardSection[] | undefined,
  fddWidgetIds: Set<string>,
  widgets: DashboardWidget[]
): { sections: DashboardSection[] | undefined; changed: boolean } {
  if (fddWidgetIds.size === 0) return { sections, changed: false };
  let changed = false;
  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]));
  const analysisWidgetIds: string[] = [];
  const nextSections: DashboardSection[] = [];

  for (const section of sections ?? []) {
    const validWidgetIds = section.widgetIds.filter((widgetId) => widgetById.has(widgetId));
    const fddIds = validWidgetIds.filter((widgetId) => fddWidgetIds.has(widgetId));
    const otherIds = validWidgetIds.filter((widgetId) => !fddWidgetIds.has(widgetId));
    const isAnalysis = section.id === "analysis" || section.id === "attribution" || section.kind === "analysis";
    if (validWidgetIds.length !== section.widgetIds.length) {
      changed = true;
    }
    if (isAnalysis) {
      analysisWidgetIds.push(...fddIds);
      if (section.id !== "analysis" || section.title !== FDD_ANALYSIS_TITLE || section.kind !== "analysis" || otherIds.length > 0) {
        changed = true;
      }
      pushDashboardWidgetsToNaturalSections(nextSections, otherIds, widgetById);
      continue;
    }
    if (fddIds.length > 0) {
      analysisWidgetIds.push(...fddIds);
      changed = true;
    }
    if (otherIds.length > 0) {
      const nextSection = normalizeFddDashboardSection(otherIds.length === section.widgetIds.length ? section : { ...section, widgetIds: otherIds });
      pushDashboardSectionWidgetIds(nextSections, nextSection, otherIds);
      if (otherIds.length !== section.widgetIds.length) changed = true;
      if (dashboardSectionListSignature([section]) !== dashboardSectionListSignature([nextSection])) changed = true;
    }
  }

  for (const widgetId of fddWidgetIds) {
    if (!analysisWidgetIds.includes(widgetId)) {
      analysisWidgetIds.push(widgetId);
      changed = true;
    }
  }

  if (analysisWidgetIds.length > 0) {
    pushDashboardSectionWidgetIds(nextSections, {
      id: "analysis",
      title: FDD_ANALYSIS_TITLE,
      kind: "analysis",
      widgetIds: []
    }, analysisWidgetIds);
  }
  const sortedSections = sortDashboardSectionsForDisplay(nextSections);
  if (dashboardSectionListSignature(sections) !== dashboardSectionListSignature(sortedSections)) {
    changed = true;
  }

  return {
    sections: sortedSections.length > 0 ? sortedSections : undefined,
    changed
  };
}

function migrateDashboardFddAttribution(
  dashboard: DashboardRecord,
  derivedMetrics: DerivedMetricStore
): { dashboard: DashboardRecord; changed: boolean } {
  let changed = false;
  const fddWidgetIds = new Set<string>();
  const widgets = dashboard.widgets.map((widget) => {
    const migrated = migrateFddAttributionWidget(widget, derivedMetrics, dashboard.projectId);
    if (migrated.widget.kind === "fdd_attribution_analysis") {
      fddWidgetIds.add(migrated.widget.id);
    }
    changed ||= migrated.changed;
    return migrated.widget;
  });
  const migratedSections = migrateFddAttributionSections(dashboard.sections, fddWidgetIds, widgets);
  changed ||= migratedSections.changed;
  if (!changed) return { dashboard, changed: false };
  return {
    dashboard: {
      ...dashboard,
      widgets,
      ...(migratedSections.sections ? { sections: migratedSections.sections } : {})
    },
    changed: true
  };
}

function migrateStoreFddAttributionDashboards(store: SeedStore, derivedMetrics: DerivedMetricStore): number {
  let migratedCount = 0;
  for (const [projectId, dashboards] of Object.entries(store.dashboardsByProject ?? {})) {
    const nextDashboards = dashboards.map((dashboard) => {
      const migrated = migrateDashboardFddAttribution(dashboard, derivedMetrics);
      if (migrated.changed) migratedCount += 1;
      return migrated.dashboard;
    });
    store.dashboardsByProject[projectId] = sortedDashboards(nextDashboards);
  }
  return migratedCount;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactJsonForProvider(value: unknown, maxChars = FDD_ATTRIBUTION_ANALYSIS_PROMPT_MAX_CHARS): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... truncated because the evidence packet was too large`;
}

function sanitizeFddAttributionGeneratedText(text: string): string {
  return stripProviderThinkingMarkup(text)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6_000);
}

function isUsableFddAttributionGeneratedText(text: string): boolean {
  const normalized = text.toLowerCase();
  return text.length >= 120 && normalized.includes("overall summary") && normalized.includes("likely cause") && normalized.includes("data-based next check");
}

function fddAttributionAnalysisPrompt(params: {
  widgetTitle?: string | undefined;
  rangeLabel?: string | undefined;
  summary: unknown;
}): Array<{ role: "system" | "user"; content: string }> {
  const payload = compactJsonForProvider({
    widgetTitle: params.widgetTitle ?? FDD_ANALYSIS_TITLE,
    rangeLabel: params.rangeLabel ?? "Last 7 days",
    summary: params.summary
  });
  return [
    {
      role: "system",
      content: [
        "You are BuildingGPT writing an FDD fault attribution for facility engineers.",
        "Use only the provided JSON evidence packet; do not invent equipment, point names, values, causes, or time windows.",
        "The UI already filtered to equipment with fault samples and the related input signals, so focus on explaining the strongest data-supported cause.",
        "Write in English. Keep it concise, practical, and readable for an engineer with basic building operations experience.",
        "Return only the final Markdown answer, with no hidden reasoning, preamble, JSON, tables, or code block. Keep the full answer between 180 and 260 words.",
        "Do not use generic recommendations. The Data-based next check must name the exact equipment and point(s) to inspect and explain what the data shows.",
        "If the likely issue is data quality, say plainly what is wrong with the data, such as missing samples near fault times, zero values, flatline values, or a fault-period shift.",
        "Avoid internal phrases such as telemetry gap, mapping gap, restore mapping, or pipeline. Do not call the section a workflow or ranking.",
        "Start with **Overall summary:** using outputSummary.analyzedEquipmentCount and outputSummary.faultyEquipmentCount; say '<faulty count> of <analyzed count> analyzed chillers showed fault samples', then give the overall fault samples/valid samples, overall fault rate, and strongest-evidence equipment.",
        "Then explain the strongest data-supported cause. Format as Markdown with short paragraphs and bold labels. Include: **Overall summary:**, **Likely cause:**, **Equipment:**, **Problem input:**, **Data evidence:**, and **Data-based next check:**.",
        "Mention the configured FDD window only if it appears in the evidence packet."
      ].join(" ")
    },
    {
      role: "user",
      content: `Generate the dashboard fault cause analysis from this evidence packet:\n\n${payload}`
    }
  ];
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringFieldAny(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringField(record, key);
    if (value) return value;
  }
  return undefined;
}

function dashboardDataSource(record: Record<string, unknown>): DashboardDataSource {
  const source = stringField(record, "source") ?? stringField(record, "sourceType") ?? stringField(record, "source_type");
  if (source === "derived_metric" || source === "derived" || source === "metric") return "derived_metric";
  if (stringFieldAny(record, ["metric_instance_id", "metricInstanceId", "metric_key", "metricKey", "entity_id", "entityId"])) {
    return "derived_metric";
  }
  return "bms";
}

function parseBmsDashboardHistoryBatchQuery(value: unknown): BmsDashboardHistoryBatchQuery | null {
  if (!isRecordValue(value)) return null;
  const key = stringField(value, "key");
  const from = stringField(value, "from");
  const source = dashboardDataSource(value);
  const bmsSourceId = stringFieldAny(value, ["bms_source_id", "bmsSourceId", "source_id", "sourceId"]);
  const name = stringField(value, "name");
  const pointId = stringField(value, "point_id") ?? stringField(value, "pointId");
  const objectRef = stringField(value, "object_ref") ?? stringField(value, "objectRef");
  const metricInstanceId = stringFieldAny(value, ["metric_instance_id", "metricInstanceId", "instance_id", "instanceId"]);
  const metricKey = stringFieldAny(value, ["metric_key", "metricKey"]);
  const entityId = stringFieldAny(value, ["entity_id", "entityId"]);
  const to = stringField(value, "to");
  const range = stringField(value, "range");
  const limit = stringField(value, "limit");
  if (!key || !from) return null;
  if (source === "derived_metric" && !metricInstanceId && (!metricKey || !entityId)) return null;
  if (source === "bms" && !name && !pointId && !objectRef) return null;
  return {
    key,
    source,
    from,
    ...(source === "bms" && bmsSourceId ? { bms_source_id: bmsSourceId } : {}),
    ...(name ? { name } : {}),
    ...(pointId ? { point_id: pointId } : {}),
    ...(objectRef ? { object_ref: objectRef } : {}),
    ...(metricInstanceId ? { metric_instance_id: metricInstanceId } : {}),
    ...(metricKey ? { metric_key: metricKey } : {}),
    ...(entityId ? { entity_id: entityId } : {}),
    ...(to ? { to } : {}),
    ...(range ? { range } : {}),
    ...(limit ? { limit } : {}),
    ...(stringField(value, "order") === "desc" ? { order: "desc" } : { order: "asc" })
  };
}

function parseBmsDashboardLatestBatchQuery(value: unknown): BmsDashboardLatestBatchQuery | null {
  if (!isRecordValue(value)) return null;
  const key = stringField(value, "key");
  const source = dashboardDataSource(value);
  const bmsSourceId = stringFieldAny(value, ["bms_source_id", "bmsSourceId", "source_id", "sourceId"]);
  const name = stringField(value, "name");
  const pointId = stringField(value, "point_id") ?? stringField(value, "pointId");
  const objectRef = stringField(value, "object_ref") ?? stringField(value, "objectRef");
  const metricInstanceId = stringFieldAny(value, ["metric_instance_id", "metricInstanceId", "instance_id", "instanceId"]);
  const metricKey = stringFieldAny(value, ["metric_key", "metricKey"]);
  const entityId = stringFieldAny(value, ["entity_id", "entityId"]);
  if (!key) return null;
  if (source === "derived_metric" && !metricInstanceId && (!metricKey || !entityId)) return null;
  if (source === "bms" && !name && !pointId && !objectRef) return null;
  return {
    key,
    source,
    ...(source === "bms" && bmsSourceId ? { bms_source_id: bmsSourceId } : {}),
    ...(name ? { name } : {}),
    ...(pointId ? { point_id: pointId } : {}),
    ...(objectRef ? { object_ref: objectRef } : {}),
    ...(metricInstanceId ? { metric_instance_id: metricInstanceId } : {}),
    ...(metricKey ? { metric_key: metricKey } : {}),
    ...(entityId ? { entity_id: entityId } : {})
  };
}

function paramsForBmsDashboardHistoryBatchQuery(query: BmsDashboardHistoryBatchQuery): Record<string, string> {
  const params: Record<string, string> = {
    from: query.from,
    limit: String(Math.min(Math.max(1, Number.parseInt(query.limit ?? "720", 10) || 720), 20000)),
    order: query.order === "desc" ? "desc" : "asc"
  };
  if (query.name) params.name = query.name;
  if (query.point_id) params.point_id = query.point_id;
  if (query.object_ref) params.object_ref = query.object_ref;
  if (query.to) params.to = query.to;
  return params;
}

function resolveDerivedDashboardMetric(
  store: DerivedMetricStore,
  projectId: string,
  query: Pick<BmsDashboardHistoryBatchQuery | BmsDashboardLatestBatchQuery, "metric_instance_id" | "metric_key" | "entity_id">
): DerivedMetricInstance | null {
  if (query.metric_instance_id) {
    const instance = store.getInstance(query.metric_instance_id);
    return instance?.projectId === projectId ? instance : null;
  }
  if (query.metric_key && query.entity_id) {
    return store.lookup({
      projectId,
      metricKey: query.metric_key,
      entityId: query.entity_id,
      limit: 1
    })[0] ?? null;
  }
  return null;
}

function derivedMetricTimeseriesRow(instance: DerivedMetricInstance, sample: DerivedMetricSample): BmsTimeseriesRow {
  return {
    name: instance.displayName || `${instance.entityId} ${instance.metricKey}`,
    object_ref: instance.instanceId,
    ts: sample.ts,
    ...(typeof sample.valueNum === "number" ? { value_num: sample.valueNum, value: String(sample.valueNum) } : {}),
    ...(sample.valueText ? { value_text: sample.valueText, value: sample.valueText } : {}),
    quality: sample.quality,
    status: sample.status
  };
}

interface DerivedMetricDashboardLink {
  id: string;
  title: string;
  widgetCount: number;
  path: string;
}

interface DerivedMetricAsset {
  instance: DerivedMetricInstance;
  latest: DerivedMetricSample | null;
  materialization: DerivedMetricMaterialization | null;
  linkedDashboards: DerivedMetricDashboardLink[];
}

function dashboardUsesDerivedMetric(dashboard: DashboardRecord, instance: DerivedMetricInstance): boolean {
  return dashboard.widgets.some((widget) => widget.pointBindings.some((binding) => {
    if (binding.source !== "derived_metric") return false;
    if (binding.metricInstanceId && binding.metricInstanceId === instance.instanceId) return true;
    return binding.metricKey === instance.metricKey && binding.entityId === instance.entityId;
  }));
}

function linkedDashboardsForDerivedMetric(store: SeedStore, projectId: string, instance: DerivedMetricInstance, userId: string): DerivedMetricDashboardLink[] {
  return readableDashboardsForProject(store, projectId, userId)
    .filter((dashboard) => dashboardUsesDerivedMetric(dashboard, instance))
    .map((dashboard) => ({
      id: dashboard.id,
      title: dashboard.title,
      widgetCount: dashboard.widgets.length,
      path: dashboardPath(projectId, dashboard.id)
    }));
}

function derivedMetricAssetsForProject(
  store: SeedStore,
  derivedMetrics: DerivedMetricStore,
  projectId: string,
  userId: string
): DerivedMetricAsset[] {
  return derivedMetrics.listProjectMetrics(projectId).map((instance) => ({
    instance,
    latest: derivedMetrics.readLatest(instance.instanceId),
    materialization: derivedMetrics.readMaterialization(instance.instanceId),
    linkedDashboards: linkedDashboardsForDerivedMetric(store, projectId, instance, userId)
  }));
}

function inferredMaterializerKind(instance: DerivedMetricInstance, materialization: DerivedMetricMaterialization): DerivedMetricFormulaKind | null {
  if (materialization.formulaKind === "ratio" || materialization.formulaKind === "difference" || materialization.formulaKind === "fdd_rule") {
    return materialization.formulaKind;
  }
  const formula = instance.formula.toLowerCase();
  if (formula.includes("/") || formula.includes("ratio")) return "ratio";
  if (formula.includes("-") || formula.includes("difference") || formula.includes("delta")) return "difference";
  return null;
}

function materializerInvalidPolicy(materialization: DerivedMetricMaterialization): DerivedMetricInvalidValuePolicy {
  return materialization.invalidValuePolicy === "zero" ? "zero" : "null";
}

function materializerNumericValueFromRow(row: BmsTimeseriesRow): number | null {
  if (typeof row.value_num === "number" && Number.isFinite(row.value_num)) {
    return row.value_num;
  }
  const raw = String(row.value ?? row.value_text ?? "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[_-]+/gu, " ").trim();
  const statusValueByText: Record<string, number> = {
    active: 1,
    enabled: 1,
    enable: 1,
    on: 1,
    open: 1,
    proven: 1,
    proof: 1,
    run: 1,
    running: 1,
    true: 1,
    yes: 1,
    inactive: 0,
    disabled: 0,
    disable: 0,
    off: 0,
    closed: 0,
    false: 0,
    no: 0,
    stop: 0,
    stopped: 0
  };
  const statusValue = statusValueByText[normalized];
  if (typeof statusValue === "number") return statusValue;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function materializerSeriesFromRows(rows: BmsTimeseriesRow[]): Map<string, number> {
  const series = new Map<string, number>();
  for (const row of rows) {
    const value = materializerNumericValueFromRow(row);
    if (typeof value === "number" && Number.isFinite(value)) {
      series.set(row.ts, value);
    }
  }
  return series;
}

function materializerSeriesFromSamples(samples: DerivedMetricSample[]): Map<string, number> {
  const series = new Map<string, number>();
  for (const sample of samples) {
    if (typeof sample.valueNum === "number" && Number.isFinite(sample.valueNum)) {
      series.set(sample.ts, sample.valueNum);
    }
  }
  return series;
}

function materializerFallbackValue(policy: DerivedMetricInvalidValuePolicy): { valueNum?: number; valueText?: string; status: string } {
  return policy === "zero"
    ? { valueNum: 0, status: "fallback_zero" }
    : { valueText: "N/A", status: "not_calculable" };
}

const FDD_DEFAULT_BACKFILL_SECONDS = 30 * 24 * 60 * 60;
const FDD_DEFAULT_INTERVAL_SECONDS = 5 * 60;
const FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS = 15 * 60;
const FDD_MATERIALIZER_MIN_QUERY_LIMIT = 240;
const FDD_MATERIALIZER_MAX_QUERY_LIMIT = 20_000;
const FDD_MATERIALIZER_LIMIT_SAMPLE_PERIOD_SECONDS = 30;
const FDD_MATERIALIZER_MAX_QUERY_PAGES = 10_000;
const FDD_STATE_LOOKBACK_PAGE_SIZE = 200;
const FDD_STATE_LOOKBACK_MAX_PAGES = 1_000;
const BMS_DASHBOARD_HISTORY_BATCH_CONCURRENCY = 8;
const BMS_DASHBOARD_POINT_CACHE_TTL_MS = 10 * 60_000;
const BMS_DASHBOARD_POINT_CACHE_MAX_ENTRIES = 2048;

const bmsDashboardPointIdCache = new Map<string, { savedAt: number; pointId: string }>();

function fddMaterializerWindowSeconds(instance: DerivedMetricInstance): number {
  const parameters = Array.isArray(instance.metadata?.fddParameters)
    ? instance.metadata.fddParameters.filter(isRecordValue)
    : [];
  const windowParameter = parameters.find((parameter) => parameter.key === "window_minutes");
  const rawWindowMinutes = windowParameter?.value;
  const windowMinutes = typeof rawWindowMinutes === "number" && Number.isFinite(rawWindowMinutes)
    ? Math.max(0, rawWindowMinutes)
    : 30;
  return Math.ceil(windowMinutes * 60);
}

function fddMaterializerReadWindow(
  instance: DerivedMetricInstance,
  materialization: DerivedMetricMaterialization,
  toMs: number
): { from: string; to: string; limit: number; incremental: boolean; watermarkMs?: number } {
  const alignmentToleranceSeconds = materialization.alignmentToleranceSeconds ?? FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS;
  const replaySeconds = Math.max(
    materialization.intervalSeconds * 2,
    alignmentToleranceSeconds * 2,
    fddMaterializerWindowSeconds(instance) + alignmentToleranceSeconds * 2
  );
  const parsedWatermarkMs = materialization.watermarkTs ? Date.parse(materialization.watermarkTs) : NaN;
  const hasUsableWatermark = Number.isFinite(parsedWatermarkMs) && parsedWatermarkMs <= toMs;
  // Replaying before the watermark makes an inclusive/exclusive `from`
  // boundary harmless and reconstructs persistence/edge state deterministically.
  // When the service was stopped, the interval from the old watermark through
  // `toMs` is retained, so the downtime gap is caught up rather than skipped.
  const fromMs = hasUsableWatermark
    ? Math.max(0, parsedWatermarkMs - replaySeconds * 1000)
    : Math.max(0, toMs - materialization.lookbackSeconds * 1000);
  const effectiveWindowSeconds = Math.max(1, Math.ceil((toMs - fromMs) / 1000));
  const limit = Math.min(
    FDD_MATERIALIZER_MAX_QUERY_LIMIT,
    Math.max(
      FDD_MATERIALIZER_MIN_QUERY_LIMIT,
      Math.ceil(effectiveWindowSeconds / FDD_MATERIALIZER_LIMIT_SAMPLE_PERIOD_SECONDS) + 1
    )
  );
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    limit,
    incremental: hasUsableWatermark,
    ...(hasUsableWatermark ? { watermarkMs: parsedWatermarkMs } : {})
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function rememberBmsDashboardPointId(key: string, pointId: string): void {
  bmsDashboardPointIdCache.set(key, { savedAt: Date.now(), pointId });
  while (bmsDashboardPointIdCache.size > BMS_DASHBOARD_POINT_CACHE_MAX_ENTRIES) {
    const oldestKey = bmsDashboardPointIdCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    bmsDashboardPointIdCache.delete(oldestKey);
  }
}

async function resolveBmsDashboardPointId(
  baseUrl: string,
  query: BmsDashboardHistoryBatchQuery,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<string | undefined> {
  if (query.point_id) return query.point_id;
  const lookupKind = query.name ? "name" : query.object_ref ? "object_ref" : null;
  const lookupValue = query.name ?? query.object_ref;
  if (!lookupKind || !lookupValue) return undefined;

  const cacheKey = `${lookupKind}:${lookupValue}`;
  const cached = bmsDashboardPointIdCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < BMS_DASHBOARD_POINT_CACHE_TTL_MS) {
    return cached.pointId;
  }
  if (cached) {
    bmsDashboardPointIdCache.delete(cacheKey);
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/points?${new URLSearchParams({ q: lookupValue, limit: "20" }).toString()}`;
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return undefined;
    const payload = await response.json() as { items?: Array<{ id?: unknown; name?: unknown; object_ref?: unknown }> };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const match = items.find((item) => lookupKind === "name" ? item.name === lookupValue : item.object_ref === lookupValue);
    const rawId = match?.id;
    const pointId = typeof rawId === "number" || typeof rawId === "string" ? String(rawId) : undefined;
    if (!pointId) return undefined;
    rememberBmsDashboardPointId(cacheKey, pointId);
    return pointId;
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    return undefined;
  }
}

async function transcribeAudioViaParaformer(apiKey: string, _model: string, audioBuffer: Buffer): Promise<string> {
  // Strip WAV header (44 bytes) to get raw PCM data
  // Standard WAV: RIFF(4) + fileSize(4) + WAVE(4) + fmt chunk(24) + data hdr(8) + PCM
  let pcmData: Buffer | undefined;
  if (audioBuffer.length > 44 && audioBuffer.readUInt32BE(0) === 0x52494646 /* "RIFF" */) {
    // Find "data" chunk — start at byte 12 (after RIFF/WAVE header)
    let offset = 12;
    while (offset < audioBuffer.length - 8) {
      const chunkId = audioBuffer.readUInt32BE(offset);
      const chunkSize = audioBuffer.readUInt32LE(offset + 4);
      if (chunkId === 0x64617461 /* "data" */) {
        pcmData = audioBuffer.subarray(offset + 8, offset + 8 + chunkSize);
        break;
      }
      offset += 8 + chunkSize;
    }
  }
  if (!pcmData || pcmData.length === 0) {
    throw new Error('Failed to extract PCM data from audio');
  }

  console.log(`[STT] PCM data size: ${pcmData.length} bytes (${(pcmData.length / 32000).toFixed(1)}s at 16kHz)`);

  const wsUrl = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

  return new Promise((resolve, reject) => {
    const taskId = `stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let fullText = '';
    let finished = false;

    const ws = new WSWebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    const timeout = setTimeout(() => {
      if (!finished) {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Transcription timeout'));
      }
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header: {
          action: 'run-task',
          task_id: taskId,
          streaming: 'duplex'
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: 'paraformer-realtime-v2',
          parameters: {
            format: 'pcm',
            sample_rate: 16000,
            language_hints: ['yue', 'zh', 'en']
          },
          input: {}
        }
      }));
    });

    ws.on('message', (rawData: unknown) => {
      const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer);
      try {
        const msg = JSON.parse(data.toString());
        const event = msg.header?.event;

        if (event === 'task-started') {
          console.log('[STT] WebSocket task started:', taskId);
          // Send PCM in ~100ms chunks (3200 bytes at 16kHz 16-bit mono)
          const chunkSize = 3200;
          for (let i = 0; i < pcmData.length; i += chunkSize) {
            const chunk = pcmData.subarray(i, Math.min(i + chunkSize, pcmData.length));
          ws.send(chunk as Buffer);
          }
          // Signal end of audio stream
          ws.send(JSON.stringify({
            header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
            payload: { input: {} }
          }));
        } else if (event === 'result-generated') {
          const text = msg.payload?.output?.sentence?.text;
          if (text) fullText = text;
        } else if (event === 'task-finished') {
          finished = true;
          clearTimeout(timeout);
          console.log('[STT] WebSocket transcription result:', fullText);
          ws.close(1000);
          resolve(fullText.trim());
        } else if (event === 'task-failed') {
          finished = true;
          clearTimeout(timeout);
          const errMsg = msg.payload?.output?.message || msg.payload?.message || 'Recognition failed';
          ws.close();
          reject(new Error(errMsg));
        }
      } catch {
        // Binary frames or unparseable messages — ignore
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(new Error(`STT WebSocket error: ${err.message}`));
    });

    ws.on('close', () => {
      if (!finished) {
        clearTimeout(timeout);
        reject(new Error('STT connection closed unexpectedly'));
      }
    });
  });
}


function restoreSequences(store: SeedStore): void {
  let maxMsg = 0;
  let maxConv = 0;
  for (const messages of Object.values(store.messagesByProject ?? {})) {
    for (const m of messages) {
      const match = /^msg_(\d+)$/.exec(m.id);
      if (match) maxMsg = Math.max(maxMsg, Number(match[1]!));
    }
  }
  for (const conversations of Object.values(store.conversationsByProject ?? {})) {
    for (const c of conversations) {
      const match = /^conv_(\d+)$/.exec(c.id);
      if (match) maxConv = Math.max(maxConv, Number(match[1]!));
      for (const messageId of c.messageIds) {
        const msgMatch = /^msg_(\d+)$/.exec(messageId);
        if (msgMatch) maxMsg = Math.max(maxMsg, Number(msgMatch[1]!));
      }
    }
  }
  messageSequence = maxMsg;
  conversationSequence = maxConv;
}

/** Re-insert message rows missing from store.json but still present in the session SQLite index. */
function repairMissingConversationMessages(
  store: SeedStore,
  projectId: string,
  conversation: Conversation,
  sessionIndex: SessionSearchIndex,
  defaultUserId: string
): boolean {
  const pool = store.messagesByProject[projectId] ?? [];
  const byId = new Map(pool.map((message) => [message.id, message]));
  const repaired: ChatMessage[] = [];

  for (const messageId of conversation.messageIds) {
    if (byId.has(messageId)) continue;
    const recovered = sessionIndex.getMessageById(messageId);
    if (!recovered || recovered.conversationId !== conversation.id) continue;
    const message: ChatMessage = {
      id: messageId,
      projectId,
      userId: defaultUserId,
      role: recovered.role,
      content: recovered.content
    };
    pool.push(message);
    byId.set(messageId, message);
    repaired.push(message);
  }

  if (repaired.length === 0) {
    return false;
  }

  store.messagesByProject[projectId] = pool;
  return true;
}

function bounded<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

function boundedPlaceholderList<T>(items: T[], store: SeedStore): T[] {
  return bounded(items, store.maxListSize);
}

function isReply(value: unknown): value is FastifyReply {
  return typeof value === "object" && value !== null && "sent" in value;
}

function validateChatMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const message = (body as ChatBody).message;
  if (typeof message !== "string") {
    return null;
  }

  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 1000) {
    return null;
  }

  return trimmed;
}

/**
 * Cap project message pool size without deleting messages still linked from any conversation.
 * Previously we trimmed the shared array from the front, which orphaned early conversation messageIds.
 */
function trimProjectMessages(store: SeedStore, projectId: string, limit: number): void {
  const messages = store.messagesByProject[projectId];
  if (!messages || messages.length <= limit) {
    return;
  }

  const referenced = new Set(
    (store.conversationsByProject[projectId] ?? []).flatMap((conversation) => conversation.messageIds)
  );
  const protectedMessages = messages.filter((message) => referenced.has(message.id));
  const unprotected = messages.filter((message) => !referenced.has(message.id));
  const unprotectedBudget = Math.max(0, limit - protectedMessages.length);
  const keptUnprotected = unprotected.slice(-unprotectedBudget);
  const keptIds = new Set([...protectedMessages, ...keptUnprotected].map((message) => message.id));
  store.messagesByProject[projectId] = messages.filter((message) => keptIds.has(message.id));
}

function providerDiagnostics(provider: ProviderMetadata, fallbackUsed: boolean): ProviderMetadata & { fallbackUsed: boolean } {
  return {
    id: provider.id,
    mode: provider.mode,
    model: provider.model,
    ...(provider.fallbackReason ? { fallbackReason: provider.fallbackReason } : {}),
    ...(provider.status ? { status: provider.status } : {}),
    fallbackUsed
  };
}

function fddAttributionProviderFailure(error: unknown): { code: string; status?: number; responseDetail?: string } {
  const diagnostic = redactedProviderError(error);
  return {
    code: diagnostic.code,
    ...(diagnostic.status !== undefined ? { status: diagnostic.status } : {}),
    ...(diagnostic.responseDetail ? { responseDetail: diagnostic.responseDetail } : {})
  };
}

function chatHistoryForProvider(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }));
}

async function buildAgentTurnInputs(params: {
  projectId: string;
  conversation: Conversation;
  projectMessages: ChatMessage[];
  store: SeedStore;
}): Promise<{
  conversationMessages: ChatMessage[];
  knowledgeBaseDocuments: KnowledgeBaseDocument[];
  repositoryArtifacts: RepositoryArtifact[];
  providerMessages: ReturnType<typeof chatHistoryForProvider>;
}> {
  const conversationMessages = orderedConversationMessages(params.projectMessages, params.conversation);
  const projectKbRoot = kbRootForProject(params.projectId);
  const projectRepoRoot = repoRootForProject(params.projectId);
  const [knowledgeBaseDocuments, repositoryArtifacts] = await Promise.all([
    indexKnowledgeBase(params.projectId, { rootDir: projectKbRoot }),
    indexRepository(params.projectId, projectRepoRoot)
  ]);
  params.store.knowledgeBaseByProject[params.projectId] = knowledgeBaseDocuments;
  params.store.repositoryByProject[params.projectId] = repositoryArtifacts;

  return {
    conversationMessages,
    knowledgeBaseDocuments,
    repositoryArtifacts,
    providerMessages: chatHistoryForProvider(conversationMessages)
  };
}

function providerErrorCode(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.code;
  }
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "provider_unknown_error";
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function sanitizeFilename(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "upload.dat";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function tempUploadRoot(): string {
  return path.resolve(process.cwd(), "..", "..", ".temp", "bms-config");
}

function ensurePointId(point: BmsPointSummary, sourceId: string, index: number): BmsPointSummary {
  return {
    ...point,
    id: point.id?.trim() || `${sourceId}_pt_${String(index + 1).padStart(3, "0")}`,
    status: point.status || "ready",
    warnings: Array.isArray(point.warnings) ? point.warnings : []
  };
}

function createBmsMockPoint(sourceId: string): BmsPointSummary[] {
  const points: Array<[string, string, string, string, string, string, string, boolean, string]> = [
    ["CHW Supply Temperature", "mock.chw.supply_temp", "degC", "Chiller Plant", "CHW System", "Plant Room", "sensor", false, "brick:Chilled_Water_Supply_Temperature_Sensor"],
    ["CHW Return Temperature", "mock.chw.return_temp", "degC", "Chiller Plant", "CHW System", "Plant Room", "sensor", false, "brick:Chilled_Water_Return_Temperature_Sensor"],
    ["CHW Flow Rate", "mock.chw.flow_rate", "l/s", "Chiller Plant", "CHW System", "Plant Room", "sensor", false, "brick:Flow_Sensor"],
    ["Supply Air Temperature", "mock.sat", "degC", "AHU-1", "Air Handling", "Level 1", "sensor", false, "brick:Supply_Air_Temperature_Sensor"],
    ["Space Temperature", "mock.space_temp", "degC", "VAV-101", "Zone", "Level 1", "sensor", false, "brick:Zone_Air_Temperature_Sensor"],
    ["Zone CO2", "mock.zone_co2", "ppm", "VAV-101", "Zone", "Level 1", "sensor", false, "brick:CO2_Sensor"],
    ["Valve Command", "mock.valve_cmd", "%", "Chiller Plant", "Control", "Plant Room", "command", true, "brick:Valve_Position_Command"],
    ["Pump Speed", "mock.pump_speed", "%", "Chiller Plant", "Control", "Plant Room", "sensor", false, "brick:Speed_Sensor"],
    ["Fan Status", "mock.fan_status", "bool", "AHU-1", "Air Handling", "Level 1", "binary", false, "brick:Status"],
    ["Plant Pressure", "mock.plant_pressure", "kPa", "Chiller Plant", "CHW System", "Plant Room", "sensor", false, "brick:Pressure_Sensor"]
  ];
  return points.map(([point_name, vendor_point_id, unit, equipment_name, system_name, location, point_type, writable, semantic_class], index) => ({
    id: `${sourceId}_pt_${String(index + 1).padStart(3, "0")}`,
    point_name,
    vendor_point_id,
    unit,
    equipment_name,
    system_name,
    location,
    point_type,
    writable,
    semantic_class,
    status: "discovered"
  }));
}

function createBmsMockJob(points: BmsPointSummary[], payload: BmsMinimalIngestionRequest): BmsIngestionResultsResponse {
  const start = Date.parse("2026-05-15T10:00:00Z");
  return {
    job_id: `job_${payload.source_id}_${Date.now().toString(36)}`,
    series: points.map((point, index) => ({
      point_id: point.id,
      point_name: point.point_name,
      unit: point.unit,
      values: Array.from({ length: payload.sample_count }, (_, sampleIndex) => ({
        timestamp: new Date(start + sampleIndex * payload.interval_seconds * 1000).toISOString(),
        value: Number((7.1 + index * 2 + sampleIndex * 0.3).toFixed(1)),
        quality: "good" as const
      }))
    }))
  };
}

function parseDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    const next = line[index + 1] ?? "";
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseDelimitedLine(lines[0]!).map((header, index) => header || `column_${index + 1}`);
  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function inferSemanticClass(pointName: string, description: string): string {
  const text = `${pointName} ${description}`.toLowerCase();
  if (text.includes("control mode")) return "brick:Command";
  if (text.includes("temperature")) return "brick:Temperature_Sensor";
  if (text.includes("pressure")) return "brick:Pressure_Sensor";
  if (text.includes("flow")) return "brick:Flow_Sensor";
  return "brick:Point";
}

function normalizeUploadedRow(row: Record<string, string>, index: number): BmsPointSummary {
  const pointName = row.point_name?.trim() || `Point ${index + 1}`;
  const vendorPointId = row.vendor_point_id?.trim() || row.point_id?.trim() || pointName.replace(/[^a-z0-9]+/gi, ".").toLowerCase();
  const apiPath = row.api_path?.trim() || row.api_url?.trim() || null;
  const description = row.description?.trim() || "";
  return {
    id: row.id?.trim() || `row_${index + 1}`,
    point_name: pointName,
    vendor_point_id: vendorPointId,
    api_path: apiPath,
    unit: row.unit?.trim() || "",
    equipment_name: row.equipment_name?.trim() || "",
    system_name: row.system_name?.trim() || "",
    location: row.location?.trim() || "",
    point_type: row.point_type?.trim() || "sensor",
    writable: row.writable?.trim().toLowerCase() === "true",
    semantic_class: row.semantic_class?.trim() || inferSemanticClass(pointName, description),
    status: "ready",
    description,
    warnings: [],
    raw_row: row
  };
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeZipPath(baseDir: string, target: string): string {
  const segments = `${baseDir}/${target}`.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

function findZipEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("zip_eocd_not_found");
}

function unzipEntries(buffer: Buffer): Map<string, Buffer> {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Buffer>();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("zip_central_directory_corrupt");
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content: Buffer;
    if (compressionMethod === 0) {
      content = compressed;
    } else if (compressionMethod === 8) {
      content = inflateRawSync(compressed);
    } else {
      throw new Error(`zip_unsupported_compression_${compressionMethod}`);
    }
    entries.set(fileName, content);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function firstTagValue(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXmlEntities(match[1] ?? "") : null;
}

function parseWorkbookSheetPath(entries: Map<string, Buffer>): string {
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!relsXml) {
    throw new Error("xlsx_missing_workbook_relationships");
  }
  const relationshipMatches = [...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)];
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8");
  if (!workbookXml) {
    throw new Error("xlsx_missing_workbook");
  }
  const sheetMatch = workbookXml.match(/<sheet[^>]*r:id="([^"]+)"[^>]*\/>/i);
  if (!sheetMatch) {
    throw new Error("xlsx_missing_sheet");
  }
  const relId = sheetMatch[1] ?? "";
  const target = relationshipMatches.find((match) => match[1] === relId)?.[2];
  if (!target) {
    throw new Error("xlsx_missing_sheet_relationship");
  }
  return normalizeZipPath("xl", target);
}

function parseSharedStrings(entries: Map<string, Buffer>): string[] {
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8");
  if (!sharedXml) return [];
  return [...sharedXml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => {
    const xml = match[0] ?? "";
    const textParts = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXmlEntities(textMatch[1] ?? ""));
    return textParts.join("");
  });
}

function columnIndexFromReference(reference: string): number {
  const letters = (reference.match(/[A-Z]+/i)?.[0] ?? "").toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];
  return rowMatches.map((rowMatch) => {
    const rowXml = rowMatch[1] ?? "";
    const cells: string[] = [];
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? "";
      const body = cellMatch[2] ?? "";
      const refMatch = attrs.match(/\br="([^"]+)"/);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const columnIndex = refMatch ? columnIndexFromReference(refMatch[1] ?? "") : cells.length;
      while (cells.length <= columnIndex) {
        cells.push("");
      }
      let value = "";
      const type = typeMatch?.[1] ?? "";
      if (type === "inlineStr") {
        value = firstTagValue(body, "t") ?? "";
      } else {
        const rawValue = firstTagValue(body, "v") ?? "";
        if (type === "s") {
          const sharedIndex = Number.parseInt(rawValue, 10);
          value = Number.isFinite(sharedIndex) ? sharedStrings[sharedIndex] ?? "" : "";
        } else if (type === "b") {
          value = rawValue === "1" ? "true" : "false";
        } else {
          value = rawValue;
        }
      }
      cells[columnIndex] = value.trim();
    }
    return cells;
  }).filter((row) => row.some((cell) => cell !== ""));
}

function parseXlsxRows(buffer: Buffer): Array<Record<string, string>> {
  const entries = unzipEntries(buffer);
  const sheetPath = parseWorkbookSheetPath(entries);
  const sheetXml = entries.get(sheetPath)?.toString("utf8");
  if (!sheetXml) {
    throw new Error("xlsx_missing_sheet_xml");
  }
  const rows = parseSheetRows(sheetXml, parseSharedStrings(entries));
  if (rows.length === 0) return [];
  const rawHeaders = rows[0] ?? [];
  const headers = rawHeaders.map((header, index) => header || `column_${index + 1}`);
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => value.trim() !== ""));
}

function warningsForFileExtension(fileName: string): string[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xls")) {
    return ["Legacy .xls preview is not supported yet. Please upload the file as .xlsx or .csv for a real preview."];
  }
  return [];
}

function previewRowsFromBuffer(fileName: string, buffer: Buffer): ParsedPreviewData {
  const lower = fileName.toLowerCase();
  const warnings = warningsForFileExtension(fileName);
  let rows: Array<Record<string, string>> = [];
  if (lower.endsWith(".csv")) {
    rows = parseCsvRows(buffer.toString("utf8"));
  } else if (lower.endsWith(".xlsx")) {
    rows = parseXlsxRows(buffer);
  } else if (lower.endsWith(".xls")) {
    rows = [];
  } else {
    rows = parseCsvRows(buffer.toString("utf8"));
  }
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const points = rows.slice(0, 25).map((row, index) => normalizeUploadedRow(row, index));
  return {
    headers,
    rows: rows.slice(0, 10),
    points,
    rowCount: rows.length,
    ...(warnings.length > 0 ? { warnings } : {})
  };
}

async function proxyBms(
  env: ProviderEnv,
  fetchImpl: FetchLike,
  path: string,
  init: RequestInit = {}
): Promise<{ statusCode: number; payload: unknown }> {
  const base = env.BMS_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    return { statusCode: 503, payload: { error: { code: "bms_unavailable", message: "BMS service unavailable." } } };
  }
  const response = await fetchImpl(new URL(path, `${base}/`).toString(), init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    try {
      payload = await response.text();
    } catch {
      payload = null;
    }
  }
  return { statusCode: response.status, payload };
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const store = options.store ?? (options.persist ? (loadStoreSync() ?? createSeedStore()) : createSeedStore());
  ensureStoreDashboardsByProject(store);
  restoreDashboardSequence(store);
  ensureStoreSkillsByProject(store);
  ensureStoreProjectGrounding(store);
  restoreGroundingSequence(store);
  ensureStoreProjectFeedback(store);
  restoreFeedbackSequence(store);
  ensureStoreMemoryProposals(store);
  restoreMemoryProposalSequence(store);
  const fddLibraryChangedOnBoot = ensureStoreFddLibrary(store);
  const fddFleetTemplatesChangedOnBoot = ensureStoreFddFleetTemplates(store);
  const fddFleetGuardRolloutsChangedOnBoot = ensureStoreFddFleetGuardRollouts(store);
  const persistStore = options.persist === true;
  const persistSoon = (): void => {
    if (persistStore) {
      scheduleSave(store);
    }
  };
  const persistNow = (): void => {
    if (persistStore) {
      saveStoreSync(store);
    }
  };
  if (fddLibraryChangedOnBoot || fddFleetTemplatesChangedOnBoot || fddFleetGuardRolloutsChangedOnBoot) {
    persistNow();
  }
  const env = options.env ?? process.env;
  // Ensure .env is loaded even when buildServer is called directly (not via index.ts)
  if (!options.env) tryLoadEnv();
  const providerResolver =
    options.resolveChatProvider ??
    ((providerEnv: ProviderEnv) => resolveChatProvider(providerEnv, options.fetch ? { fetch: options.fetch } : {}));
  const allowProviderFallback = shouldAllowProviderFallback(env, options.allowProviderFallback);
  messageSequence = 0;
  conversationSequence = 0;
  restoreSequences(store);

  const provider = options.chatProvider ?? providerResolver(env);
  const fddBindingProposerConfig = fddBindingProposerConfigFromEnv(env);
  const fddFleetGuardGlobalConfig = fddFleetGuardGlobalConfigFromEnv(env);
  const fddBindingProposerShadow = new FddBindingProposerShadowService({
    config: fddBindingProposerConfig,
    completionPort: createFddBindingProposerCompletionPort(provider),
    auditSink: new ProjectFddBindingProposerAuditStore(store, persistSoon, {
      projectExists: (projectId) => store.projects.some((project) => project.id === projectId)
    })
  });
  const fddFleetTemplates = createFddFleetTemplateBindings(store, { onChange: persistSoon });
  const fddFleetGuardRollouts = createFddFleetGuardRolloutBindings(store, { onChange: persistSoon });
  const fetchProxy = options.fetch ?? fetch;
  const fddHistoryProbeCache = new Map<string, { expiresAt: number; promise: Promise<number | undefined> }>();
  const fddCatalogQueryCache = new Map<string, { expiresAt: number; promise: Promise<Record<string, unknown>[]> }>();
  interface FddEvidenceReadContext {
    allowSharedCache: boolean;
    catalog: Map<string, Promise<Record<string, unknown>[]>>;
    history: Map<string, Promise<number | undefined>>;
  }
  const createFddEvidenceReadContext = (allowSharedCache: boolean): FddEvidenceReadContext => ({
    allowSharedCache,
    catalog: new Map(),
    history: new Map()
  });
  const automaticFddCheckRuns = new Map<string, Promise<void>>();
  const fddTaskAuthorizationRefreshRuns = new Map<string, Promise<boolean>>();
  const fddFleetGuardRuntimeAuthorizationRuns = new Map<string, Promise<boolean>>();
  const derivedMetricMaterializationRuns = new Map<string, Promise<void>>();
  const memory = new AgentMemoryStore(dataRoot(env));
  memory.start();
  const sessionIndex = new SessionSearchIndex(dataRoot(env));
  sessionIndex.rebuildFromStore(store);
  const embeddingProvider = createEmbeddingProvider(env, fetchProxy);
  const groundingRuleIndex = new GroundingRuleIndex(dataRoot(env), embeddingProvider);
  groundingRuleIndex.rebuildFromStore(store);
  const derivedMetrics = new DerivedMetricStore(dataRoot(env));
  const fddDashboardMigrations = migrateStoreFddAttributionDashboards(store, derivedMetrics);
  if (fddDashboardMigrations > 0) {
    persistNow();
  }
  const skills = createGenericSkillRegistry();
  const projectSkillBindings = createProjectSkillBindings(store, persistSoon);
  const projectGroundingBindings = createProjectGroundingBindings(store, persistSoon, {
    onRuleSaved: (rule) => groundingRuleIndex.upsertRule(rule)
  });
  const projectFeedbackBindings = createProjectFeedbackBindings(store, projectGroundingBindings, persistSoon);
  const projectMemoryProposalBindings = createProjectMemoryProposalBindings(store, persistSoon);

  // Structured JSON logging with file rotation (before scheduler so callbacks can use it)
  const logDir = dataRoot(env);
  const structuredLogger = new StructuredLogger({ dir: logDir, maxFileBytes: 5 * 1024 * 1024 });
  const useMockBmsClient = parseBooleanEnv(env.USE_MOCK_BMS_CLIENT);
  const bmsBaseUrl = env.BMS_API_BASE_URL ?? "";
  const elementBmsBridge = env.BMS_DATABASE_API_URL?.trim()
    ? new BmsDatabaseBridge({
      baseUrl: env.BMS_DATABASE_API_URL.trim(),
      ...(env.ELEMENT_ENTELI_BASE_URL?.trim() ? { enteliBaseUrl: env.ELEMENT_ENTELI_BASE_URL.trim() } : {})
    })
    : null;
  if (elementBmsBridge) {
    elementBmsBridge.seedElementSource(ELEMENT_BMS_PROJECT_ID);
  }
  const bmsSources = new Map<string, BmsSourceState>();
  const bmsJobs = new Map<string, BmsJobState>();
  let bmsSourceSequence = 0;
  let bmsJobSequence = 0;

  const nextBmsSourceId = (): string => {
    bmsSourceSequence += 1;
    return `src_${String(bmsSourceSequence).padStart(3, "0")}`;
  };

  const nextBmsJobId = (): string => {
    bmsJobSequence += 1;
    return `job_${String(bmsJobSequence).padStart(3, "0")}`;
  };

  const mockSourceById = (sourceId: string): BmsSourceState => {
    const source = bmsSources.get(sourceId);
    if (!source) {
      throw new Error("bms_source_not_found");
    }
    return source;
  };

  const isElementBmsProject = (projectId: string): boolean =>
    projectId === ELEMENT_BMS_PROJECT_ID && elementBmsBridge !== null;

  const projectBmsSources = (projectId: string): BmsSourceSummary[] => [
    ...(elementBmsBridge?.listSources(projectId) ?? []),
    ...[...bmsSources.values()]
      .map((entry) => entry.source)
      .filter((source) => source.project_id === projectId)
  ];

  const configuredBmsCollectorBaseUrl = (source: BmsSourceSummary): string => {
    const config = source.config ?? {};
    const fromConfig = [
      config.bms_database_api,
      config.bms_database_api_url,
      config.collector_base_url,
      config.collectorBaseUrl
    ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (fromConfig) return fromConfig.trim().replace(/\/+$/, "");
    if (
      (source.vendor_type === "bms_database" || source.protocol_type === "bms_database" || source.protocol_type === "bms_database_api")
      && source.base_url?.trim()
    ) {
      return source.base_url.trim().replace(/\/+$/, "");
    }
    return "";
  };

  const resolveProjectBmsAccess = (projectId: string, options: { sourceId?: string } = {}): ProjectBmsAccessResult => {
    const sources = projectBmsSources(projectId);
    const scopedSources = options.sourceId
      ? sources.filter((source) => source.source_id === options.sourceId)
      : sources;
    if (sources.length === 0 || scopedSources.length === 0) {
      return {
        ok: false,
        projectId,
        ...(options.sourceId ? { sourceId: options.sourceId } : {}),
        error: BMS_SOURCE_NOT_CONFIGURED,
        message: BMS_SOURCE_NOT_CONFIGURED_MESSAGE
      };
    }
    const source = scopedSources.find((candidate) => configuredBmsCollectorBaseUrl(candidate)) ?? scopedSources[0]!;
    const baseUrl = configuredBmsCollectorBaseUrl(source);
    if (!baseUrl) {
      return {
        ok: false,
        projectId,
        sourceId: source.source_id,
        error: BMS_SOURCE_UNAVAILABLE,
        message: BMS_SOURCE_UNAVAILABLE_MESSAGE
      };
    }
    return {
      ok: true,
      projectId,
      sourceId: source.source_id,
      sourceName: source.name,
      baseUrl
    };
  };

  const sendProjectBmsAccessError = (
    request: FastifyRequest,
    reply: FastifyReply,
    access: ProjectBmsAccessError
  ): FastifyReply => sendError(
    request,
    reply,
    access.error === BMS_SOURCE_NOT_CONFIGURED ? 404 : 503,
    access.error,
    access.message
  );

  const resolveBmsSourceProjectId = (sourceId: string): string => {
    if (elementBmsBridge) {
      try {
        return elementBmsBridge.getSource(sourceId).project_id;
      } catch {
        // fall through to mock map
      }
    }
    return mockSourceById(sourceId).source.project_id;
  };

  // Scheduler for reminders/cronjobs
  const schedulerDataDir = dataRoot(env);
  const scheduler = new SchedulerService(schedulerDataDir);
  scheduler.setOnFired((job) => {
    structuredLogger.info("scheduler_job_fired", {
      component: "scheduler",
      projectId: job.projectId,
      jobId: job.jobId,
      jobMessage: job.message
    });

    const msgs = store.messagesByProject[job.projectId] ?? [];
    const assistantMsg: ChatMessage = {
      id: nextMessageId(),
      projectId: job.projectId,
      userId: job.userId,
      role: "assistant",
      content: `${job.message} ✓`
    };
    msgs.push(assistantMsg);

    // If conversationId is set, add to that conversation
    if (job.conversationId) {
      const conversations = store.conversationsByProject[job.projectId] ?? [];
      const conv = conversations.find((c) => c.id === job.conversationId);
      if (conv) {
        conv.messageIds.push(assistantMsg.id);
      }
    }
    store.messagesByProject[job.projectId] = msgs;
    persistSoon();

    // Broadcast via WebSocket for real-time delivery
    broadcastToProject(job.projectId, {
      type: "reminder_fired",
      message: assistantMsg,
      jobId: job.jobId
    });
  });
  scheduler.start();

  // Log when a job is scheduled
  scheduler.onScheduled = (job) => {
    structuredLogger.info("scheduler_job_scheduled", {
      component: "scheduler",
      projectId: job.projectId,
      jobId: job.jobId,
      jobMessage: job.message,
      triggerAt: new Date(job.triggerAt).toISOString()
    });
  };

  const processRegistry = new ProcessRegistry();
  const tools = createGenericToolRegistry(
    memory,
    scheduler,
    processRegistry,
    skills,
    projectSkillBindings,
    projectGroundingBindings,
    projectFeedbackBindings,
    sessionIndex,
    projectMemoryProposalBindings,
    derivedMetrics,
    resolveProjectBmsAccess
  );
  tools.enableLogging(dataRoot(env));
  const agentRuntime = new AgentRuntime({
    memory,
    tools,
    skills,
    resolveProjectSkillIds: (projectId) => projectSkillBindings.getSkillIds(projectId),
    projectGrounding: projectGroundingBindings,
    projectFeedback: projectFeedbackBindings,
    groundingRuleIndex,
    onCaptureFeedback: (input) => {
      const episodeInput = {
        projectId: input.projectId,
        conversationId: input.conversationId,
        messages: input.messages,
        userCorrection: input.userCorrection
      };
      if (input.errorType) {
        return captureFeedbackEpisode(store, { ...episodeInput, errorType: input.errorType }, persistSoon);
      }
      return captureFeedbackEpisode(store, episodeInput, persistSoon);
    },
    dashboardOps: {
      create: (input, request) => {
        const dashboard = createDashboardRecord(
          {
            ...input,
            sourceConversationId: input.sourceConversationId ?? request.conversationId
          },
          request.projectId,
          request.userId
        );
        const projectDashboards = store.dashboardsByProject[request.projectId] ?? [];
        projectDashboards.unshift(dashboard);
        store.dashboardsByProject[request.projectId] = sortedDashboards(projectDashboards);
        persistSoon();
        broadcastToProject(request.projectId, {
          type: "dashboard_created",
          projectId: request.projectId,
          dashboard
        });
        return dashboard;
      }
    }
  });

  const app = Fastify({
    logger: {
      level: "info",
      formatters: {
        level(label) {
          return { level: label };
        }
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`
    },
    genReqId: (() => {
      let sequence = 0;
      return () => {
        sequence += 1;
        return `req_${String(sequence).padStart(6, "0")}`;
      };
    })(),
    bodyLimit: 10485760 // 10MB for audio uploads
  });

  // Register raw body parser for audio/* content types
  app.addContentTypeParser(/^audio\/.*/, { parseAs: "buffer" }, (req, body, done) => {
    done(null, body);
  });

  // WebSocket connection tracking per project
  const wsConnections = new Map<string, Set<WSWebSocket>>();
  const dashboardSubscriptions = new Map<string, Map<WSWebSocket, Set<string>>>();
  const dashboardPollers = new Map<string, ReturnType<typeof setInterval>>();
  const dashboardLastValues = new Map<string, Map<string, string>>();
  const activeChatStreams = new Map<string, ActiveChatStreamSnapshot>();

  function broadcastToProject(projectId: string, data: Record<string, unknown>): void {
    const sockets = wsConnections.get(projectId);
    if (!sockets || sockets.size === 0) return;
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      if (ws.readyState === WSWebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function activeChatStreamKey(projectId: string, conversationId: string): string {
    return `${projectId}:${conversationId}`;
  }

  function publicActiveChatStream(snapshot: ActiveChatStreamSnapshot): ActiveChatStreamSnapshot {
    return {
      ...snapshot,
      userMessage: { ...snapshot.userMessage },
      assistantMessage: { ...snapshot.assistantMessage },
      activities: snapshot.activities.map((activity) => ({ ...activity }))
    };
  }

  function broadcastActiveChatStream(snapshot: ActiveChatStreamSnapshot): void {
    broadcastToProject(snapshot.projectId, {
      type: "chat_stream_updated",
      projectId: snapshot.projectId,
      conversationId: snapshot.conversationId,
      requestId: snapshot.requestId,
      stream: publicActiveChatStream(snapshot)
    });
  }

  function finishActiveChatStream(projectId: string, conversationId: string, requestId: string): void {
    const key = activeChatStreamKey(projectId, conversationId);
    const snapshot = activeChatStreams.get(key);
    if (!snapshot || snapshot.requestId !== requestId) return;
    activeChatStreams.delete(key);
    broadcastToProject(projectId, {
      type: "chat_stream_finished",
      projectId,
      conversationId,
      requestId
    });
  }

  function ensureProjectFddCollections(projectId: string): void {
    store.fddTasksByProject ??= {};
    store.fddChecksByProject ??= {};
    store.fddLibraryCheckRunsByProject ??= {};
    store.fddBindingProposalAuditsByProject ??= {};
    store.fddFleetTemplateVersionsByProject ??= {};
    store.fddFleetTemplateAuditByProject ??= {};
    store.fddTasksByProject[projectId] ??= [];
    store.fddChecksByProject[projectId] ??= [];
    store.fddLibraryCheckRunsByProject[projectId] ??= [];
    store.fddBindingProposalAuditsByProject[projectId] ??= [];
    store.fddFleetTemplateVersionsByProject[projectId] ??= [];
    store.fddFleetTemplateAuditByProject[projectId] ??= [];
  }

  function fddProjectDataSignature(projectId: string): string {
    const groundingSignature = (projectGroundingBindings.list(projectId) ?? [])
      .filter((rule) => rule.status !== "rejected")
      .map((rule) => `${rule.id}:${rule.createdAt}:${rule.status ?? "active"}`)
      .sort()
      .join(",");
    const bmsSignature = projectBmsSources(projectId)
      .map((source) => [
        source.vendor_type,
        source.protocol_type,
        configuredBmsCollectorBaseUrl(source) || "no-catalog",
        source.read_only ? "read-only" : "writable"
      ].join(":"))
      .sort()
      .join(",");
    return `project:${projectId}:bms-catalog:v29:project-bms-sources:${bmsSignature || "no-bms-source"}:${groundingSignature}`;
  }

  const FDD_DEPLOYABILITY_SKILL_ID = "skill_fdd_deployability_check";

  interface BuildingGptFddSkillContext {
    skillIds: string[];
    memory: {
      userEntries: number;
      projectEntries: number;
    };
    groundingRules: ProjectGroundingRule[];
    groundingDiagnostics?: GroundingRetrievalDiagnostics;
    kbDocuments: string[];
    excludedEntityKeys: string[];
  }

  function fddGroundingRetrievalPrompt(algorithm: FddAlgorithm): string {
    const inputs = algorithm.requiredPoints
      .map((point) => `${point.slot}: ${point.label} (${point.quantityKind}) ${point.semantic}`)
      .join("; ");
    return [
      "BuildingGPT FDD deployability check",
      algorithm.name,
      algorithm.equipmentType,
      algorithm.categoryLabel,
      algorithm.faultType,
      algorithm.method,
      algorithm.formula,
      algorithm.logicSummary,
      inputs,
      "entity alias point mapping formula unit dimension running status motor power energy grounding"
    ].filter(Boolean).join("\n");
  }

  function fddGroundingRuleSnapshot(rule: ProjectGroundingRule): NonNullable<FddCheckAgentWorkflow["groundingRules"]>[number] {
    return {
      id: rule.id,
      ...(rule.name ? { name: rule.name } : {}),
      source: rule.source,
      content: rule.content.slice(0, 600)
    };
  }

  function fddEntityExclusionsFromGrounding(rules: ProjectGroundingRule[], context: FddEntityContext): string[] {
    const excluded = new Set<string>();
    for (const rule of rules) {
      const text = `${rule.name ?? ""} ${rule.content ?? ""} ${rule.action ?? ""} ${rule.trigger ?? ""}`.trim();
      if (!/(?:\bexclude\b|excluded|do not include|不要纳入|不纳入|排除)/iu.test(text)) continue;
      const normalizedText = normalizeFddEntityAlias(text);
      for (const [alias, canonical] of context.aliasToCanonical.entries()) {
        if (alias.length >= 3 && normalizedText.includes(alias)) {
          excluded.add(canonicalFddEntityKey(canonical, context));
        }
      }
    }
    return [...excluded].sort();
  }

  async function buildBuildingGptFddSkillContext(
    projectId: string,
    userId: string,
    algorithm: FddAlgorithm,
    entityContext: FddEntityContext
  ): Promise<BuildingGptFddSkillContext> {
    const skillIds = projectSkillBindings.getSkillIds(projectId);
    const memoryBlocks = memory.getPromptBlocks(projectId, userId, `fdd:${algorithm.algorithmKey}`);
    const allGroundingRules = projectGroundingBindings.list(projectId);
    const retrieval = await retrieveGroundingRules(
      groundingRuleIndex,
      projectId,
      fddGroundingRetrievalPrompt(algorithm),
      allGroundingRules
    );
    const groundingRules = selectGroundingForTurn(allGroundingRules, retrieval);
    return {
      skillIds,
      memory: {
        userEntries: memoryBlocks.userEntryCount,
        projectEntries: memoryBlocks.projectEntryCount
      },
      groundingRules,
      groundingDiagnostics: retrieval.diagnostics,
      kbDocuments: entityContext.sourceDocuments,
      excludedEntityKeys: fddEntityExclusionsFromGrounding(groundingRules, entityContext)
    };
  }

  function fddDeployabilityAgentWorkflow(
    context: BuildingGptFddSkillContext,
    availability?: FddEquipmentAvailability
  ): FddCheckAgentWorkflow {
    const skill = skills.get(FDD_DEPLOYABILITY_SKILL_ID);
    const groundingRuleNames = context.groundingRules
      .map((rule) => rule.name ?? rule.id)
      .slice(0, 4)
      .join(", ");
    return {
      agentId: "buildinggpt",
      skillId: FDD_DEPLOYABILITY_SKILL_ID,
      skillName: skill?.name ?? "FDD Deployability Check",
      mode: "deterministic_core",
      kbDocuments: context.kbDocuments,
      skillIds: context.skillIds,
      memory: context.memory,
      groundingRules: context.groundingRules.map(fddGroundingRuleSnapshot),
      steps: [
        "BuildingGPT runtime selected the FDD deployability skill and loaded project skill hints.",
        `Loaded curated memory context (${context.memory.userEntries} user, ${context.memory.projectEntries} project entries).`,
        context.groundingRules.length > 0
          ? `Retrieved project grounding context (${context.groundingRules.length} rule${context.groundingRules.length === 1 ? "" : "s"}): ${groundingRuleNames}.`
          : "No project grounding rules matched this FDD check.",
        context.excludedEntityKeys.length > 0
          ? `Applied grounding entity exclusions: ${context.excludedEntityKeys.join(", ")}.`
          : "No grounding entity exclusions applied.",
        "Read the project Brick model and Knowledge Base catalog before evaluating algorithm inputs.",
        availability
          ? `Resolved target equipment availability as ${availability.status} (${availability.entityCount} entities).`
          : "Resolved target equipment availability from project evidence.",
        availability?.status === "available"
          ? "Matched Brick point classes to formula roles, verified exact labels in the BMS catalog, and used metadata queries only as fallback."
          : "Skipped formula point matching and history queries because target equipment availability was not confirmed.",
        availability?.status === "available"
          ? "Grouped candidates by canonical entity, selected one example entity for review, and listed all complete deployable entities."
          : "Returned an equipment-level applicability result without fabricating missing point evidence.",
        availability?.status === "available"
          ? "Validated required inputs by quantity kind, unit dimension, history requirement, and ambiguity rules."
          : "Did not evaluate point or history coverage for a non-applicable algorithm.",
        "Persisted a structured can_deploy/uncertain/cannot_deploy result for this project and algorithm version."
      ]
    };
  }

  type FddEntityEquipmentType = FddEquipmentType | "unknown";

  interface FddEntityHint {
    canonicalKey: string;
    equipmentType: FddEntityEquipmentType;
    aliases: string[];
    hlPrefix?: string;
    plantPrefix?: string;
    pmPrefix?: string;
  }

  interface FddEntityContext {
    aliasToCanonical: Map<string, string>;
    equipmentTypeByCanonical: Map<string, FddEntityEquipmentType>;
    hintsByCanonical: Map<string, FddEntityHint>;
    searchTermsByQuantityKind: Map<FddQuantityKind, string[]>;
    kbTextByPointName: Map<string, string>;
    kbClassByPointName: Map<string, string>;
    brickPoints: FddBrickPointFact[];
    brickEquipment: FddBrickEquipmentFact[];
    brickEquipmentKeysByType: Map<FddEquipmentType, Set<string>>;
    inventoryEvidenceSources: Set<string>;
    authoritativeInventory: boolean;
    sourceDocuments: string[];
  }

  interface FddBrickPointFact {
    subjectKey: string;
    pointName: string;
    entityKey: string;
    brickClass: string;
    unit?: string;
  }

  interface FddBrickEquipmentFact {
    entityKey: string;
    equipmentType: FddEquipmentType;
    brickClass: string;
  }

  function createEmptyFddEntityContext(): FddEntityContext {
    return {
      aliasToCanonical: new Map(),
      equipmentTypeByCanonical: new Map(),
      hintsByCanonical: new Map(),
      searchTermsByQuantityKind: new Map(),
      kbTextByPointName: new Map(),
      kbClassByPointName: new Map(),
      brickPoints: [],
      brickEquipment: [],
      brickEquipmentKeysByType: new Map(),
      inventoryEvidenceSources: new Set(),
      authoritativeInventory: false,
      sourceDocuments: []
    };
  }

  function normalizeFddEntityAlias(value: string): string {
    return value.trim().toUpperCase();
  }

  function addFddEntityHint(context: FddEntityContext, hint: FddEntityHint): void {
    const canonical = hint.canonicalKey;
    const canonicalKey = normalizeFddEntityAlias(canonical);
    const existing = context.hintsByCanonical.get(canonicalKey);
    const aliases = [...new Set([canonical, ...hint.aliases, ...(existing?.aliases ?? [])].filter(Boolean))];
    context.hintsByCanonical.set(canonicalKey, {
      ...existing,
      ...hint,
      canonicalKey: canonical,
      aliases
    });
    context.equipmentTypeByCanonical.set(canonicalKey, hint.equipmentType);
    for (const alias of aliases) {
      const normalized = normalizeFddEntityAlias(alias);
      if (normalized) {
        if (!context.aliasToCanonical.has(normalized) || context.aliasToCanonical.get(normalized) === canonical) {
          context.aliasToCanonical.set(normalized, canonical);
        }
      }
    }
  }

  function fddCleanKbIdentifier(value: string | undefined): string | null {
    const cleaned = (value ?? "")
      .replace(/\*\*/gu, "")
      .replace(/`/gu, "")
      .replace(/[{}]/gu, "")
      .replace(/\betc\.?$/iu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/(?:[_-]?\*)+$/u, "")
      .replace(/[.,;:]+$/u, "");
    if (!cleaned || cleaned.length < 2) return null;
    if (/[{}…]/u.test(value ?? "")) return null;
    return cleaned;
  }

  function fddKbIdentifiersFromText(value: string): string[] {
    const ids = new Set<string>();
    for (const match of value.matchAll(/`([^`]{2,100})`/gu)) {
      const cleaned = fddCleanKbIdentifier(match[1]);
      if (cleaned) ids.add(cleaned);
    }
    const unquotedParts = value
      .replace(/`[^`]+`/gu, " ")
      .split(/(?:\s+\/\s+|,|\s+or\s+|\s+and\s+)/iu);
    for (const part of unquotedParts) {
      const cleaned = fddCleanKbIdentifier(part);
      if (cleaned && /^[A-Z][A-Z0-9_-]*[A-Z0-9](?:[_-][A-Z0-9]+)*$/u.test(cleaned)) {
        ids.add(cleaned);
      }
    }
    return [...ids];
  }

  function fddLooksLikeEntityIdentifier(value: string): boolean {
    const normalized = value.replace(/[_-]\*$/u, "");
    const parts = normalized.split(/[_-]/u).filter(Boolean);
    if (parts.length === 0 || parts.length > 4) return false;
    if (/(?:KW|KWH|TEMP|STATUS|ALARM|FLOW|COP|DELTA|PRESS|CURRENT|VOLT|AMP|HZ|KVA|KVAR|PF|RT|TALM|AMS|CHWST|CHWRT|CHWFWR|CHWFWS)$/iu.test(parts.at(-1) ?? "")) {
      return false;
    }
    return parts.some((part) => /\d/u.test(part));
  }

  function inferFddEquipmentTypeFromKbText(text: string): FddEntityEquipmentType {
    const normalized = text.replace(/[-_]/gu, " ").toLowerCase();
    if (/\b(chiller|wcc|冷机|制冷机)\b/u.test(normalized)) return "chiller";
    if (/\b(pump|chp|swp|pmp|泵)\b/u.test(normalized)) return "pump";
    if (/\b(cooling tower|ct)\b|冷却塔/u.test(normalized)) return "cooling_tower";
    if (/\b(ahu|air handling(?: unit)?)\b/u.test(normalized)) return "ahu";
    if (/\b(fcu|fan coil(?: unit)?)\b/u.test(normalized)) return "fcu";
    if (/\b(vav|variable air volume(?: box)?)\b|变风量/u.test(normalized)) return "vav";
    return "unknown";
  }

  function fddEquipmentTypeFromBrickClass(brickClass: string): FddEntityEquipmentType {
    if (/(?:^|_)Chiller$/u.test(brickClass)) return "chiller";
    if (/(?:^|_)Pump$/u.test(brickClass)) return "pump";
    if (/(?:^|_)Cooling_Tower$/u.test(brickClass)) return "cooling_tower";
    if (/^(?:AHU|Air_Handling_Unit)$/u.test(brickClass)) return "ahu";
    if (/^(?:FCU|Fan_Coil_Unit)$/u.test(brickClass)) return "fcu";
    if (/^(?:VAV|Variable_Air_Volume_Box)$/u.test(brickClass)) return "vav";
    return "unknown";
  }

  function registerFddFactsFromBrickModel(context: FddEntityContext, ttl: string): void {
    for (const fact of parseMinimalBrickFacts(ttl)) {
      const equipmentType = fddEquipmentTypeFromBrickClass(fact.brickClass);
      if (equipmentType !== "unknown") {
        addFddEntityHint(context, {
          canonicalKey: fact.subjectKey,
          equipmentType,
          aliases: [fact.subjectKey]
        });
        const existing = context.brickEquipmentKeysByType.get(equipmentType) ?? new Set<string>();
        existing.add(fact.subjectKey);
        context.brickEquipmentKeysByType.set(equipmentType, existing);
        context.brickEquipment.push({
          entityKey: fact.subjectKey,
          equipmentType,
          brickClass: fact.brickClass
        });
        continue;
      }
      if (!fact.parentEntityKey) continue;
      const pointName = fact.label || fact.subjectKey;
      context.brickPoints.push({
        subjectKey: fact.subjectKey,
        pointName,
        entityKey: fact.parentEntityKey,
        brickClass: fact.brickClass,
        ...(fact.unit ? { unit: fact.unit } : {})
      });
      context.kbClassByPointName.set(normalizeFddEntityAlias(pointName), fact.brickClass);
    }
  }

  function splitMarkdownTableRow(line: string): string[] {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
    return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  }

  function isMarkdownSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/u.test(cell.trim()));
  }

  async function fddKnowledgeBaseDocuments(projectId: string): Promise<KnowledgeBaseDocument[]> {
    store.knowledgeBaseByProject ??= {};
    const existing = store.knowledgeBaseByProject[projectId];
    if (existing && existing.length > 0) {
      return existing;
    }
    const rootDir = kbRootForProject(projectId, env);
    const documents = await indexKnowledgeBase(projectId, { rootDir });
    store.knowledgeBaseByProject[projectId] = documents;
    return documents;
  }

  async function readFddKbCatalogSummary(projectId: string): Promise<{ path: string; text: string } | null> {
    const documents = await fddKnowledgeBaseDocuments(projectId);
    const summary = documents.find((document) => path.basename(document.path) === "KB_CATALOG_SUMMARY.md");
    if (!summary) return null;
    try {
      const rootDir = kbRootForProject(projectId, env);
      return {
        path: summary.path,
        text: await readFile(path.join(rootDir, summary.path), "utf8")
      };
    } catch {
      return null;
    }
  }

  async function readFddBrickModel(projectId: string): Promise<{ path: string; text: string } | null> {
    const documents = await fddKnowledgeBaseDocuments(projectId);
    const model = documents.find((document) => path.basename(document.path) === "brick_model.ttl");
    if (!model) return null;
    try {
      const rootDir = kbRootForProject(projectId, env);
      return {
        path: model.path,
        text: await readFile(path.join(rootDir, model.path), "utf8")
      };
    } catch {
      return null;
    }
  }

  function registerFddEntityHintsFromKbTables(context: FddEntityContext, summaryText: string): void {
    const lines = summaryText.split(/\r?\n/u);
    let heading = "";
    let tableHeader: string[] = [];
    let sectionLabel = "";
    for (const line of lines) {
      if (!line.trim()) {
        tableHeader = [];
        continue;
      }
      const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(line.trim());
      if (headingMatch?.[2]) {
        heading = headingMatch[2];
        tableHeader = [];
        continue;
      }
      const boldLabel = /^\*\*([^*]+):\*\*/u.exec(line.trim());
      if (boldLabel?.[1]) {
        sectionLabel = boldLabel[1];
      }
      const cells = splitMarkdownTableRow(line);
      if (cells.length === 0) continue;
      if (isMarkdownSeparatorRow(cells)) continue;
      if (tableHeader.length === 0) {
        tableHeader = cells;
        continue;
      }
      const headerText = tableHeader.join(" ");
      if (!/equipment|parent|entity|alias|prefix/iu.test(headerText)) continue;
      const rowText = `${heading} ${sectionLabel} ${tableHeader.join(" ")} ${cells.join(" ")}`;
      const firstCellIds = fddKbIdentifiersFromText(cells[0] ?? "").filter(fddLooksLikeEntityIdentifier);
      const prefixIds = cells
        .slice(1)
        .flatMap((cell) => fddKbIdentifiersFromText(cell))
        .filter(fddLooksLikeEntityIdentifier);
      if (firstCellIds.length === 0) continue;
      const canonicalKey = firstCellIds[0];
      if (!canonicalKey) continue;
      const aliases = [...new Set([...firstCellIds, ...prefixIds])];
      addFddEntityHint(context, {
        canonicalKey,
        equipmentType: inferFddEquipmentTypeFromKbText(rowText),
        aliases
      });
    }
  }

  function registerFddEntityHintsFromKbHeadings(context: FddEntityContext, summaryText: string): void {
    const lines = summaryText.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const headingMatch = /^#{2,6}\s+(.+)$/u.exec(lines[index]?.trim() ?? "");
      if (!headingMatch?.[1]) continue;
      const heading = headingMatch[1];
      const ids = fddKbIdentifiersFromText(heading).filter(fddLooksLikeEntityIdentifier);
      if (ids.length === 0) continue;
      const snippet = lines.slice(index, Math.min(lines.length, index + 4)).join(" ");
      for (const id of ids) {
        addFddEntityHint(context, {
          canonicalKey: id,
          equipmentType: inferFddEquipmentTypeFromKbText(snippet),
          aliases: [id]
        });
      }
    }
  }

  function addFddKbSearchTerm(context: FddEntityContext, quantityKind: FddQuantityKind, term: string): void {
    const normalized = term.trim();
    if (!normalized || normalized.length < 2) return;
    const existing = context.searchTermsByQuantityKind.get(quantityKind) ?? [];
    if (!existing.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
      context.searchTermsByQuantityKind.set(quantityKind, [...existing, normalized]);
    }
  }

  function registerFddKbSearchTerms(context: FddEntityContext, summaryText: string): void {
    const lines = summaryText.split(/\r?\n/u);
    for (const line of lines) {
      const lower = line.toLowerCase();
      const cells = splitMarkdownTableRow(line);
      const backtickTerms = [...line.matchAll(/`([^`]{1,80})`/gu)]
        .map((match) => match[1]?.trim())
        .filter((term): term is string => Boolean(term));
      const tableTerms = line.split("|")
        .map((cell) => cell.trim())
        .filter((cell) => /^[A-Z][A-Z0-9_-]*[A-Z0-9](?:[_-][A-Z0-9]+)+$/u.test(cell));
      const terms = [...new Set([...backtickTerms, ...tableTerms])];
      if (terms.length === 0) continue;
      for (const term of terms) {
        if (/[_-]/u.test(term)) {
          const previous = context.kbTextByPointName.get(normalizeFddEntityAlias(term));
          context.kbTextByPointName.set(normalizeFddEntityAlias(term), previous ? `${previous}\n${line}` : line);
          const termCellIndex = cells.findIndex((cell) => normalizeFddEntityAlias(cell.replace(/`/gu, "")) === normalizeFddEntityAlias(term));
          const classCell = termCellIndex >= 0
            ? cells.slice(termCellIndex + 1).find((cell) => /(?:_Sensor|_Status|_Command|_Setpoint|^Status$|^Alarm$|Power|Energy|Temperature|Flow|Pressure|Humidity|Position|Speed|Demand)/u.test(cell))
            : undefined;
          if (classCell) {
            context.kbClassByPointName.set(normalizeFddEntityAlias(term), classCell.replace(/`/gu, "").trim());
          }
        }
        const normalized = term.replace(/[{}]/gu, "");
        if (/\bcooling\b|\bload\b|冷量/u.test(lower)) {
          if (/(?:^|[_-])q$/iu.test(normalized) || /(?:^|[_-])q(?:[_-]|$)/iu.test(normalized)) {
            addFddKbSearchTerm(context, "load", normalized.includes("{") ? "Q" : term);
            addFddKbSearchTerm(context, "load", "_Q");
          }
        }
        if (/\bpower\b|\bmotor\b|\bkilowatt\b|\bkw\b|功率/u.test(lower)) {
          if (/kw|kilowatt|power|watt/iu.test(normalized) && !/kwh|kilowatt[\s-]?hour/iu.test(normalized)) {
            const suffix = normalized.split(/[-_]/u).filter(Boolean).at(-1);
            addFddKbSearchTerm(context, "power", suffix ?? term);
          }
        }
      }
    }
  }

  async function buildFddEntityContext(projectId: string): Promise<FddEntityContext> {
    const context = createEmptyFddEntityContext();
    let inventoryDeclaredComplete = false;
    const summary = await readFddKbCatalogSummary(projectId);
    if (summary) {
      context.sourceDocuments.push(summary.path);
      context.inventoryEvidenceSources.add(summary.path);
      inventoryDeclaredComplete = fddKbSummaryHasCompleteEquipmentInventory(summary.text);
      registerFddEntityHintsFromKbTables(context, summary.text);
      registerFddEntityHintsFromKbHeadings(context, summary.text);
      registerFddKbSearchTerms(context, summary.text);
    }
    const brickModel = await readFddBrickModel(projectId);
    if (brickModel) {
      if (!context.sourceDocuments.includes(brickModel.path)) context.sourceDocuments.push(brickModel.path);
      context.inventoryEvidenceSources.add(brickModel.path);
      registerFddFactsFromBrickModel(context, brickModel.text);
    }
    context.authoritativeInventory = inventoryDeclaredComplete && context.brickEquipment.length > 0;
    return context;
  }

  function buildFddEntityContextSync(projectId: string): FddEntityContext {
    const context = createEmptyFddEntityContext();
    let inventoryDeclaredComplete = false;
    const rootDir = kbRootForProject(projectId, env);
    try {
      const summaryText = readFileSync(path.join(rootDir, "KB_CATALOG_SUMMARY.md"), "utf8");
      inventoryDeclaredComplete = fddKbSummaryHasCompleteEquipmentInventory(summaryText);
      registerFddEntityHintsFromKbTables(context, summaryText);
      registerFddEntityHintsFromKbHeadings(context, summaryText);
      registerFddKbSearchTerms(context, summaryText);
    } catch {
      // Missing KB evidence intentionally yields an unknown inventory.
    }
    try {
      registerFddFactsFromBrickModel(context, readFileSync(path.join(rootDir, "brick_model.ttl"), "utf8"));
    } catch {
      // Missing Brick evidence intentionally yields an unknown inventory.
    }
    context.authoritativeInventory = inventoryDeclaredComplete && context.brickEquipment.length > 0;
    return context;
  }

  const FDD_PHYSICAL_EQUIPMENT_TYPES: readonly FddEquipmentType[] = [
    "chiller",
    "pump",
    "cooling_tower",
    "ahu",
    "fcu",
    "vav"
  ];

  function fddEquipmentAvailabilityFromContext(context: FddEntityContext): FddEquipmentAvailability[] {
    const hasBrickInventory = context.brickEquipmentKeysByType.size > 0;
    const evidenceSources = [...context.inventoryEvidenceSources].sort();
    return FDD_PHYSICAL_EQUIPMENT_TYPES.map((equipmentType) => {
      const entityKeys = hasBrickInventory
        ? [...(context.brickEquipmentKeysByType.get(equipmentType) ?? new Set<string>())]
        : [...context.hintsByCanonical.values()]
          .filter((hint) => hint.equipmentType === equipmentType)
          .map((hint) => hint.canonicalKey);
      const uniqueEntityKeys = [...new Set(entityKeys.map((key) => canonicalFddEntityKey(key, context)))]
        .sort((left, right) => left.localeCompare(right));
      if (uniqueEntityKeys.length > 0) {
        return {
          equipmentType,
          status: "available",
          entityCount: uniqueEntityKeys.length,
          entityKeys: uniqueEntityKeys,
          reason: `The project equipment inventory contains ${uniqueEntityKeys.length} ${equipmentType} entit${uniqueEntityKeys.length === 1 ? "y" : "ies"}.`,
          evidenceSources
        };
      }
      if (context.authoritativeInventory) {
        return {
          equipmentType,
          status: "not_available",
          entityCount: 0,
          entityKeys: [],
          reason: `The authoritative project equipment inventory contains no ${equipmentType} entities.`,
          evidenceSources
        };
      }
      return {
        equipmentType,
        status: "unknown",
        entityCount: 0,
        entityKeys: [],
        reason: `No authoritative project equipment inventory is currently available for ${equipmentType}.`,
        evidenceSources
      };
    });
  }

  function fddEquipmentInventorySignature(context: FddEntityContext, availability: FddEquipmentAvailability[]): string {
    return fddInventoryEvidenceSignature({
      authoritativeInventory: context.authoritativeInventory,
      availability,
      equipment: context.brickEquipment,
      points: context.brickPoints.map((point) => ({
        subjectKey: point.subjectKey,
        pointName: point.pointName,
        parentEntityKey: point.entityKey,
        brickClass: point.brickClass,
        ...(point.unit ? { unit: point.unit } : {})
      }))
    });
  }

  function currentFddEquipmentInventorySignatureSync(projectId: string): string {
    const context = buildFddEntityContextSync(projectId);
    return fddEquipmentInventorySignature(context, fddEquipmentAvailabilityFromContext(context));
  }

  function fddAvailabilityForAlgorithm(
    algorithm: FddAlgorithm,
    availability: FddEquipmentAvailability[]
  ): FddEquipmentAvailability {
    const targetType = fddTargetEntityType(algorithm);
    if (targetType) {
      return availability.find((entry) => entry.equipmentType === targetType) ?? {
        equipmentType: targetType,
        status: "unknown",
        entityCount: 0,
        entityKeys: [],
        reason: `Equipment availability is unknown for ${targetType}.`
      };
    }
    return {
      equipmentType: algorithm.equipmentType,
      status: "unknown",
      entityCount: 0,
      entityKeys: [],
      reason: "The algorithm does not identify a physical target equipment type."
    };
  }

  function canonicalFddEntityKey(rawEntityKey: string, context: FddEntityContext): string {
    const normalized = normalizeFddEntityAlias(rawEntityKey);
    const fromContext = context.aliasToCanonical.get(normalized);
    if (fromContext) return fromContext;
    return normalized;
  }

  function fddCandidateText(item: Record<string, unknown>): string {
    return [
      item.name,
      item.point_name,
      item.object_ref,
      item.equipment_name,
      item.system_name,
      item.semantic_class,
      item.kb_class,
      item.unit,
      item.description,
      item.kb_text
    ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  }

  function fddCandidateSemanticText(item: Record<string, unknown>): string {
    return [
      item.semantic_class,
      item.brick_class,
      item.kb_class
    ].filter((value): value is string => typeof value === "string").join(" ").replace(/[-_]/gu, " ").toLowerCase();
  }

  function fddCandidateDescriptionText(item: Record<string, unknown>): string {
    return [
      item.description,
      item.equipment_name,
      item.system_name
    ].filter((value): value is string => typeof value === "string").join(" ").replace(/[-_]/gu, " ").toLowerCase();
  }

  function fddPointName(item: Record<string, unknown>): string | null {
    for (const key of ["name", "point_name", "pointName"]) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  }

  function fddPointUnit(item: Record<string, unknown>): string | undefined {
    const value = item.unit;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function fddPointObjectRef(item: Record<string, unknown>): string | undefined {
    const value = item.object_ref ?? item.objectRef;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function rawFddCandidateEntityKey(pointName: string, context?: FddEntityContext): string | undefined {
    const normalized = pointName.trim();
    if (context) {
      const normalizedPointName = normalizeFddEntityAlias(normalized);
      const matchingAlias = [...context.aliasToCanonical.keys()]
        .filter((alias) => normalizedPointName === alias || normalizedPointName.startsWith(`${alias}_`) || normalizedPointName.startsWith(`${alias}-`))
        .sort((left, right) => right.length - left.length)[0];
      if (matchingAlias) {
        return context.aliasToCanonical.get(matchingAlias);
      }
    }
    const dashMatch = /^(?<entity>[A-Za-z]+-[A-Za-z0-9]+-[A-Za-z]?\d{1,3})(?:[-_].*)?$/u.exec(normalized);
    if (dashMatch?.groups?.entity) return dashMatch.groups.entity.toUpperCase();
    const multiUnderscoreMatch = /^(?<entity>[A-Za-z]+_[A-Za-z0-9]+_\d{1,3})(?:[_-].*)?$/u.exec(normalized);
    if (multiUnderscoreMatch?.groups?.entity) return multiUnderscoreMatch.groups.entity.toUpperCase();
    const underscoreMatch = /^(?<entity>[A-Za-z]+_\d+)(?:[_-].*)?$/u.exec(normalized);
    if (underscoreMatch?.groups?.entity) return underscoreMatch.groups.entity.toUpperCase();
    return undefined;
  }

  function fddCandidateEntityKey(pointName: string, context: FddEntityContext): string | undefined {
    const rawEntityKey = rawFddCandidateEntityKey(pointName, context);
    return rawEntityKey ? canonicalFddEntityKey(rawEntityKey, context) : undefined;
  }

  function fddTargetEntityType(algorithm: FddAlgorithm): FddEquipmentType | undefined {
    if (algorithm.equipmentType !== "sensor") {
      return algorithm.equipmentType;
    }
    const text = algorithm.requiredPoints
      .map((point) => `${point.slot} ${point.label} ${point.semantic}`)
      .join(" ")
      .toLowerCase();
    if (/\b(chiller|chw|chilled water)\b/u.test(text)) return "chiller";
    if (/\bpump\b/u.test(text)) return "pump";
    return undefined;
  }

  function fddEntityAllowedForAlgorithm(entityKey: string | undefined, context: FddEntityContext, algorithm: FddAlgorithm): boolean {
    const targetType = fddTargetEntityType(algorithm);
    if (!targetType || !entityKey) return true;
    const canonical = canonicalFddEntityKey(entityKey, context);
    const entityType = context.equipmentTypeByCanonical.get(normalizeFddEntityAlias(canonical));
    const hasKnownTargetEntities = [...context.equipmentTypeByCanonical.values()].some((type) => type === targetType);
    if (!entityType || entityType === "unknown") return !hasKnownTargetEntities;
    return entityType === targetType;
  }

  function fddCandidateConfidence(point: FddAlgorithm["requiredPoints"][number], item: Record<string, unknown>, query: string): number {
    const text = fddCandidateText(item);
    const pointName = fddPointName(item)?.toLowerCase();
    const exactKeywordMatch = Boolean(pointName && point.keywords?.some((keyword) => keyword.trim().toLowerCase() === pointName));
    const exactQueryMatch = Boolean(pointName && query.trim().toLowerCase() === pointName);
    if (exactKeywordMatch || exactQueryMatch) {
      return 0.98;
    }
    const keywords = [point.label, point.semantic, ...(point.keywords ?? []), query]
      .flatMap((entry) => entry.toLowerCase().split(/[^a-z0-9]+/u))
      .filter((entry) => entry.length >= 3);
    const uniqueKeywords = [...new Set(keywords)];
    const hits = uniqueKeywords.filter((keyword) => text.includes(keyword)).length;
    const semanticWords = point.semantic.toLowerCase().split(/[^a-z0-9]+/u).filter((entry) => entry.length >= 3);
    const semanticHits = semanticWords.filter((keyword) => text.includes(keyword)).length;
    let score = Math.min(0.96, 0.48 + hits * 0.08 + semanticHits * 0.04);
    const normalizedName = pointName ?? "";
    const slotText = `${point.slot} ${point.label} ${point.semantic}`.toLowerCase();
    const normalizedText = `${normalizedName} ${text}`.replace(/[-_]/gu, " ");
    const actualKind = inferFddCandidateQuantityKind(item, fddPointName(item) ?? "");
    if (actualKind === point.quantityKind) score += 0.12;
    if (actualKind !== "unknown" && point.quantityKind !== "unknown" && actualKind !== point.quantityKind) score -= 0.28;
    if (slotText.includes("status")) {
      if (/\b(run status|on off status|flow status|proof|start stop|power status)\b/iu.test(normalizedText)) score += 0.08;
      if (slotText.includes("chiller status") && /\bon off status\b/iu.test(normalizedText)) score += 0.06;
      if (/\b(acb|breaker|trip|alarm|fault)\b/iu.test(normalizedText)) score -= 0.08;
    }
    if (slotText.includes("flow status") && /\bflow status\b|\bflow proof\b/iu.test(normalizedText)) score += 0.08;
    if (slotText.includes("flow rate") && /\bflowrate\b|\bflow rate\b/iu.test(normalizedText)) score += 0.08;
    if (slotText.includes("supply") && /\bsupply\b/iu.test(normalizedText)) score += 0.08;
    if (slotText.includes("return") && /\breturn\b/iu.test(normalizedText)) score += 0.08;
    if (/\b(chw|chilled water)\b/u.test(slotText)) {
      if (/\b(chw|chilled water)\b|chw(?:st|rt|fws|fwr)/iu.test(normalizedText)) score += 0.08;
      if (/\b(condenser water)\b/iu.test(normalizedText)
        || (/\bcw(?:st|rt|fws|fwr)\b/iu.test(normalizedText) && !/chw(?:st|rt|fws|fwr)|\bchw\b/iu.test(normalizedText))) {
        score -= 0.45;
      }
    }
    if (slotText.includes("cooling load") && /\bcooling load\b|\bcooling output\b/iu.test(normalizedText)) score += 0.12;
    if (point.quantityKind === "load") {
      if (/(?:^|[-_])q$/iu.test(normalizedName) || /\bwater cooling load\b|\bcooling output\b/iu.test(normalizedText)) score += 0.06;
      if (/\benergy cooling load\b|\benergy\b/iu.test(normalizedText)) score -= 0.08;
    }
    if (/\b(cw|condenser water)\b/u.test(slotText)) {
      if (/\b(cw|condenser water)\b|\bcw(?:st|rt|fws|fwr)/iu.test(normalizedText)) score += 0.08;
      if (/\b(chw|chilled water)\b/iu.test(normalizedText)
        || (/\bchw(?:st|rt|fws|fwr)\b/iu.test(normalizedText) && !/\bcw(?:st|rt|fws|fwr)|\bcw\b/iu.test(normalizedText))) {
        score -= 0.45;
      }
    }
    if (point.quantityKind === "current" && /\b(current|amps?|amperes?|amperage)\b|(?:^|\s)a(?:\s|$)/iu.test(normalizedText)) score += 0.12;
    if (slotText.includes("power") && /\bmotor kilowatts\b|\belectric power\b|\belectrical power\b|\bpower\b/iu.test(normalizedText)) score += 0.1;
    if (point.quantityKind === "power" && /\b(percent|percentage|demand limit)\b|%/iu.test(normalizedText)) score -= 0.24;
    return Math.max(0, Math.min(0.99, score));
  }

  function inferFddCandidateQuantityKind(item: Record<string, unknown>, pointName: string): FddQuantityKind {
    const unit = fddPointUnit(item) ?? "";
    const semanticText = fddCandidateSemanticText(item);
    if (semanticText) {
      if (/kwh|kilowatt hour|\benergy\b|consumption|accumulated/u.test(semanticText)) return "energy";
      if (/cooling demand|cooling load|cooling output|refrigeration/u.test(semanticText)) return "load";
      if (/\b(flow|flow rate)\b/u.test(semanticText)) return "flow_rate";
      if (/\btemp|temperature|chwst|chwrt/u.test(semanticText)) return "temperature";
      if (/\bpressure|delta p|differential pressure|\bdp\b/u.test(semanticText)) return "pressure";
      if (/\bhumidity|humid|rh\b/u.test(semanticText)) return "humidity";
      if (/\b(level|water level|height)\b/u.test(semanticText)) return "level";
      if (/\b(co2|carbon dioxide|concentration|ppm|ppb)\b/u.test(semanticText)) return "concentration";
      if (/\b(position|damper|valve)\b/u.test(semanticText)) return "position";
      if (/\b(speed|rpm|frequency)\b/u.test(semanticText)) return "speed";
      if (/\b(status|alarm|binary|boolean|on off|start stop|command|proof|enable|trip|relay)\b/u.test(semanticText)) return "status";
      if (/\b(current|amps?|amperes?|amperage)\b/u.test(semanticText)) return "current";
      if (/\b(power|kilowatt|watt|electric|motor)\b/u.test(semanticText)) return "power";
    }

    const nameUnitText = `${pointName} ${unit}`.replace(/[-_]/gu, " ").toLowerCase();
    if (/kwh|kw-?h|kilowatt[\s-]?hour/u.test(nameUnitText)) return "energy";
    if (/\b(current|amps?|amperes?|amperage)\b/u.test(nameUnitText) || /^a$/iu.test(unit.trim())) return "current";
    if (/kw(?!h)|\b(kilowatt|watt)\b/u.test(nameUnitText) && !/kwh|kw-?h|kilowatt[\s-]?hour/u.test(nameUnitText)) return "power";
    if (/\b(chwst|chwrt|temp|temperature)\b/u.test(nameUnitText) || /^[cf]$/iu.test(unit.trim())) return "temperature";
    if (/\b(flow|flowrate|gpm|l\/s|m3\/h|m³\/h|cfm)\b/u.test(nameUnitText)) return "flow_rate";
    if (/\b(status|proof|enable|enabled|on[\/\s-]?off|boolean|bool|binary|alarm|trip|fault)\b/u.test(nameUnitText)) return "status";

    const text = `${pointName} ${fddCandidateDescriptionText(item)} ${unit}`.replace(/[-_]/gu, " ").toLowerCase();
    if (/kwh|kw-?h|kilowatt[\s-]?hour|\b(energy|consumption|accumulated)\b/u.test(text)) return "energy";
    const statusPhrase = /\b(power status|run status|flow status|status proof|power proof|flow proof|start stop|relay|command|alarm|trip|fault|boolean|binary|on[\/\s-]?off)\b/u.test(text);
    if (statusPhrase) return "status";
    const strongStatusLike = /\b(status|proof|enable|enabled|on[\/\s-]?off|commanded on|boolean|bool|binary|alarm|trip|fault)\b/u.test(text);
    if (strongStatusLike) return "status";
    if (/\b(current|amps?|amperes?|amperage)\b/u.test(text) || /^a$/iu.test(unit.trim())) return "current";
    const powerLike = /kw(?!h)|\b(kilowatt|watt|electric|electrical|power|motor)\b/u.test(text)
      && !/kwh|kw-?h|kilowatt[\s-]?hour/u.test(text);
    if (powerLike) return "power";
    if (/\b(load|cooling output|cooling capacity|cooling demand|cooling demand sensor|refrigeration ton|tons?|rt)\b/u.test(text)) return "load";
    if (/\b(temp|temperature|chwst|chwrt|sat|mat|oat|rat|degf|degc|fahrenheit|celsius)\b/u.test(text) || /^[cf]$/iu.test(unit.trim())) return "temperature";
    if (/\b(flow|flowrate|flow rate|gpm|l\/s|m3\/h|m³\/h|cfm)\b/u.test(text)) return "flow_rate";
    if (/\b(pressure|delta p|differential pressure|\bdp\b|pa|kpa|psi|inh2o)\b/u.test(text)) return "pressure";
    if (/\b(humidity|humid|rh|g\/kg)\b/u.test(text)) return "humidity";
    if (/\b(level|water level|basin height)\b/u.test(text)) return "level";
    if (/\b(co2|carbon dioxide|concentration|ppm|ppb)\b/u.test(text)) return "concentration";
    if (/\b(damper|valve|position|percent|command|%)\b/u.test(text)) return "position";
    if (/\b(speed|rpm|hz|frequency)\b/u.test(text)) return "speed";
    if (/\b(running|run)\b/u.test(text)) return "status";
    if (powerLike) return "power";
    return "unknown";
  }

  function fddUnitCompatibility(
    point: FddAlgorithm["requiredPoints"][number],
    item: Record<string, unknown>,
    pointName: string,
    allowStructuralMetadataOverride = false
  ): { unitCompatibility: FddUnitCompatibility; dimensionReason: string; rejectionReason?: string } {
    const actualKind = inferFddCandidateQuantityKind(item, pointName);
    const expectedKind = point.quantityKind ?? "unknown";
    const unit = fddPointUnit(item);
    const acceptedStructuralUnit = Boolean(
      unit
      && point.acceptableUnits?.length
      && fddEngineeringUnitIsAccepted(unit, point.acceptableUnits)
      && inferFddCandidateQuantityKind({ unit }, "") === expectedKind
    );
    if (expectedKind === "unknown" || actualKind === "unknown") {
      return {
        unitCompatibility: "unknown",
        dimensionReason: `Expected ${expectedKind}; catalog metadata ${unit ? `unit ${unit}` : "has no decisive unit"} gives ${actualKind}.`
      };
    }
    if (actualKind === expectedKind) {
      const acceptableUnitText = point.acceptableUnits?.length ? ` Acceptable units: ${point.acceptableUnits.join(", ")}.` : "";
      if (point.acceptableUnits?.length && !unit) {
        return {
          unitCompatibility: "unknown",
          dimensionReason: `Formula input expects ${expectedKind}, and Brick/catalog semantics indicate ${actualKind}, but the engineering unit is unknown.${acceptableUnitText}`
        };
      }
      if (unit && point.acceptableUnits?.length && !fddEngineeringUnitIsAccepted(unit, point.acceptableUnits)) {
        const rejectionReason = `Formula input "${point.label}" accepts ${point.acceptableUnits.join(", ")}, but the candidate unit is ${unit}; no unit conversion is declared.`;
        return {
          unitCompatibility: "mismatch",
          dimensionReason: rejectionReason,
          rejectionReason
        };
      }
      return {
        unitCompatibility: "match",
        dimensionReason: `Formula input expects ${expectedKind}; catalog metadata indicates ${actualKind}.${acceptableUnitText}`
      };
    }
    if (allowStructuralMetadataOverride && acceptedStructuralUnit) {
      return {
        unitCompatibility: "match",
        dimensionReason: `The structural engineering unit ${unit} verifies ${expectedKind}; conflicting semantic/description metadata is non-authoritative.`
      };
    }
    const rejectionReason = `Formula input "${point.label}" requires ${expectedKind}, but candidate metadata indicates ${actualKind}.`;
    return {
      unitCompatibility: "mismatch",
      dimensionReason: rejectionReason,
      rejectionReason
    };
  }

  async function fetchFddCatalogItems(
    base: string,
    query: string,
    limit: number,
    readContext?: FddEvidenceReadContext
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = `${base}\u0000${query}\u0000${limit}`;
    const local = readContext?.catalog.get(cacheKey);
    if (local) return local;
    const now = Date.now();
    const cached = fddCatalogQueryCache.get(cacheKey);
    if (readContext?.allowSharedCache !== false && cached && cached.expiresAt > now) {
      readContext?.catalog.set(cacheKey, cached.promise);
      return cached.promise;
    }
    const promise = (async (): Promise<Record<string, unknown>[]> => {
      try {
        const response = await fetchProxy(`${base}/api/v1/points?${new URLSearchParams({ q: query, limit: String(limit) }).toString()}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(1500)
        });
        if (!response.ok) return [];
        const payload = await response.json() as { items?: unknown[] };
        return Array.isArray(payload.items) ? payload.items.filter(isRecordValue) : [];
      } catch {
        return [];
      }
    })();
    readContext?.catalog.set(cacheKey, promise);
    if (readContext?.allowSharedCache !== false) {
      fddCatalogQueryCache.set(cacheKey, { expiresAt: now + 5 * 60_000, promise });
    }
    return promise;
  }

  function fddBrickPointMatchesRequiredPoint(point: FddAlgorithm["requiredPoints"][number], fact: FddBrickPointFact): boolean {
    const factText = `${fact.pointName} ${fact.brickClass}`.replace(/[-_]/gu, " ").toLowerCase();
    const pointText = `${point.slot} ${point.label} ${point.semantic}`.replace(/[-_]/gu, " ").toLowerCase();
    const actualKind = inferFddCandidateQuantityKind({ semantic_class: fact.brickClass, ...(fact.unit ? { unit: fact.unit } : {}) }, fact.pointName);
    if (point.quantityKind !== "unknown" && actualKind !== point.quantityKind) return false;
    // Status is a dimension, not a formula role. Keep command, operating
    // status, alarm, flow proof, and power proof in separate candidate pools
    // so a single Run_Status can never satisfy all CH-03 dependencies.
    if (point.slot === "chiller_command" && !/\bcommand\b/u.test(factText)) return false;
    if (point.slot === "chiller_alarm" && !/\balarm\b|\btrip\b|\bfault\b/u.test(factText)) return false;
    if (point.slot === "chiller_status") {
      if (/\bcommand\b|\balarm\b|\btrip\b|\bfault\b|\bmode status\b/u.test(factText)) return false;
      if (!/\brun status\b|\brunning status\b|\boperating status\b|\bon off status\b|\bstatus\b/u.test(factText)) return false;
    }
    if (/\bflow status\b|\bflow proof\b/u.test(pointText) && !/\bflow\b/u.test(factText)) return false;
    if (/\bpower status\b|\bpower proof\b/u.test(pointText) && !/\bpower\b|\bpwr\b/u.test(factText)) return false;
    const expectsChilledWater = /\b(chw|chilled water)\b/u.test(pointText);
    const expectsCondenserWater = /\b(cw|condenser water)\b/u.test(pointText);
    if (expectsChilledWater && /\bcondenser water\b/u.test(factText)) return false;
    if (expectsCondenserWater && /\bchilled water\b/u.test(factText)) return false;
    if (expectsChilledWater && point.quantityKind === "temperature" && !/\bchilled water\b/u.test(factText)) return false;
    if (expectsCondenserWater && point.quantityKind === "temperature" && !/\bcondenser water\b/u.test(factText)) return false;
    if (/\bsupply\b/u.test(pointText) && /\bentering\b/u.test(factText)) return false;
    if (/\breturn\b/u.test(pointText) && /\bleaving\b/u.test(factText)) return false;
    if (/\bsupply\b/u.test(pointText) && point.quantityKind === "temperature" && !/\bleaving\b/u.test(factText)) return false;
    if (/\breturn\b/u.test(pointText) && point.quantityKind === "temperature" && !/\bentering\b/u.test(factText)) return false;
    return true;
  }

  function fddExplicitPowerUnitEvidence(
    point: FddAlgorithm["requiredPoints"][number],
    fact: FddBrickPointFact,
    item: Record<string, unknown>
  ): { unit: string; reason: string } | null {
    if (point.quantityKind !== "power" || fact.unit || fddPointUnit(item)) return null;
    if (!/(?:^|_)Power_Sensor$/u.test(fact.brickClass)) return null;
    const text = [
      fact.pointName,
      item.description,
      item.semantic_class,
      item.brick_class
    ].filter((value): value is string => typeof value === "string").join(" ");
    if (/kwh|kilowatt[\s_-]*hour|percent|percentage|%/iu.test(text)) return null;
    if (!/(?:^|[_-])TLKW(?:$|[_-])|\bmotor\s+kilowatts?\b|\bkilowatts?\b/iu.test(text)) return null;
    return {
      unit: "kW",
      reason: "Engineering unit inferred as kW only from explicit TLKW/Motor Kilowatts catalog wording and Brick Power_Sensor semantics."
    };
  }

  async function addFddBrickPointCandidates(input: {
    algorithm: FddAlgorithm;
    point: FddAlgorithm["requiredPoints"][number];
    context: FddEntityContext;
    base: string;
    candidates: FddPointCandidate[];
    seen: Set<string>;
    readContext?: FddEvidenceReadContext;
    allowStructuralMetadataOverride?: boolean;
  }): Promise<boolean> {
    const matchingFacts = input.context.brickPoints.filter((fact) =>
      fddEntityAllowedForAlgorithm(fact.entityKey, input.context, input.algorithm)
      && fddBrickPointMatchesRequiredPoint(input.point, fact)
    );
    if (matchingFacts.length === 0) return false;
    let verified = false;
    await mapWithConcurrency(matchingFacts, 8, async (fact) => {
      const items = await fetchFddCatalogItems(input.base, fact.pointName, 8, input.readContext);
      const exactItems = items.filter((item) => normalizeFddEntityAlias(fddPointName(item) ?? "") === normalizeFddEntityAlias(fact.pointName));
      if (exactItems.length === 0) return;
      verified = true;
      for (const exactItem of exactItems) {
        const explicitPowerUnit = fddExplicitPowerUnitEvidence(input.point, fact, exactItem);
        const semanticItem = {
          ...exactItem,
          name: fact.pointName,
          equipment_name: fact.entityKey,
          semantic_class: fact.brickClass,
          brick_class: fact.brickClass,
          ...(fact.unit ? { unit: fact.unit } : explicitPowerUnit ? { unit: explicitPowerUnit.unit } : {})
        };
        addFddPointCandidateFromItem({
          algorithm: input.algorithm,
          point: input.point,
          item: semanticItem,
          query: fact.pointName,
          context: input.context,
          candidates: input.candidates,
          seen: input.seen,
          reason: `Verified exact BMS point from Brick class ${fact.brickClass}.${explicitPowerUnit ? ` ${explicitPowerUnit.reason}` : ""}`,
          minConfidence: 0.5,
          confidenceOverride: 0.96,
          entityKeyOverride: fact.entityKey,
          unitEvidenceSourceOverride: fact.unit
            ? "brick"
            : fddPointUnit(exactItem)
              ? "catalog"
              : explicitPowerUnit
                ? "description_inference"
                : undefined,
          ...(typeof input.allowStructuralMetadataOverride === "boolean"
            ? { allowStructuralMetadataOverride: input.allowStructuralMetadataOverride }
            : {})
        });
      }
    });
    return verified;
  }

  function addFddPointCandidateFromItem(input: {
    algorithm: FddAlgorithm;
    point: FddAlgorithm["requiredPoints"][number];
    item: Record<string, unknown>;
    query: string;
    context: FddEntityContext;
    candidates: FddPointCandidate[];
    seen: Set<string>;
    reason: string;
    minConfidence?: number;
    confidenceOverride?: number;
    entityKeyOverride?: string;
    unitEvidenceSourceOverride?: FddPointCandidate["unitEvidenceSource"];
    allowStructuralMetadataOverride?: boolean;
  }): void {
    const pointName = fddPointName(input.item);
    if (!pointName) return;
    const objectRef = fddPointObjectRef(input.item);
    // Distinct exact catalog identities must remain distinct candidates. A
    // same-name/different-objectRef result is ambiguous and FleetGuard must
    // block instead of silently selecting the first row.
    const key = `${input.point.slot}:${pointName}:${objectRef ?? "no-object-ref"}`;
    if (input.seen.has(key)) return;
    const entityKey = input.entityKeyOverride
      ? canonicalFddEntityKey(input.entityKeyOverride, input.context)
      : fddCandidateEntityKey(pointName, input.context);
    if (!fddEntityAllowedForAlgorithm(entityKey, input.context, input.algorithm)) return;
    const kbText = input.context.kbTextByPointName.get(normalizeFddEntityAlias(pointName));
    const kbClass = input.context.kbClassByPointName.get(normalizeFddEntityAlias(pointName));
    const scoringItem = (kbText || kbClass)
      ? { ...input.item, ...(kbText ? { kb_text: kbText } : {}), ...(kbClass ? { kb_class: kbClass } : {}) }
      : input.item;
    const confidence = input.confidenceOverride ?? fddCandidateConfidence(input.point, scoringItem, input.query);
    if (confidence < (input.minConfidence ?? 0.56)) return;
    input.seen.add(key);
    const unit = fddPointUnit(input.item);
    const unitCheck = fddUnitCompatibility(
      input.point,
      scoringItem,
      pointName,
      input.allowStructuralMetadataOverride
    );
    input.candidates.push({
      slot: input.point.slot,
      pointName,
      ...(entityKey ? { entityKey } : {}),
      ...(objectRef ? { objectRef } : {}),
      ...(unit ? { unit } : {}),
      ...(unit ? { unitEvidenceSource: input.unitEvidenceSourceOverride ?? "catalog" } : {}),
      unitCompatibility: unitCheck.unitCompatibility,
      dimensionReason: unitCheck.dimensionReason,
      ...(unitCheck.rejectionReason ? { rejectionReason: unitCheck.rejectionReason } : {}),
      confidence,
      // The points catalog does not expose actual first/last observation time.
      // Leave history unknown instead of fabricating the preferred duration.
      reason: kbText ? `${input.reason} KB catalog metadata was used for semantic disambiguation.` : input.reason
    });
  }

  function fddPointAliasMatch(pointName: string, context: FddEntityContext): { alias: string; canonical: string } | null {
    const normalizedPointName = normalizeFddEntityAlias(pointName);
    const matchingAlias = [...context.aliasToCanonical.keys()]
      .filter((alias) => normalizedPointName === alias || normalizedPointName.startsWith(`${alias}_`) || normalizedPointName.startsWith(`${alias}-`))
      .sort((left, right) => right.length - left.length)[0];
    if (!matchingAlias) return null;
    const canonical = context.aliasToCanonical.get(matchingAlias);
    if (!canonical) return null;
    const hint = context.hintsByCanonical.get(normalizeFddEntityAlias(canonical));
    const originalAlias = hint?.aliases.find((alias) => normalizeFddEntityAlias(alias) === matchingAlias) ?? matchingAlias;
    return { alias: originalAlias, canonical };
  }

  function fddAliasDigitWidth(value: string): number {
    return /(\d+)(?!.*\d)/u.exec(value)?.[1]?.length ?? 0;
  }

  function fddAliasStyleScore(alias: string, sourceAlias: string): number {
    let score = 0;
    if (alias.includes("-") === sourceAlias.includes("-")) score += 4;
    if (alias.includes("_") === sourceAlias.includes("_")) score += 4;
    if (alias.split(/[-_]/u).length === sourceAlias.split(/[-_]/u).length) score += 2;
    if (fddAliasDigitWidth(alias) === fddAliasDigitWidth(sourceAlias)) score += 2;
    const sourcePrefix = sourceAlias.split(/[-_]\d/u)[0]?.toUpperCase();
    if (sourcePrefix && alias.toUpperCase().startsWith(sourcePrefix)) score += 1;
    return score;
  }

  function fddPreferredAliasForEntity(canonical: string, sourceAlias: string, context: FddEntityContext): string {
    const hint = context.hintsByCanonical.get(normalizeFddEntityAlias(canonical));
    const aliases = [...new Set([canonical, ...(hint?.aliases ?? [])])].filter(Boolean);
    return aliases
      .sort((left, right) => {
        const score = fddAliasStyleScore(right, sourceAlias) - fddAliasStyleScore(left, sourceAlias);
        if (score !== 0) return score;
        return left.length - right.length;
      })[0] ?? canonical;
  }

  function fddReplaceLeadingAlias(pointName: string, sourceAlias: string, targetAlias: string): string | null {
    const escaped = sourceAlias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(`^${escaped}(?=$|[-_])`, "iu");
    if (!pattern.test(pointName)) return null;
    return pointName.replace(pattern, targetAlias);
  }

  function fddPointFamilySignature(pointName: string, context: FddEntityContext): string | null {
    const sourceMatch = fddPointAliasMatch(pointName, context);
    if (!sourceMatch) return null;
    const suffix = fddReplaceLeadingAlias(pointName, sourceMatch.alias, "");
    if (suffix === null) return null;
    const normalized = suffix.replace(/^[-_]+/u, "").replace(/[^a-z0-9]+/giu, "_").toLowerCase();
    return normalized || null;
  }

  function fddTargetEntityKeysForAlgorithm(algorithm: FddAlgorithm, context: FddEntityContext): string[] {
    const targetType = fddTargetEntityType(algorithm);
    return [...context.hintsByCanonical.values()]
      .filter((hint) => !targetType || hint.equipmentType === targetType)
      .map((hint) => hint.canonicalKey)
      .sort((left, right) => left.localeCompare(right));
  }

  async function supplementFddCandidatesFromEntityTemplates(input: {
    algorithm: FddAlgorithm;
    context: FddEntityContext;
    base: string;
    candidates: FddPointCandidate[];
    seen: Set<string>;
    readContext?: FddEvidenceReadContext;
    allowStructuralMetadataOverride?: boolean;
  }): Promise<void> {
    const targetEntities = fddTargetEntityKeysForAlgorithm(input.algorithm, input.context);
    if (targetEntities.length <= 1) return;
    const templateCandidates = [...input.candidates]
      .filter((candidate) => candidate.entityKey && candidate.unitCompatibility !== "mismatch" && candidate.confidence >= 0.64)
      .sort((left, right) => right.confidence - left.confidence);
    for (const candidate of templateCandidates) {
      const point = input.algorithm.requiredPoints.find((entry) => entry.slot === candidate.slot);
      if (!point) continue;
      const sourceMatch = fddPointAliasMatch(candidate.pointName, input.context);
      if (!sourceMatch) continue;
      for (const targetEntity of targetEntities) {
        if (normalizeFddEntityAlias(targetEntity) === normalizeFddEntityAlias(sourceMatch.canonical)) continue;
        const targetAlias = fddPreferredAliasForEntity(targetEntity, sourceMatch.alias, input.context);
        const targetPointName = fddReplaceLeadingAlias(candidate.pointName, sourceMatch.alias, targetAlias);
        if (!targetPointName || targetPointName === candidate.pointName) continue;
        const alreadyHasExactFamilyPoint = input.candidates.some((existing) =>
          existing.slot === candidate.slot
          && existing.entityKey
          && normalizeFddEntityAlias(canonicalFddEntityKey(existing.entityKey, input.context)) === normalizeFddEntityAlias(targetEntity)
          && normalizeFddEntityAlias(existing.pointName) === normalizeFddEntityAlias(targetPointName)
        );
        // An unrelated but superficially high-confidence point in this slot
        // must not suppress exact family completion (for example LCW setpoint
        // versus the WCC CHWST family). Only an already verified counterpart
        // from the same template family can short-circuit this lookup.
        if (alreadyHasExactFamilyPoint) continue;
        const items = await fetchFddCatalogItems(input.base, targetPointName, 8, input.readContext);
        const exactItems = items.filter((item) => normalizeFddEntityAlias(fddPointName(item) ?? "") === normalizeFddEntityAlias(targetPointName));
        for (const exactItem of exactItems) {
          addFddPointCandidateFromItem({
            algorithm: input.algorithm,
            point,
            item: exactItem,
            query: targetPointName,
            context: input.context,
            candidates: input.candidates,
            seen: input.seen,
            reason: `Completed same-class entity candidate from Knowledge Base entity aliases and verified exact BMS point "${targetPointName}".`,
            minConfidence: 0.5,
            confidenceOverride: Math.max(0.74, Math.min(0.94, candidate.confidence - 0.02)),
            ...(typeof input.allowStructuralMetadataOverride === "boolean"
              ? { allowStructuralMetadataOverride: input.allowStructuralMetadataOverride }
              : {})
          });
        }
      }
    }
  }

  function fddGroundingText(rules: ProjectGroundingRule[]): string {
    return rules
      .map((rule) => `${rule.name ?? ""} ${rule.content ?? ""} ${rule.action ?? ""} ${rule.trigger ?? ""} ${rule.scope ?? ""}`)
      .join("\n");
  }

  function fddGroundingRequiresRunningPowerEvidence(rules: ProjectGroundingRule[]): boolean {
    const text = fddGroundingText(rules).toLowerCase();
    return /\b(run|running|status|on|off|operating|开机|运行)\b/u.test(text)
      && /\b(power|motor|kilowatt|kw|watt|电力|功率)\b/u.test(text)
      && /\b(cross[-\s]?check|stronger evidence|evidence|do not rely|不要只|交叉|验证)\b/u.test(text);
  }

  function fddAlgorithmUsesRunningGate(algorithm: FddAlgorithm): boolean {
    const text = `${algorithm.formula} ${algorithm.logicSummary}`.toLowerCase();
    return algorithm.requiredPoints.some((point) => point.slot === "chiller_status")
      && /\b(chiller[_\s-]?(?:on|status)|chiller is running|chiller is operating|when the chiller|operating|运行)\b/u.test(text)
      && !/\bchiller_status\s*!?=\s*power_status\b/u.test(text);
  }

  function fddGroundingSearchTermsForQuantity(rules: ProjectGroundingRule[], quantityKind: FddQuantityKind): string[] {
    if (quantityKind !== "power") return [];
    const text = fddGroundingText(rules);
    const terms = new Set<string>();
    for (const match of text.matchAll(/`([^`]{2,80})`/gu)) {
      const term = match[1]?.trim();
      if (term) terms.add(term);
    }
    const tokenPattern = /\b[A-Z0-9][A-Z0-9_/-]*(?:KW|KILOWATT|POWER|WATT)[A-Z0-9_/-]*\b/gu;
    for (const match of text.matchAll(tokenPattern)) {
      const term = match[0]?.trim();
      if (term) terms.add(term);
    }
    terms.add("motor kilowatts");
    terms.add("motor power");
    terms.add("electric power");
    terms.add("kilowatts");
    return [...terms]
      .filter((term) => {
        const normalized = term.toLowerCase();
        return /kw|kilowatt|power|watt/u.test(normalized) && !/kwh|kilowatt[\s-]?hour/u.test(normalized);
      })
      .slice(0, 8);
  }

  function fddSupplementalRequiredPoints(algorithm: FddAlgorithm, skillContext: BuildingGptFddSkillContext): FddAlgorithm["requiredPoints"] {
    const runtimeRequiresGroundedPower = algorithm.algorithmKey === "chiller_ch_03_abnormal_shutdown";
    if (!runtimeRequiresGroundedPower
      && (!fddAlgorithmUsesRunningGate(algorithm) || !fddGroundingRequiresRunningPowerEvidence(skillContext.groundingRules))) {
      return [];
    }
    if (algorithm.requiredPoints.some((point) => point.required && point.quantityKind === "power")) {
      return [];
    }
    return [{
      slot: "chiller_running_power",
      label: "Grounded running power evidence",
      semantic: "Electric or motor power used by project grounding to validate whether the chiller is truly running.",
      required: true,
      quantityKind: "power",
      unitRoleDescription: "Grounding evidence must be instantaneous electric or motor power, not accumulated energy.",
      acceptableUnits: ["kW", "W"],
      keywords: fddGroundingSearchTermsForQuantity(skillContext.groundingRules, "power"),
      historyRequirement: { minDays: 7, preferredDays: 30 }
    }];
  }

  function fddSearchQueriesForPoint(
    point: FddAlgorithm["requiredPoints"][number],
    skillContext: BuildingGptFddSkillContext,
    context: FddEntityContext
  ): string[] {
    const groundingQueries = fddGroundingSearchTermsForQuantity(skillContext.groundingRules, point.quantityKind);
    const kbQueries = context.searchTermsByQuantityKind.get(point.quantityKind) ?? [];
    const keywordQueries = (point.keywords ?? []).map((query) => query.trim()).filter(Boolean);
    const fallbackQueries = [point.label, point.semantic].map((query) => query.trim()).filter(Boolean);
    const queries = [...new Set([
      ...groundingQueries.slice(0, 4),
      ...kbQueries.slice(0, 4),
      ...keywordQueries,
      ...fallbackQueries
    ])]
      .filter((query) => query.length >= 2);
    const specificQueries = queries.filter((query) => !/^(?:kw|w|kwh|wh|c|f|rt|cop|%)$/iu.test(query.trim()));
    return (specificQueries.length > 0 ? specificQueries : queries).slice(0, 12);
  }

  async function queryFddPointCandidates(
    projectId: string,
    algorithm: FddAlgorithm,
    context: FddEntityContext,
    skillContext: BuildingGptFddSkillContext,
    readContext?: FddEvidenceReadContext,
    allowStructuralMetadataOverride = false
  ): Promise<{ candidates: FddPointCandidate[]; supplementalPoints: FddAlgorithm["requiredPoints"]; catalogUnavailableReason?: string }> {
    const candidates: FddPointCandidate[] = [];
    const seen = new Set<string>();
    const supplementalPoints = fddSupplementalRequiredPoints(algorithm, skillContext);
    const effectiveAlgorithm: FddAlgorithm = supplementalPoints.length > 0
      ? {
          ...algorithm,
          requiredPoints: [...algorithm.requiredPoints, ...supplementalPoints]
            .filter((point, index, values) => values.findIndex((entry) => entry.slot === point.slot) === index)
        }
      : algorithm;
    const access = resolveProjectBmsAccess(projectId);
    if (!access.ok) {
      return {
        candidates,
        supplementalPoints,
        catalogUnavailableReason: access.message
      };
    }
    const base = access.baseUrl;
    for (const point of effectiveAlgorithm.requiredPoints) {
      const verifiedFromBrick = await addFddBrickPointCandidates({
        algorithm: effectiveAlgorithm,
        point,
        context,
        base,
        candidates,
        seen,
        ...(readContext ? { readContext } : {}),
        allowStructuralMetadataOverride
      });
      if (verifiedFromBrick) continue;
      const queries = fddSearchQueriesForPoint(point, skillContext, context);
      for (const query of queries) {
        const items = await fetchFddCatalogItems(base, query, 50, readContext);
        for (const item of items) {
          addFddPointCandidateFromItem({
            algorithm: effectiveAlgorithm,
            point,
            item,
            query,
            context,
            candidates,
            seen,
            reason: `Matched "${query}" against BMS catalog metadata.`,
            allowStructuralMetadataOverride
          });
        }
      }
    }
    await supplementFddCandidatesFromEntityTemplates({
      algorithm: effectiveAlgorithm,
      context,
      base,
      candidates,
      seen,
      ...(readContext ? { readContext } : {}),
      allowStructuralMetadataOverride
    });
    return {
      candidates: candidates.sort((left, right) => right.confidence - left.confidence).slice(0, 1200),
      supplementalPoints
    };
  }

  function fddHistorySelector(candidate: FddPointCandidate): Record<string, string> {
    return candidate.objectRef
      ? { object_ref: candidate.objectRef }
      : { name: candidate.pointName };
  }

  async function probeFddCandidateHistoryDaysUncached(
    baseUrl: string,
    candidate: FddPointCandidate,
    requiredDays: number
  ): Promise<number | undefined> {
    const selector = fddHistorySelector(candidate);
    const latest = await fetchTimeseries(
      baseUrl,
      { ...selector, limit: "1", offset: "0", order: "desc" },
      fetchProxy as typeof fetch,
      { signal: AbortSignal.timeout(2500), preferReadings: true }
    );
    const latestTs = latest.items[0]?.ts;
    const latestMs = latestTs ? Date.parse(latestTs) : Number.NaN;
    if (!Number.isFinite(latestMs) || latest.total < 1) return undefined;
    if (latest.total === 1) return 0;

    // A point at or before this boundary proves the required span. This works
    // for live and static historical datasets and avoids a large SQLite OFFSET
    // scan over dense multi-year series.
    const boundary = new Date(latestMs - requiredDays * 86_400_000).toISOString();
    const boundaryProbe = await fetchTimeseries(
      baseUrl,
      { ...selector, to: boundary, limit: "1", offset: "0", order: "desc" },
      fetchProxy as typeof fetch,
      { signal: AbortSignal.timeout(2500), preferReadings: true }
    );
    const earliestTs = boundaryProbe.items[0]?.ts;
    const earliestMs = earliestTs ? Date.parse(earliestTs) : Number.NaN;
    if (!Number.isFinite(earliestMs) || earliestMs > latestMs - requiredDays * 86_400_000) return undefined;
    return Math.max(0, (latestMs - earliestMs) / 86_400_000);
  }

  function probeFddCandidateHistoryDays(
    baseUrl: string,
    candidate: FddPointCandidate,
    requiredDays: number,
    readContext?: FddEvidenceReadContext
  ): Promise<number | undefined> {
    const selector = candidate.objectRef ? `object_ref:${candidate.objectRef}` : `name:${candidate.pointName}`;
    const cacheKey = `${baseUrl}\u0000${selector}\u0000${requiredDays}`;
    const local = readContext?.history.get(cacheKey);
    if (local) return local;
    const now = Date.now();
    const cached = fddHistoryProbeCache.get(cacheKey);
    if (readContext?.allowSharedCache !== false && cached && cached.expiresAt > now) {
      readContext?.history.set(cacheKey, cached.promise);
      return cached.promise;
    }
    const promise = probeFddCandidateHistoryDaysUncached(baseUrl, candidate, requiredDays).catch((error: unknown) => {
      fddHistoryProbeCache.delete(cacheKey);
      throw error;
    });
    readContext?.history.set(cacheKey, promise);
    if (readContext?.allowSharedCache !== false) {
      fddHistoryProbeCache.set(cacheKey, { expiresAt: now + 5 * 60_000, promise });
    }
    return promise;
  }

  async function enrichFddCandidateHistory(
    baseUrl: string,
    algorithm: FddAlgorithm,
    candidates: FddPointCandidate[],
    readContext?: FddEvidenceReadContext
  ): Promise<FddPointCandidate[]> {
    const pointBySlot = new Map(algorithm.requiredPoints.map((point) => [point.slot, point]));
    const candidatesToProbe = new Map<string, { candidate: FddPointCandidate; requiredDays: number }>();
    const grouped = new Map<string, FddPointCandidate[]>();
    for (const candidate of candidates) {
      const point = pointBySlot.get(candidate.slot);
      const requiredDays = point?.historyRequirement?.minDays ?? 0;
      if (!point?.required || requiredDays <= 0) continue;
      const groupKey = `${candidate.entityKey ?? ""}\u0000${candidate.slot}`;
      grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), candidate]);
    }
    for (const group of grouped.values()) {
      const point = pointBySlot.get(group[0]!.slot)!;
      // Probe the deterministic winner plus close alternatives. Homogeneous
      // family resolution happens after enrichment and may deliberately reject
      // a noisy winner in favor of its exact template counterpart; leaving that
      // close counterpart unprobed would incorrectly turn a verified mapping
      // into "history unknown".
      const ranked = sortFddPointCandidatesForRequiredPoint(point, group);
      const candidatesForHistory = ranked.filter((candidate, index) =>
        index === 0 || (index < 3 && (ranked[0]?.confidence ?? 0) - candidate.confidence <= 0.04)
      );
      for (const candidate of candidatesForHistory) {
        const probeKey = candidate.objectRef ? `object_ref:${candidate.objectRef}` : `name:${candidate.pointName}`;
        const requiredDays = point.historyRequirement?.minDays ?? 0;
        const previous = candidatesToProbe.get(probeKey);
        if (!previous || requiredDays > previous.requiredDays) {
          candidatesToProbe.set(probeKey, { candidate, requiredDays });
        }
      }
    }

    const historyDaysByProbeKey = new Map<string, number>();
    await mapWithConcurrency([...candidatesToProbe.entries()], 8, async ([probeKey, probe]) => {
      try {
        const historyDays = await probeFddCandidateHistoryDays(baseUrl, probe.candidate, probe.requiredDays, readContext);
        if (typeof historyDays === "number") historyDaysByProbeKey.set(probeKey, historyDays);
      } catch {
        // A failed or timed-out probe remains unverified and therefore blocks
        // deployment in the deterministic evaluation below.
      }
    });
    return candidates.map((candidate) => {
      const probeKey = candidate.objectRef ? `object_ref:${candidate.objectRef}` : `name:${candidate.pointName}`;
      const historyDays = historyDaysByProbeKey.get(probeKey);
      return typeof historyDays === "number" ? { ...candidate, historyDays } : candidate;
    });
  }

  function fddRuntimeEntitiesForCheck(check: FddDeployabilityCheck): FddEntityDeployability[] {
    return (check.deployableEntities ?? [])
      .filter((entity) => entity.status === "can_deploy" && entity.selectedMappings.length > 0);
  }

  function fddCheckHasEntityCoverage(check: FddDeployabilityCheck, algorithm: FddAlgorithm): boolean {
    return fddV4DecisionHasFleetCoverage({
      decision: check,
      algorithmRequiredSlots: algorithm.requiredPoints
        .filter((point) => point.required)
        .map((point) => point.slot),
      expectedCanonicalEntityKeys: (check.equipmentAvailability?.entityKeys ?? [])
        .map((entityKey) => normalizeFddEntityAlias(entityKey))
    });
  }

  function fddCheckMatchesCurrentProjectSignature(projectId: string, check: FddDeployabilityCheck): boolean {
    return check.projectDataSignature === fddProjectDataSignature(projectId);
  }

  function fddCheckMatchesCurrentPolicy(check: FddDeployabilityCheck): boolean {
    return check.checkPolicyVersion === FDD_DEPLOYABILITY_POLICY_VERSION;
  }

  function fddCheckIsFresh(check: FddDeployabilityCheck): boolean {
    const checkedAt = Date.parse(check.checkedAt);
    const ageMs = Date.now() - checkedAt;
    return Number.isFinite(checkedAt) && ageMs >= -5 * 60_000 && ageMs <= 24 * 60 * 60_000;
  }

  function fddCheckMatchesAlgorithm(check: FddDeployabilityCheck, algorithm: FddAlgorithm): boolean {
    return check.algorithmId === algorithm.id && check.algorithmVersion === algorithm.version;
  }

  function fddCheckHasEquipmentEvidence(
    check: FddDeployabilityCheck
  ): check is FddDeployabilityCheck & Required<Pick<FddDeployabilityCheck, "applicability" | "equipmentAvailability" | "equipmentInventorySignature">> {
    return Boolean(check.applicability && check.equipmentAvailability && check.equipmentInventorySignature);
  }

  function latestCurrentFddCheck(
    projectId: string,
    checks: FddDeployabilityCheck[],
    algorithm: FddAlgorithm,
    equipmentInventorySignature: string
  ): FddDeployabilityCheck | null {
    const latest = latestFddCheck(checks, algorithm.id, algorithm.version);
    return latest
      && fddCheckMatchesCurrentProjectSignature(projectId, latest)
      && fddCheckMatchesCurrentPolicy(latest)
      && fddCheckIsFresh(latest)
      && fddCheckMatchesAlgorithm(latest, algorithm)
      && fddCheckHasEquipmentEvidence(latest)
      && latest.equipmentInventorySignature === equipmentInventorySignature
      ? latest
      : null;
  }

  function latestUsableFddCheck(
    projectId: string,
    checks: FddDeployabilityCheck[],
    algorithm: FddAlgorithm,
    equipmentInventorySignature: string
  ): FddDeployabilityCheck | null {
    const latest = latestCurrentFddCheck(projectId, checks, algorithm, equipmentInventorySignature);
    return latest && fddCheckHasEntityCoverage(latest, algorithm)
      ? latest
      : null;
  }

  function persistFddDeployabilityCheck(projectId: string, check: FddDeployabilityCheck, projectTaskId?: string): void {
    const checks = store.fddChecksByProject![projectId] ?? [];
    store.fddChecksByProject![projectId] = [
      check,
      ...checks.filter((entry) =>
        projectTaskId
          ? entry.projectTaskId !== projectTaskId
          : entry.algorithmId !== check.algorithmId || entry.algorithmVersion !== check.algorithmVersion
      )
    ];
  }

  const fleetGuardAssessmentsByCheck = new WeakMap<FddDeployabilityCheck, FddFleetGuardAssessment>();

  function frozenFleetGuardPlannerInput(input: {
    projectId: string;
    algorithm: FddAlgorithm;
    context: FddEntityContext;
    targetAvailability: FddEquipmentAvailability;
    inventorySignature: string;
    candidates: ReturnType<typeof projectFddV4FleetCandidateEvidence>;
    templateVersion?: FddFleetTemplateVersion;
  }): FleetGuardPlanInput | undefined {
    const rawFleet = input.targetAvailability.entityKeys ?? [];
    const requiredBrickPoints = input.algorithm.requiredPoints.filter((point) => point.required);
    if (
      rawFleet.length > 10_000
      || requiredBrickPoints.length > 64
      || input.candidates.length > 8_192
      || input.context.brickPoints.length > 8_192
    ) return undefined;
    const plannerInputWithoutTemplate = buildFleetGuardShadowInputFromV4Evidence({
      projectId: input.projectId,
      algorithm: input.algorithm,
      evaluatorId: input.algorithm.algorithmKey,
      evaluatorAvailable: isExecutableFddAlgorithm(input.algorithm),
      targetAvailability: input.targetAvailability,
      authoritativeInventory: input.context.authoritativeInventory,
      targetEntityKeys: rawFleet.map((key) => canonicalFddEntityKey(key, input.context)),
      candidates: input.candidates,
      brickPoints: input.context.brickPoints.map((fact) => ({
        subjectKey: fact.subjectKey,
        pointName: fact.pointName,
        entityKey: canonicalFddEntityKey(fact.entityKey, input.context),
        brickClass: fact.brickClass,
        ...(fact.unit ? { unit: fact.unit } : {}),
        matchedRoleSlots: requiredBrickPoints
          .filter((point) => fddBrickPointMatchesRequiredPoint(point, fact))
          .map((point) => point.slot)
          .sort()
      })),
      sourceDataSignature: fddProjectDataSignature(input.projectId),
      inventorySignature: input.inventorySignature
    });
    return structuredClone(input.templateVersion
      ? applyFddFleetTemplateVersionToPlannerInput(input.templateVersion, plannerInputWithoutTemplate)
      : applyCurrentFddFleetTemplateToPlannerInput(store, input.projectId, plannerInputWithoutTemplate));
  }

  function attachFleetGuardAssessment(input: {
    check: FddDeployabilityCheck;
    projectId: string;
    userId: string;
    projectTaskId?: string;
    algorithm: FddAlgorithm;
    plannerInput?: FleetGuardPlanInput;
    historicalTemplate?: FddFleetTemplateVersion;
    rolloutRevisionOverride?: number;
    force?: boolean;
  }): void {
    const rollout = currentFddFleetGuardRollout(store, input.projectId);
    if (!input.force && !isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfig,
      rollout,
      algorithmKey: input.algorithm.algorithmKey
    })) return;
    const plannerInput = input.plannerInput;
    if (!plannerInput) return;
    const task = input.projectTaskId
      ? (store.fddTasksByProject?.[input.projectId] ?? []).find((entry) => entry.id === input.projectTaskId)
      : undefined;
    const parameters = recommendFddTaskParameters(
      input.algorithm,
      input.check,
      input.userId,
      task?.parameterValues ?? []
    );
    const head = input.historicalTemplate
      ?? currentFddFleetTemplateHead(store, input.projectId, input.algorithm.id);
    const templateRef = head
      ? { templateId: head.templateId, version: head.version, signature: head.signature }
      : undefined;
    const assessment = fddFleetGuardAssessment({
      plan: planFleetGuard(plannerInput),
      rolloutRevision: input.rolloutRevisionOverride ?? rollout.revision,
      ...(templateRef ? { templateRef } : {}),
      checkedAt: input.check.checkedAt,
      parameterSignature: fddFleetGuardParameterSignature(parameters),
      ...(input.projectTaskId ? { taskId: input.projectTaskId } : {})
    });
    input.check.fleetGuard = assessment.summary;
    fleetGuardAssessmentsByCheck.set(input.check, assessment);
  }

  function scheduleFddBindingProposalShadow(input: {
    projectId: string;
    algorithm: FddAlgorithm;
    plannerInput?: FleetGuardPlanInput;
  }): void {
    if (
      fddBindingProposerConfig.mode !== "shadow"
      || !fddBindingProposerConfig.projectIds.includes(input.projectId)
      || !fddBindingProposerConfig.algorithmIds.includes(input.algorithm.id)
    ) return;
    // Projection/model work is deliberately moved beyond the authoritative
    // request's call stack. It reuses the already-collected immutable facts
    // below and never performs BMS, Brick, or history I/O.
    setImmediate(() => void (async () => {
      try {
        await options.fddTestHooks?.beforeBindingProposerProjection?.({
          projectId: input.projectId,
          algorithmId: input.algorithm.id
        });
        if (!store.projects.some((project) => project.id === input.projectId)) return;
        const plannerInput = input.plannerInput;
        if (!plannerInput) return;
        const result = fddBindingProposerShadow.schedule({
          projectId: input.projectId,
          evidenceProjectId: input.projectId,
          plannerInput: structuredClone(plannerInput)
        });
        options.fddTestHooks?.onBindingProposerScheduled?.({
          projectId: input.projectId,
          algorithmId: input.algorithm.id,
          result
        });
        if (result.status === "scheduled" || result.status === "deduplicated") {
          void result.completion.then((record) => {
            options.fddTestHooks?.onBindingProposerCompleted?.(record);
          }, () => undefined);
        }
      } catch {
        // The proposer is shadow-only. Projection failures never change the
        // authoritative v4 check, task, or deploy flow.
      }
    })());
  }

  async function runFddDeployabilityCheck(
    projectId: string,
    userId: string,
    algorithm: FddAlgorithm,
    source: FddCheckSource,
    projectTaskId?: string,
    entityContext?: FddEntityContext,
    equipmentAvailability?: FddEquipmentAvailability[],
    authorizationBoundary = false,
    runtimeReceiptContext?: {
      templateVersion: FddFleetTemplateVersion;
      rolloutRevision: number;
    }
  ): Promise<FddDeployabilityCheck> {
    if (!authorizationBoundary) ensureProjectFddCollections(projectId);
    const context = entityContext ?? await buildFddEntityContext(projectId);
    const inventory = equipmentAvailability ?? fddEquipmentAvailabilityFromContext(context);
    const inventorySignature = fddEquipmentInventorySignature(context, inventory);
    const targetAvailability = fddAvailabilityForAlgorithm(algorithm, inventory);
    const skillContext = await buildBuildingGptFddSkillContext(projectId, userId, algorithm, context);
    if (targetAvailability.status !== "available") {
      const access = resolveProjectBmsAccess(projectId);
      const applicability = targetAvailability.status === "not_available" ? "no_equipment" : "unknown";
      const check = evaluateFddDeployability({
        algorithm,
        projectId,
        source,
        projectDataSignature: fddProjectDataSignature(projectId),
        pointCandidates: [],
        deployableEntities: [],
        applicability,
        equipmentAvailability: targetAvailability,
        equipmentInventorySignature: inventorySignature,
        ...(applicability === "unknown"
          ? { historyIssues: [!access.ok ? access.message : targetAvailability.reason].filter((issue): issue is string => Boolean(issue)) }
          : {}),
        ...(projectTaskId ? { projectTaskId } : {})
      });
      check.agentWorkflow = fddDeployabilityAgentWorkflow(skillContext, targetAvailability);
      const plannerInput = frozenFleetGuardPlannerInput({
        projectId,
        algorithm,
        context,
        targetAvailability,
        inventorySignature,
        candidates: [],
        ...(runtimeReceiptContext ? { templateVersion: runtimeReceiptContext.templateVersion } : {})
      });
      attachFleetGuardAssessment({
        check,
        projectId,
        userId,
        ...(projectTaskId ? { projectTaskId } : {}),
        algorithm,
        ...(runtimeReceiptContext ? {
          historicalTemplate: runtimeReceiptContext.templateVersion,
          rolloutRevisionOverride: runtimeReceiptContext.rolloutRevision,
          force: true
        } : {}),
        ...(plannerInput ? { plannerInput } : {})
      });
      if (!authorizationBoundary) {
        persistFddDeployabilityCheck(projectId, check, projectTaskId);
        scheduleFddBindingProposalShadow({
          projectId,
          algorithm,
          ...(plannerInput ? { plannerInput } : {})
        });
      }
      return check;
    }
    const excludedEntityKeys = new Set(skillContext.excludedEntityKeys.map(normalizeFddEntityAlias));
    const evidenceReads = createFddEvidenceReadContext(!authorizationBoundary && source !== "manual");
    const allowStructuralMetadataOverride = Boolean(runtimeReceiptContext)
      || isFddFleetGuardCanarySelected({
        global: fddFleetGuardGlobalConfig,
        rollout: currentFddFleetGuardRollout(store, projectId),
        algorithmKey: algorithm.algorithmKey
      });
    const candidateResult = await queryFddPointCandidates(
      projectId,
      algorithm,
      context,
      skillContext,
      evidenceReads,
      allowStructuralMetadataOverride
    );
    const effectiveAlgorithm: FddAlgorithm = candidateResult.supplementalPoints.length > 0
      ? {
          ...algorithm,
          requiredPoints: [...algorithm.requiredPoints, ...candidateResult.supplementalPoints]
            .filter((point, index, values) => values.findIndex((entry) => entry.slot === point.slot) === index)
        }
      : algorithm;
    const rawCandidates = candidateResult.candidates
      .filter((candidate) => !candidate.entityKey || !excludedEntityKeys.has(normalizeFddEntityAlias(candidate.entityKey)));
    const unverifiedCandidates = rawCandidates.filter((candidate) => candidate.unitCompatibility !== "mismatch");
    const access = resolveProjectBmsAccess(projectId);
    const usableCandidates = access.ok
      ? await enrichFddCandidateHistory(access.baseUrl, effectiveAlgorithm, unverifiedCandidates, evidenceReads)
      : unverifiedCandidates;
    const rawRejectedCandidates = rawCandidates.filter((candidate) => candidate.unitCompatibility === "mismatch");
    const targetEntityKeys = (targetAvailability.entityKeys ?? [])
      .filter((entityKey) => !excludedEntityKeys.has(normalizeFddEntityAlias(entityKey)));
    const fleetCandidateEvidence = projectFddV4FleetCandidateEvidence(usableCandidates, {
      canonicalEntityKey: (entityKey) => canonicalFddEntityKey(entityKey, context),
      pointFamilyKey: (pointName) => fddPointFamilySignature(pointName, context)
    });
    const deployability = planFddHomogeneousV4Fleet({
      algorithm: effectiveAlgorithm,
      candidates: fleetCandidateEvidence,
      targetEntityKeys: targetEntityKeys.map((entityKey) => canonicalFddEntityKey(entityKey, context)),
      supplementalPoints: candidateResult.supplementalPoints,
      homogeneousTemplateEligible: fddTargetEntityType(effectiveAlgorithm) === "chiller"
    });
    const preferredExampleEntity = deployability.templateEntityKey
      ?? deployability.entities.find((entity) => entity.status === "can_deploy")?.entityKey;
    const preferredMappings = deployability.entities.find((entity) => entity.entityKey === preferredExampleEntity)?.selectedMappings ?? [];
    const alignedCandidates = alignFddV4CandidatesToExampleEntity({
      algorithm: effectiveAlgorithm,
      candidates: fleetCandidateEvidence,
      ...(preferredExampleEntity ? { preferredEntityKey: preferredExampleEntity } : {}),
      preferredMappings
    });
    const rejectedCandidates = alignedCandidates.exampleEntityKey
      ? rawRejectedCandidates.filter((candidate) => !candidate.entityKey || candidate.entityKey === alignedCandidates.exampleEntityKey)
      : rawRejectedCandidates;
    const evaluatedCheck = evaluateFddDeployability({
      algorithm: effectiveAlgorithm,
      projectId,
      source,
      projectDataSignature: fddProjectDataSignature(projectId),
      applicability: "applicable",
      equipmentAvailability: targetAvailability,
      equipmentInventorySignature: inventorySignature,
      pointCandidates: alignedCandidates.candidates,
      ...(alignedCandidates.exampleEntityKey ? { exampleEntityKey: alignedCandidates.exampleEntityKey } : {}),
      rejectedCandidates: rejectedCandidates.slice(0, 40),
      deployableEntities: deployability.entities.slice(0, 80),
      ...(candidateResult.catalogUnavailableReason || alignedCandidates.alignmentIssue
        ? { historyIssues: [candidateResult.catalogUnavailableReason, alignedCandidates.alignmentIssue].filter((issue): issue is string => Boolean(issue)) }
        : {}),
      ...(projectTaskId ? { projectTaskId } : {})
    });
    const check = applyFddHomogeneousV4FleetDecision({
      decision: evaluatedCheck,
      plan: deployability,
      expectedEntityCount: targetEntityKeys.length,
      requiredRuntimeSlots: effectiveAlgorithm.requiredPoints.filter((point) => point.required).map((point) => point.slot)
    });
    check.agentWorkflow = fddDeployabilityAgentWorkflow(skillContext, targetAvailability);
    const plannerInput = frozenFleetGuardPlannerInput({
      projectId,
      algorithm: effectiveAlgorithm,
      context,
      targetAvailability,
      inventorySignature,
      candidates: fleetCandidateEvidence,
      ...(runtimeReceiptContext ? { templateVersion: runtimeReceiptContext.templateVersion } : {})
    });
    attachFleetGuardAssessment({
      check,
      projectId,
      userId,
      ...(projectTaskId ? { projectTaskId } : {}),
      algorithm: effectiveAlgorithm,
      ...(runtimeReceiptContext ? {
        historicalTemplate: runtimeReceiptContext.templateVersion,
        rolloutRevisionOverride: runtimeReceiptContext.rolloutRevision,
        force: true
      } : {}),
      ...(plannerInput ? { plannerInput } : {})
    });
    if (!authorizationBoundary) {
      persistFddDeployabilityCheck(projectId, check, projectTaskId);
      scheduleFddBindingProposalShadow({
        projectId,
        algorithm: effectiveAlgorithm,
        ...(plannerInput ? { plannerInput } : {})
      });
    }
    return check;
  }

  function missingAutomaticFddAlgorithms(projectId: string, equipmentInventorySignature: string): FddAlgorithm[] {
    ensureProjectFddCollections(projectId);
    const checks = store.fddChecksByProject![projectId] ?? [];
    return (store.fddAlgorithms ?? [])
      // Specification-only imports are checked on demand. Running hundreds of
      // point-catalog queries synchronously on every library open would block
      // the page without making those algorithms executable.
      .filter(isExecutableFddAlgorithm)
      // A current no-equipment/unknown/cannot-deploy result is still a
      // completed automatic check. Deployment uses latestUsableFddCheck and
      // therefore remains fail-closed; this only prevents endless reruns.
      .filter((algorithm) => !latestCurrentFddCheck(projectId, checks, algorithm, equipmentInventorySignature));
  }

  async function ensureAutomaticFddLibraryChecks(
    projectId: string,
    userId: string,
    entityContext?: FddEntityContext,
    equipmentAvailability?: FddEquipmentAvailability[]
  ): Promise<void> {
    const context = entityContext ?? await buildFddEntityContext(projectId);
    const inventory = equipmentAvailability ?? fddEquipmentAvailabilityFromContext(context);
    const missing = missingAutomaticFddAlgorithms(projectId, fddEquipmentInventorySignature(context, inventory));
    if (missing.length === 0) return;
    const checked = await mapWithConcurrency(missing, 4, (algorithm) => runFddDeployabilityCheck(projectId, userId, algorithm, "auto", undefined, context, inventory));
    store.fddLibraryCheckRunsByProject![projectId] = [
      {
        id: `fddrun_${randomUUID()}`,
        projectId,
        algorithmIds: checked.map((check) => check.algorithmId).filter((id): id is string => Boolean(id)),
        projectDataSignature: fddProjectDataSignature(projectId),
        createdAt: new Date().toISOString()
      },
      ...(store.fddLibraryCheckRunsByProject![projectId] ?? [])
    ];
    persistSoon();
  }

  function scheduleAutomaticFddLibraryChecks(
    projectId: string,
    userId: string,
    entityContext: FddEntityContext,
    equipmentAvailability: FddEquipmentAvailability[]
  ): boolean {
    if (missingAutomaticFddAlgorithms(projectId, fddEquipmentInventorySignature(entityContext, equipmentAvailability)).length === 0) return false;
    if (automaticFddCheckRuns.has(projectId)) return true;
    const run = ensureAutomaticFddLibraryChecks(projectId, userId, entityContext, equipmentAvailability)
      .then(() => {
        broadcastToProject(projectId, { type: "fdd_library_updated", projectId });
      })
      .catch(() => {
        // Individual candidate and history probes fail closed. This guard only
        // prevents a detached background run from becoming an unhandled error.
      })
      .finally(() => {
        automaticFddCheckRuns.delete(projectId);
      });
    automaticFddCheckRuns.set(projectId, run);
    return true;
  }

  function fddTasksForProject(projectId: string): ProjectFddTask[] {
    ensureProjectFddCollections(projectId);
    let changed = false;
    const tasks = store.fddTasksByProject![projectId] ?? [];
    for (const task of tasks) {
      if (task.source !== "global_library") continue;
      const latestAlgorithm = (store.fddAlgorithms ?? []).find((algorithm) =>
        algorithm.id === task.globalAlgorithmId
        || (algorithm.algorithmKey === task.algorithmSnapshot.algorithmKey && algorithm.scope === "global_builtin")
      );
      if (!latestAlgorithm) continue;
      if (JSON.stringify(task.algorithmSnapshot) !== JSON.stringify(latestAlgorithm)) {
        task.algorithmSnapshot = { ...latestAlgorithm };
        delete task.deployabilityCheck;
        task.status = isExecutableFddAlgorithm(latestAlgorithm) ? "checking" : "cannot_deploy";
        task.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) persistSoon();
    return [...tasks].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  function upsertFddTask(projectId: string, task: ProjectFddTask): void {
    ensureProjectFddCollections(projectId);
    const tasks = store.fddTasksByProject![projectId] ?? [];
    store.fddTasksByProject![projectId] = [task, ...tasks.filter((entry) => entry.id !== task.id)];
  }

  function dashboardBindingMatchesDerivedMetric(
    binding: DashboardPointBinding,
    instanceIds: Set<string>,
    metricIdentityKeys: Set<string>
  ): boolean {
    if (binding.source !== "derived_metric" && !binding.metricInstanceId && !binding.metricKey) {
      return false;
    }
    if (binding.metricInstanceId && instanceIds.has(binding.metricInstanceId)) {
      return true;
    }
    if (binding.metricKey && binding.entityId && metricIdentityKeys.has(`${binding.metricKey}:${binding.entityId}`)) {
      return true;
    }
    return false;
  }

  function cleanupDashboardsForDeletedDerivedMetrics(
    projectId: string,
    instances: DerivedMetricInstance[]
  ): { deletedDashboardIds: string[]; updatedDashboardIds: string[] } {
    if (instances.length === 0) {
      return { deletedDashboardIds: [], updatedDashboardIds: [] };
    }
    store.dashboardsByProject ??= {};
    const dashboards = store.dashboardsByProject[projectId] ?? [];
    if (dashboards.length === 0) {
      return { deletedDashboardIds: [], updatedDashboardIds: [] };
    }
    const instanceIds = new Set(instances.map((instance) => instance.instanceId));
    const metricIdentityKeys = new Set(instances.map((instance) => `${instance.metricKey}:${instance.entityId}`));
    const deletedDashboardIds: string[] = [];
    const updatedDashboardIds: string[] = [];
    const nextDashboards: DashboardRecord[] = [];

    for (const dashboard of dashboards) {
      let hasDeletedBinding = false;
      let hasKeptDerivedBinding = false;
      let hasNonDerivedBinding = false;

      for (const widget of dashboard.widgets) {
        for (const binding of widget.pointBindings) {
          const isDerivedBinding = binding.source === "derived_metric" || Boolean(binding.metricInstanceId || binding.metricKey);
          const isDeletedBinding = dashboardBindingMatchesDerivedMetric(binding, instanceIds, metricIdentityKeys);
          hasDeletedBinding ||= isDeletedBinding;
          hasKeptDerivedBinding ||= isDerivedBinding && !isDeletedBinding;
          hasNonDerivedBinding ||= !isDerivedBinding;
        }
      }

      if (!hasDeletedBinding) {
        nextDashboards.push(dashboard);
        continue;
      }

      if (!hasKeptDerivedBinding && !hasNonDerivedBinding) {
        deletedDashboardIds.push(dashboard.id);
        broadcastToProject(projectId, { type: "dashboard_deleted", projectId, dashboardId: dashboard.id });
        continue;
      }

      const widgets = dashboard.widgets
        .map((widget) => {
          const pointBindings = widget.pointBindings.filter((binding) =>
            !dashboardBindingMatchesDerivedMetric(binding, instanceIds, metricIdentityKeys)
          );
          return { ...widget, pointBindings };
        })
        .filter((widget) => widget.pointBindings.length > 0 || widget.kind === "note");
      const widgetIds = new Set(widgets.map((widget) => widget.id));
      const sections = dashboard.sections
        ?.map((section) => ({
          ...section,
          widgetIds: section.widgetIds.filter((widgetId) => widgetIds.has(widgetId))
        }))
        .filter((section) => section.widgetIds.length > 0);
      const updated: DashboardRecord = {
        ...dashboard,
        widgets,
        layout: dashboard.layout.filter((item) => widgetIds.has(item.widgetId)),
        sections: sections ?? [],
        updatedAt: new Date().toISOString()
      };
      updatedDashboardIds.push(updated.id);
      nextDashboards.push(updated);
      broadcastToProject(projectId, { type: "dashboard_updated", projectId, dashboard: updated });
    }

    store.dashboardsByProject[projectId] = sortedDashboards(nextDashboards);
    return { deletedDashboardIds, updatedDashboardIds };
  }

  function deleteDerivedMetricInstances(
    projectId: string,
    instances: DerivedMetricInstance[]
  ): { deletedMetrics: DerivedMetricInstance[]; deletedDashboardIds: string[]; updatedDashboardIds: string[] } {
    const dashboardCleanup = cleanupDashboardsForDeletedDerivedMetrics(projectId, instances);
    const deletedMetrics = instances
      .map((instance) => derivedMetrics.deleteInstance(projectId, instance.instanceId))
      .filter((instance): instance is DerivedMetricInstance => Boolean(instance));
    if (deletedMetrics.length > 0) {
      broadcastToProject(projectId, { type: "derived_metrics_updated", projectId });
    }
    return { deletedMetrics, ...dashboardCleanup };
  }

  function fddRuntimeInstancesForTask(projectId: string, task: ProjectFddTask): DerivedMetricInstance[] {
    const algorithmIds = new Set([task.algorithmSnapshot.id, task.globalAlgorithmId].filter((value): value is string => Boolean(value)));
    return derivedMetrics.listProjectMetrics(projectId).filter((instance) => {
      if (instance.metricType !== "fdd") return false;
      const fddTaskId = typeof instance.metadata?.fddTaskId === "string" ? instance.metadata.fddTaskId : undefined;
      if (fddTaskId) return fddTaskId === task.id;
      const fddAlgorithmId = typeof instance.metadata?.fddAlgorithmId === "string" ? instance.metadata.fddAlgorithmId : undefined;
      return (fddAlgorithmId ? algorithmIds.has(fddAlgorithmId) : false)
        || instance.metricKey === task.algorithmSnapshot.algorithmKey;
    });
  }

  function fleetGuardInstanceMatchesReceiptEntity(
    instance: DerivedMetricInstance,
    receipt: FddDeploymentReceipt,
    entity: FddDeploymentReceipt["entities"][number]
  ): boolean {
    if (
      instance.instanceId !== entity.instanceId
      || instance.projectId !== receipt.projectId
      || instance.entityId.trim().toUpperCase() !== entity.entityKey.trim().toUpperCase()
      || instance.metricKey !== receipt.algorithm.key
      || instance.formulaVersion !== receipt.algorithm.version
      || instance.metadata?.fddTaskId !== receipt.taskId
      || instance.metadata?.fddAlgorithmId !== receipt.algorithm.id
      || instance.metadata?.fddAuthorizationPolicy !== "fleetguard-v1"
      || instance.metadata?.fddFleetGuardReceiptId !== receipt.receiptId
      || instance.dependencies.length !== entity.bindings.length
    ) return false;
    const dependenciesByRole = new Map(instance.dependencies.map((dependency) => [dependency.role, dependency]));
    if (dependenciesByRole.size !== entity.bindings.length) return false;
    return entity.bindings.every((binding) => {
      const dependency = dependenciesByRole.get(binding.role);
      return Boolean(
        dependency
        && dependency.sourceType === "raw_point"
        // pointId is a stable Brick identity. pointName must stay empty so a
        // human-readable label can never impersonate that identity.
        && dependency.sourceId === binding.pointId
        && !dependency.pointName
        // Runtime reads are pinned to the exact BMS object reference.
        && dependency.objectRef === binding.objectRef
        && (dependency.unit ?? undefined) === (binding.unit ?? undefined)
        && dependency.metadata?.fddPointFamilyKey === binding.familyKey
        && dependency.metadata?.fddFleetGuardReceiptId === receipt.receiptId
      );
    });
  }

  function fleetGuardRuntimeForReceipt(receipt: FddDeploymentReceipt): DerivedMetricInstance[] | null {
    if (receipt.entities.length !== 8) return null;
    const instances: DerivedMetricInstance[] = [];
    for (const entity of receipt.entities) {
      const instance = derivedMetrics.getInstance(entity.instanceId);
      if (!instance || !fleetGuardInstanceMatchesReceiptEntity(instance, receipt, entity)) return null;
      instances.push(instance);
    }
    return new Set(instances.map((instance) => instance.instanceId)).size === 8 ? instances : null;
  }

  function fleetGuardTaskSnapshotFromReceipt(receipt: FddDeploymentReceipt): ProjectFddTask | undefined {
    const snapshot = receipt.taskSnapshot;
    if (!snapshot || !isRecordValue(snapshot.algorithmSnapshot)) return undefined;
    if (
      snapshot.id !== receipt.taskId
      || snapshot.projectId !== receipt.projectId
      || snapshot.authorizationPolicy !== "fleetguard-v1"
      || snapshot.activeDeploymentReceiptId !== receipt.receiptId
      || snapshot.status !== "running"
      || snapshot.algorithmSnapshot.id !== receipt.algorithm.id
      || snapshot.algorithmSnapshot.algorithmKey !== receipt.algorithm.key
      || snapshot.algorithmSnapshot.version !== receipt.algorithm.version
    ) return undefined;
    return structuredClone(snapshot) as unknown as ProjectFddTask;
  }

  function recoverFleetGuardTasksFromReceipts(): number {
    const receipts = derivedMetrics.listFddDeploymentReceipts();
    const recoveredTaskIds = new Set<string>();
    let changes = 0;
    for (const receipt of receipts) {
      const taskKey = `${receipt.projectId}\u0000${receipt.taskId}`;
      if (recoveredTaskIds.has(taskKey)) continue;
      const snapshot = fleetGuardTaskSnapshotFromReceipt(receipt);
      const instances = fleetGuardRuntimeForReceipt(receipt);
      if (!snapshot || !instances) continue;
      recoveredTaskIds.add(taskKey);
      const tasks = store.fddTasksByProject?.[receipt.projectId] ?? [];
      const current = tasks.find((task) => task.id === receipt.taskId);
      if (
        current?.authorizationPolicy === "fleetguard-v1"
        && current.activeDeploymentReceiptId === receipt.receiptId
        && current.status === "running"
      ) continue;
      store.fddTasksByProject ??= {};
      store.fddTasksByProject[receipt.projectId] = [snapshot, ...tasks.filter((task) => task.id !== receipt.taskId)];
      changes += 1;
    }
    return changes;
  }

  if (recoverFleetGuardTasksFromReceipts() > 0) {
    persistNow();
  }

  function invalidateLegacyFddRuntimeAuthorizations(): number {
    let changes = 0;
    const currentInventorySignatures = new Map<string, string>();
    for (const [projectId, tasks] of Object.entries(store.fddTasksByProject ?? {})) {
      const currentInventorySignature = currentInventorySignatures.get(projectId)
        ?? currentFddEquipmentInventorySignatureSync(projectId);
      currentInventorySignatures.set(projectId, currentInventorySignature);
      for (const task of tasks) {
        if (task.authorizationPolicy === "fleetguard-v1") {
          const receipt = task.activeDeploymentReceiptId
            ? derivedMetrics.getFddDeploymentReceipt(task.activeDeploymentReceiptId)
            : null;
          const fleetInstances = receipt && receipt.projectId === projectId && receipt.taskId === task.id
            ? fleetGuardRuntimeForReceipt(receipt)
            : null;
          if (fleetInstances) continue;
          task.status = "checking";
          task.updatedAt = new Date().toISOString();
          derivedMetrics.runInTransaction(() => {
            for (const instance of fddRuntimeInstancesForTask(projectId, task)) {
              const materialization = derivedMetrics.readMaterialization(instance.instanceId);
              if (!materialization?.enabled) continue;
              derivedMetrics.configureMaterialization({
                instanceId: instance.instanceId,
                enabled: false,
                status: "authorization_required",
                lastError: "fdd_fleetguard_receipt_revalidation_required"
              });
              changes += 1;
            }
          });
          changes += 1;
          continue;
        }
        const check = task.deployabilityCheck;
        const hasCurrentBmsSource = projectBmsSources(projectId).length > 0;
        const currentlyAuthorized = Boolean(
          check
          && check.status === "can_deploy"
          && fddCheckMatchesCurrentPolicy(check)
          && fddCheckIsFresh(check)
          // Some sources (including WKGO) are restored by a post-start
          // bootstrap. Defer signature comparison while the source registry is
          // empty; policy/version/history evidence still must be current.
          && (!hasCurrentBmsSource || fddCheckMatchesCurrentProjectSignature(projectId, check))
          && fddCheckMatchesAlgorithm(check, task.algorithmSnapshot)
          && fddCheckHasEntityCoverage(check, task.algorithmSnapshot)
          && check.equipmentInventorySignature === currentInventorySignature
          && isExecutableFddAlgorithm(task.algorithmSnapshot)
        );
        if (currentlyAuthorized) continue;
        if (isExecutableFddAlgorithm(task.algorithmSnapshot) && (task.status === "running" || task.status === "ready")) {
          task.status = "checking";
          task.updatedAt = new Date().toISOString();
          changes += 1;
        }
        for (const instance of fddRuntimeInstancesForTask(projectId, task)) {
          const materialization = derivedMetrics.readMaterialization(instance.instanceId);
          if (!materialization?.enabled) continue;
          derivedMetrics.configureMaterialization({
            instanceId: instance.instanceId,
            enabled: false,
            status: "authorization_required",
            lastError: "fdd_deployability_policy_revalidation_required"
          });
          changes += 1;
        }
      }
    }
    return changes;
  }

  if (invalidateLegacyFddRuntimeAuthorizations() > 0) {
    persistNow();
  }

  function deleteGeneratedFddDashboardsForTask(projectId: string, task: ProjectFddTask): string[] {
    store.dashboardsByProject ??= {};
    const dashboards = store.dashboardsByProject[projectId] ?? [];
    const expectedTitle = `${task.algorithmSnapshot.name} Dashboard`;
    const expectedDescription = `Runtime FDD dashboard for ${task.algorithmSnapshot.name}.`;
    const deletedDashboardIds = dashboards
      .filter((dashboard) =>
        dashboard.title === expectedTitle
        && (dashboard.description === expectedDescription || dashboard.widgets.some((widget) => widget.id === "fdd_detection_logic"))
      )
      .map((dashboard) => dashboard.id);
    if (deletedDashboardIds.length === 0) return [];
    const deletedDashboardIdSet = new Set(deletedDashboardIds);
    store.dashboardsByProject[projectId] = dashboards.filter((dashboard) => !deletedDashboardIdSet.has(dashboard.id));
    for (const dashboardId of deletedDashboardIds) {
      broadcastToProject(projectId, { type: "dashboard_deleted", projectId, dashboardId });
    }
    return deletedDashboardIds;
  }

  function fddTaskFromAlgorithm(projectId: string, algorithm: FddAlgorithm, source: ProjectFddTask["source"], sharingScope: ProjectFddTask["sharingScope"], check?: FddDeployabilityCheck): ProjectFddTask {
    const now = new Date().toISOString();
    return {
      id: `fddtask_${randomUUID()}`,
      projectId,
      source,
      sharingScope,
      ...(source === "global_library" ? { globalAlgorithmId: algorithm.id } : {}),
      algorithmSnapshot: { ...algorithm },
      status: isExecutableFddAlgorithm(algorithm) && (!check || check.status === "can_deploy") ? "ready" : "cannot_deploy",
      ...(check ? { deployabilityCheck: check } : {}),
      createdAt: now,
      updatedAt: now
    };
  }

  function fddParameterReason(parameterKey: string, algorithm: FddAlgorithm, check?: FddDeployabilityCheck): string {
    const deployableEntityCount = check?.deployableEntities?.filter((entity) => entity.status !== "cannot_deploy" && entity.selectedMappings.length > 0).length ?? 0;
    const entityText = deployableEntityCount > 1
      ? ` for ${deployableEntityCount} deployable entities`
      : check?.exampleEntityKey
        ? ` for ${check.exampleEntityKey}`
        : "";
    if (parameterKey === "window_minutes") return `BuildingGPT recommended an initial persistence window${entityText} from the FDD formula and common HVAC FDD practice.`;
    if (parameterKey === "cop_threshold") return `BuildingGPT recommended an initial COP threshold${entityText}; tune after reviewing normal operating baseline.`;
    if (parameterKey === "min_load") return `BuildingGPT recommended a minimum load gate${entityText} so low-load operation does not trigger false faults.`;
    if (parameterKey === "tolerance_percent") return `BuildingGPT recommended an initial tolerance${entityText} for the ${algorithm.method.replace(/_/gu, " ")} consistency check.`;
    if (parameterKey === "delta_t_min") return `BuildingGPT recommended a chilled-water Delta-T threshold${entityText}; tune by local design and operating history.`;
    if (parameterKey === "min_flow") return `BuildingGPT recommended a minimum flow threshold${entityText}; replace with design/minimum flow when available.`;
    if (parameterKey.startsWith("epsilon_") || parameterKey === "freeze_window") return `BuildingGPT recommended an initial flatline detector setting${entityText} based on sensor FDD practice.`;
    return `BuildingGPT recommended this initial hyperparameter${entityText} from the algorithm formula.`;
  }

  function recommendFddTaskParameters(
    algorithm: FddAlgorithm,
    check: FddDeployabilityCheck | undefined,
    userId: string,
    existingValues: FddTaskParameterValue[] = []
  ): FddTaskParameterValue[] {
    const now = new Date().toISOString();
    const existingByKey = new Map(existingValues.map((parameter) => [parameter.key, parameter]));
    return algorithm.parameters.map((parameter) => {
      const existing = existingByKey.get(parameter.key);
      if (existing?.source === "user_override") {
        return existing;
      }
      return {
        key: parameter.key,
        value: parameter.defaultValue,
        ...(parameter.unit ? { unit: parameter.unit } : {}),
        source: "buildinggpt_recommended",
        confidence: check?.status === "can_deploy" ? 0.74 : 0.62,
        reason: fddParameterReason(parameter.key, algorithm, check),
        updatedAt: now,
        updatedBy: userId
      };
    });
  }

  function coerceFddTaskParameterValue(parameter: FddAlgorithm["parameters"][number], value: unknown): FddTaskParameterValue["value"] | null {
    if (parameter.type === "number") {
      const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
      if (!Number.isFinite(numericValue)) return null;
      if (typeof parameter.min === "number" && numericValue < parameter.min) return null;
      if (typeof parameter.max === "number" && numericValue > parameter.max) return null;
      return numericValue;
    }
    if (parameter.type === "boolean") {
      return typeof value === "boolean" ? value : null;
    }
    if (parameter.type === "select") {
      if (typeof value !== "string") return null;
      return parameter.options?.includes(value) ? value : null;
    }
    return null;
  }

  function applyFddTaskParameterOverrides(task: ProjectFddTask, rawParameters: unknown, userId: string): { task?: ProjectFddTask; error?: string } {
    if (!Array.isArray(rawParameters)) {
      return { error: "parameters must be an array." };
    }
    const now = new Date().toISOString();
    const specsByKey = new Map(task.algorithmSnapshot.parameters.map((parameter) => [parameter.key, parameter]));
    const existingByKey = new Map((task.parameterValues ?? []).map((parameter) => [parameter.key, parameter]));
    for (const entry of rawParameters) {
      if (!isRecordValue(entry)) return { error: "Each parameter override must be an object." };
      const key = typeof entry.key === "string" ? entry.key : "";
      const spec = specsByKey.get(key);
      if (!spec) return { error: `Unknown FDD parameter: ${key || "(missing key)"}.` };
      if (!spec.editable) return { error: `FDD parameter is not editable: ${key}.` };
      const coercedValue = coerceFddTaskParameterValue(spec, entry.value);
      if (coercedValue === null) return { error: `Invalid value for FDD parameter: ${spec.label}.` };
      existingByKey.set(key, {
        key,
        value: coercedValue,
        ...(spec.unit ? { unit: spec.unit } : {}),
        source: "user_override",
        reason: "Operator override from the FDD task panel.",
        updatedAt: now,
        updatedBy: userId
      });
    }
    task.parameterValues = task.algorithmSnapshot.parameters.map((parameter) => existingByKey.get(parameter.key)).filter((parameter): parameter is FddTaskParameterValue => Boolean(parameter));
    task.updatedAt = now;
    return { task };
  }

	  async function deployFddTaskRuntime(
	    projectId: string,
	    userId: string,
	    task: ProjectFddTask,
	    check: FddDeployabilityCheck
  ): Promise<{ task: ProjectFddTask; instances: DerivedMetricInstance[]; runtimeEntities: FddEntityDeployability[]; error?: string }> {
    if (!isExecutableFddAlgorithm(task.algorithmSnapshot)) {
      return { task, instances: [], runtimeEntities: [], error: "This FDD definition is specification-only because no executable evaluator is registered." };
    }
    if (check.status !== "can_deploy") {
      return { task, instances: [], runtimeEntities: [], error: "This FDD task requires a confirmed can_deploy check; resolve missing, ambiguous, or history blockers first." };
    }
    if (!fddCheckHasEntityCoverage(check, task.algorithmSnapshot)) {
      return { task, instances: [], runtimeEntities: [], error: "Deploy All requires a complete, distinct point mapping for every equipment entity in the current inventory." };
    }
    const runtimeEntities = fddRuntimeEntitiesForCheck(check);
    if (runtimeEntities.length === 0) {
      return { task, instances: [], runtimeEntities, error: "This FDD task has no complete entity-level mapping to deploy." };
    }
    const expectedEntityCount = check.equipmentAvailability?.entityCount ?? check.expectedEntityCount ?? runtimeEntities.length;
    if (runtimeEntities.length !== expectedEntityCount) {
      return { task, instances: [], runtimeEntities, error: `Deploy All expected ${expectedEntityCount} entities but the validated check contains ${runtimeEntities.length}.` };
    }
    const parameterValues = recommendFddTaskParameters(task.algorithmSnapshot, check, userId, task.parameterValues ?? []);
    let instances: DerivedMetricInstance[];
    try {
      instances = derivedMetrics.runInTransaction(() => {
        const registered = runtimeEntities.map((entity) => {
          const instance = registerFddDerivedMetric(projectId, userId, task.algorithmSnapshot, check, parameterValues, task.id, entity);
          if (!instance) throw new Error(`fdd_runtime_registration_failed:${entity.entityKey}`);
          if (!fddInstanceMatchesEntityPlan(instance, entity)) {
            throw new Error(`fdd_runtime_dependency_plan_mismatch:${entity.entityKey}`);
          }
          return instance;
        });
        const deployedEntityKeys = new Set(registered.map((instance) => normalizeFddEntityAlias(instance.entityId)));
        if (registered.length !== expectedEntityCount || deployedEntityKeys.size !== expectedEntityCount) {
          throw new Error(`fdd_runtime_entity_coverage_mismatch:${deployedEntityKeys.size}/${expectedEntityCount}`);
        }
        return registered;
      });
    } catch (error) {
      return {
        task,
        instances: [],
        runtimeEntities,
        error: `Deploy All failed before commit; all existing and new runtime instances were left unchanged (${error instanceof Error ? error.message : "registration failed"}).`
      };
    }
    task.deployabilityCheck = check;
    task.status = "running";
    task.parameterValues = parameterValues;
    task.authorizationPolicy = "v4";
    delete task.activeDeploymentReceiptId;
    task.updatedAt = new Date().toISOString();
    upsertFddTask(projectId, task);
	    ensureFddDashboardForInstances(projectId, userId, task.algorithmSnapshot, instances);
	    scheduleFddRuntimeMaterialization(projectId, instances);
	    return { task, instances, runtimeEntities };
	  }

  function fleetGuardAuthorizationStillCurrent(input: {
    projectId: string;
    algorithm: FddAlgorithm;
    taskId?: string;
    assessment: FddFleetGuardAssessment;
    submitted?: FleetGuardAuthorizationToken;
    parameterSignature: string;
  }): ReturnType<typeof validateFleetGuardAuthorization> {
    if (!store.projects.some((project) => project.id === input.projectId)) {
      return { valid: false, code: "inventory_signature_mismatch", reason: "The project no longer exists." };
    }
    const rollout = currentFddFleetGuardRollout(store, input.projectId);
    if (!isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfig,
      rollout,
      algorithmKey: input.algorithm.algorithmKey
    })) {
      return { valid: false, code: "rollout_revision_mismatch", reason: "FleetGuard canary selection changed." };
    }
    const templateRef = input.assessment.templateRef;
    if (!templateRef) return { valid: false, code: "template_mismatch", reason: "A compatible locked fleet template is required." };
    const head = currentFddFleetTemplateHead(store, input.projectId, input.algorithm.id);
    if (
      !head
      || head.state !== "locked"
      || head.templateId !== templateRef.templateId
      || head.version !== templateRef.version
      || head.signature !== templateRef.signature
    ) {
      return { valid: false, code: "template_mismatch", reason: "The locked fleet template changed." };
    }
    const registration = fleetGuardEvaluatorRegistration(input.algorithm.algorithmKey);
    if (
      !registration
      || registration.evaluatorId !== input.assessment.plan.evaluator.id
      || registration.evaluatorVersion !== input.assessment.plan.evaluator.registeredVersion
      || input.assessment.plan.signatures.evaluator !== fddFleetGuardEvaluatorEvidenceSignature({
        projectId: input.projectId,
        evaluatorId: input.algorithm.algorithmKey,
        evaluatorAvailable: isExecutableFddAlgorithm(input.algorithm)
      })
    ) {
      return { valid: false, code: "evaluator_signature_mismatch", reason: "The versioned evaluator registration changed." };
    }
    return validateFleetGuardAuthorization({
      ...(input.submitted ? { submitted: input.submitted } : {}),
      plan: input.assessment.plan,
      rolloutRevision: rollout.revision,
      templateRef,
      parameterSignature: input.parameterSignature,
      ...(input.taskId ? { taskId: input.taskId } : {})
    });
  }

  function fleetGuardInstanceMatchesPlanEntity(
    instance: DerivedMetricInstance,
    entity: FleetGuardPlan["entities"][number],
    receiptId: string
  ): boolean {
    if (instance.entityId.trim().toUpperCase() !== entity.entityKey.trim().toUpperCase()) return false;
    if (instance.metadata?.fddFleetGuardReceiptId !== receiptId || instance.metadata?.fddAuthorizationPolicy !== "fleetguard-v1") return false;
    if (instance.dependencies.length !== entity.bindings.length) return false;
    const byRole = new Map(instance.dependencies.map((dependency) => [dependency.role, dependency]));
    if (byRole.size !== entity.bindings.length) return false;
    return entity.bindings.every((binding) => {
      const dependency = byRole.get(binding.role);
      return Boolean(
        dependency
        && dependency.sourceType === "raw_point"
        && dependency.sourceId === binding.pointId
        && !dependency.pointName
        && dependency.objectRef === binding.objectRef
        && (dependency.unit ?? undefined) === (binding.unit ?? undefined)
        && dependency.metadata?.fddPointFamilyKey === binding.familyKey
        && dependency.metadata?.fddFleetGuardReceiptId === receiptId
      );
    });
  }

  function registerFleetGuardFddMetric(input: {
    projectId: string;
    userId: string;
    task: ProjectFddTask;
    check: FddDeployabilityCheck;
    parameterValues: FddTaskParameterValue[];
    plan: FleetGuardPlan;
    entity: FleetGuardPlan["entities"][number];
    receiptId: string;
    templateRef: NonNullable<FddFleetGuardAssessment["templateRef"]>;
  }): DerivedMetricInstance {
    const { task, entity } = input;
    options.fddTestHooks?.beforeRegisterMetric?.({
      projectId: input.projectId,
      algorithmKey: task.algorithmSnapshot.algorithmKey,
      entityId: entity.entityKey
    });
    const planFingerprint = JSON.stringify({
      policyVersion: input.plan.policyVersion,
      algorithmKey: task.algorithmSnapshot.algorithmKey,
      algorithmVersion: task.algorithmSnapshot.version,
      parameterSignature: fddFleetGuardParameterSignature(input.parameterValues),
      bindings: entity.bindings
    });
    const existing = derivedMetrics.lookup({
      projectId: input.projectId,
      metricKey: task.algorithmSnapshot.algorithmKey,
      entityId: entity.entityKey,
      limit: 1
    })[0];
    const preserveWatermark = existing?.metadata?.fddMaterializationPlanFingerprint === planFingerprint;
    const result = derivedMetrics.registerMetric({
      projectId: input.projectId,
      metricKey: task.algorithmSnapshot.algorithmKey,
      entityId: entity.entityKey,
      entityName: entity.entityKey.replace(/_/gu, "-"),
      displayName: task.algorithmSnapshot.name,
      metricType: "fdd",
      formulaVersion: task.algorithmSnapshot.version,
      formula: task.algorithmSnapshot.logicSummary,
      formulaDescription: task.algorithmSnapshot.logicSummary,
      dependencies: entity.bindings.map((binding) => ({
        role: binding.role,
        sourceType: "raw_point",
        sourceId: binding.pointId,
        objectRef: binding.objectRef,
        ...(binding.unit ? { unit: binding.unit } : {}),
        label: binding.role,
        metadata: {
          fddPointFamilyKey: binding.familyKey,
          fddFleetGuardReceiptId: input.receiptId
        }
      })),
      createdBy: input.userId,
      metadata: {
        fddTaskId: task.id,
        fddAlgorithmId: task.algorithmSnapshot.id,
        fddDeployabilityStatus: input.check.status,
        fddEntityDeployabilityStatus: entity.state,
        fddAuthorizationPolicy: "fleetguard-v1",
        fddFleetGuardReceiptId: input.receiptId,
        fddFleetGuardPlanId: input.plan.planId,
        fddFleetTemplateRef: input.templateRef,
        fddMaterializationPlanFingerprint: planFingerprint,
        fddParameters: input.parameterValues.map((parameter) => ({
          key: parameter.key,
          value: parameter.value,
          source: parameter.source
        }))
      }
    });
    if (existing && !preserveWatermark) derivedMetrics.clearHistory(result.instance.instanceId);
    configureFddMetricMaterialization(result.instance, task.algorithmSnapshot, Boolean(existing && !preserveWatermark));
    const registered = derivedMetrics.getInstance(result.instance.instanceId);
    if (!registered || !fleetGuardInstanceMatchesPlanEntity(registered, entity, input.receiptId)) {
      throw new Error(`fdd_fleetguard_runtime_plan_mismatch:${entity.entityKey}`);
    }
    return registered;
  }

  function deployFleetGuardFddTaskRuntime(input: {
    projectId: string;
    userId: string;
    task: ProjectFddTask;
    check: FddDeployabilityCheck;
    assessment: FddFleetGuardAssessment;
    submitted?: FleetGuardAuthorizationToken;
    /** Authoritative route target. Undefined means a prospective library task. */
    authorizationTaskId?: string;
    prospectiveTask?: boolean;
  }): {
    task: ProjectFddTask;
    instances: DerivedMetricInstance[];
    receipt?: FddDeploymentReceipt;
    error?: string;
    errorCode?: string;
  } {
    // Work on a detached value. A failed FleetGuard authorization or SQLite
    // transaction must leave the caller's authoritative SeedStore byte-for-byte
    // unchanged.
    const task = structuredClone(input.task);
    const { assessment } = input;
    const templateRef = assessment.templateRef;
    if (!templateRef) return { task, instances: [], errorCode: "template_mismatch", error: "A compatible locked fleet template is required." };
    const parameterValues = recommendFddTaskParameters(
      task.algorithmSnapshot,
      input.check,
      input.userId,
      task.parameterValues ?? []
    );
    const parameterSignature = fddFleetGuardParameterSignature(parameterValues);
    const validation = fleetGuardAuthorizationStillCurrent({
      projectId: input.projectId,
      algorithm: task.algorithmSnapshot,
      assessment,
      ...(input.submitted ? { submitted: input.submitted } : {}),
      ...(input.authorizationTaskId ? { taskId: input.authorizationTaskId } : {}),
      parameterSignature,
    });
    if (!validation.valid) {
      return {
        task,
        instances: [],
        ...(validation.code ? { errorCode: validation.code } : {}),
        error: validation.reason ?? "FleetGuard authorization is stale."
      };
    }
    if (assessment.plan.coverage.expected !== 8) {
      return { task, instances: [], errorCode: "fleet_coverage_incomplete", error: "The Element canary requires exactly 8 authorized chillers." };
    }
    const projectTasks = store.fddTasksByProject?.[input.projectId] ?? [];
    const currentTarget = projectTasks.find((entry) => entry.id === task.id);
    if (input.prospectiveTask) {
      const competingTask = projectTasks.find((entry) =>
        entry.algorithmSnapshot.algorithmKey === task.algorithmSnapshot.algorithmKey
      );
      if (input.authorizationTaskId || currentTarget || competingTask) {
        return { task, instances: [], errorCode: "task_mismatch", error: "The prospective FleetGuard task target changed." };
      }
    } else if (!input.authorizationTaskId || !currentTarget || currentTarget.id !== input.authorizationTaskId) {
      return { task, instances: [], errorCode: "task_mismatch", error: "The authoritative FleetGuard task no longer exists." };
    }
    const receiptId = `fddreceipt_${randomUUID()}`;
    const deployedAt = new Date().toISOString();
    const assertCommitInputsCurrent = (): ProjectFddTask | undefined => {
      const authoritativeAlgorithm = (store.fddAlgorithms ?? []).find((algorithm) =>
        algorithm.id === task.algorithmSnapshot.id
        || algorithm.algorithmKey === task.algorithmSnapshot.algorithmKey
      );
      if (
        !authoritativeAlgorithm
        || authoritativeAlgorithm.id !== task.algorithmSnapshot.id
        || authoritativeAlgorithm.algorithmKey !== task.algorithmSnapshot.algorithmKey
        || authoritativeAlgorithm.version !== task.algorithmSnapshot.version
        || fddFleetGuardAlgorithmEvidenceSignature({
          projectId: input.projectId,
          algorithm: authoritativeAlgorithm
        }) !== assessment.plan.signatures.algorithm
        || input.check.projectDataSignature !== fddProjectDataSignature(input.projectId)
        || input.check.equipmentInventorySignature !== currentFddEquipmentInventorySignatureSync(input.projectId)
      ) throw new Error("fdd_fleetguard_stale:authoritative_evidence_changed");

      const authoritativeTask = (store.fddTasksByProject?.[input.projectId] ?? [])
        .find((entry) => entry.id === task.id);
      const competingTask = input.prospectiveTask
        ? (store.fddTasksByProject?.[input.projectId] ?? []).find((entry) =>
            entry.algorithmSnapshot.algorithmKey === task.algorithmSnapshot.algorithmKey
          )
        : undefined;
      const authoritativeParameterSignature = fddFleetGuardParameterSignature(recommendFddTaskParameters(
        authoritativeAlgorithm,
        input.check,
        input.userId,
        authoritativeTask?.parameterValues ?? []
      ));
      const authoritativeTaskMismatch = input.prospectiveTask
        ? Boolean(authoritativeTask || competingTask)
        : !authoritativeTask
          || authoritativeTask.id !== input.authorizationTaskId
          || authoritativeTask.algorithmSnapshot.id !== task.algorithmSnapshot.id
          || authoritativeTask.algorithmSnapshot.algorithmKey !== task.algorithmSnapshot.algorithmKey
          || authoritativeTask.algorithmSnapshot.version !== task.algorithmSnapshot.version
          || fddFleetGuardAlgorithmEvidenceSignature({
            projectId: input.projectId,
            algorithm: authoritativeTask.algorithmSnapshot
          }) !== assessment.plan.signatures.algorithm;
      if (authoritativeTaskMismatch) throw new Error("fdd_fleetguard_stale:task_mismatch");
      if (authoritativeParameterSignature !== parameterSignature) {
        throw new Error("fdd_fleetguard_stale:parameter_signature_mismatch");
      }
      const finalValidation = fleetGuardAuthorizationStillCurrent({
        projectId: input.projectId,
        algorithm: authoritativeAlgorithm,
        assessment,
        ...(input.submitted ? { submitted: input.submitted } : {}),
        ...(input.authorizationTaskId ? { taskId: input.authorizationTaskId } : {}),
        parameterSignature
      });
      if (!finalValidation.valid) throw new Error(`fdd_fleetguard_stale:${finalValidation.code}`);
      return authoritativeTask;
    };
    let committed: { instances: DerivedMetricInstance[]; receipt: FddDeploymentReceipt };
    try {
      committed = derivedMetrics.runInTransaction(() => {
        // Last synchronous TOCTOU gate. There is deliberately no await from
        // here until receipt + all eight runtimes/materializations commit.
        const authoritativeTask = assertCommitInputsCurrent();
        const instances = assessment.plan.entities.map((entity) => registerFleetGuardFddMetric({
          projectId: input.projectId,
          userId: input.userId,
          task,
          check: input.check,
          parameterValues,
          plan: assessment.plan,
          entity,
          receiptId,
          templateRef
        }));
        if (instances.length !== 8 || new Set(instances.map((instance) => instance.entityId.trim().toUpperCase())).size !== 8) {
          throw new Error("fdd_fleetguard_runtime_coverage_mismatch");
        }
        const registration = fleetGuardEvaluatorRegistration(task.algorithmSnapshot.algorithmKey);
        if (!registration) throw new Error("fdd_fleetguard_evaluator_missing");
        const previousReceiptId = authoritativeTask?.activeDeploymentReceiptId;
        const committedTask: ProjectFddTask = {
          ...structuredClone(task),
          deployabilityCheck: structuredClone(input.check),
          status: "running",
          parameterValues: structuredClone(parameterValues),
          authorizationPolicy: "fleetguard-v1",
          activeDeploymentReceiptId: receiptId,
          updatedAt: deployedAt
        };
        const receipt: FddDeploymentReceipt = {
          receiptId,
          projectId: input.projectId,
          taskId: task.id,
          policyVersion: "fleetguard-v1",
          planId: assessment.plan.planId,
          planSignature: assessment.summary.planSignature,
          structuralPlanSignature: fleetGuardStructuralPlanSignature(assessment.plan),
          rolloutRevision: assessment.summary.rolloutRevision,
          templateRef,
          algorithm: {
            id: task.algorithmSnapshot.id,
            key: task.algorithmSnapshot.algorithmKey,
            version: task.algorithmSnapshot.version
          },
          evaluator: { id: registration.evaluatorId, version: registration.evaluatorVersion },
          signatures: {
            algorithm: assessment.plan.signatures.algorithm,
            evaluator: assessment.plan.signatures.evaluator,
            inventory: assessment.plan.signatures.inventory,
            evidence: assessment.plan.signatures.evidence,
            template: templateRef.signature,
            ...(assessment.plan.signatures.tool ? { tool: assessment.plan.signatures.tool } : {}),
            ...(assessment.plan.signatures.skill ? { skill: assessment.plan.signatures.skill } : {}),
            ...(assessment.plan.signatures.model ? { model: assessment.plan.signatures.model } : {})
          },
          entities: assessment.plan.entities.map((entity) => ({
            entityKey: entity.entityKey,
            instanceId: instances.find((instance) => instance.entityId === entity.entityKey)!.instanceId,
            bindings: entity.bindings.map((binding) => ({ ...binding }))
          })),
          parameterSignature,
          taskSnapshot: committedTask as unknown as Record<string, unknown>,
          ...(previousReceiptId ? { supersedesReceiptId: previousReceiptId } : {}),
          deployedAt,
          deployedBy: input.userId
        };
        options.fddTestHooks?.beforeInsertFleetGuardReceipt?.({ projectId: input.projectId, taskId: task.id, receiptId });
        // Test hooks and future synchronous adapters may touch authoritative
        // state. Recheck immediately before the immutable receipt insert.
        assertCommitInputsCurrent();
        derivedMetrics.insertFddDeploymentReceipt(receipt);
        options.fddTestHooks?.afterInsertFleetGuardReceipt?.({ projectId: input.projectId, taskId: task.id, receiptId });
        return { instances, receipt };
      });
    } catch (error) {
      return {
        task,
        instances: [],
        errorCode: "fdd_fleetguard_atomic_commit_failed",
        error: `FleetGuard Deploy All failed before commit; receipt and all runtime changes were rolled back (${error instanceof Error ? error.message : "registration failed"}).`
      };
    }
    task.deployabilityCheck = input.check;
    task.status = "running";
    task.parameterValues = parameterValues;
    task.authorizationPolicy = "fleetguard-v1";
    task.activeDeploymentReceiptId = committed.receipt.receiptId;
    task.updatedAt = deployedAt;
    upsertFddTask(input.projectId, task);
    // SQLite is authoritative. Only publish the SeedStore pointer after the
    // receipt and all eight runtime/materialization rows have committed.
    try {
      options.fddTestHooks?.beforeFleetGuardStorePersist?.({
        projectId: input.projectId,
        taskId: task.id,
        receiptId: committed.receipt.receiptId
      });
      persistNow();
    } catch {
      // The SQLite receipt is authoritative and contains a complete task
      // snapshot. Boot reconciliation repairs a failed SeedStore flush.
    }
    try {
      ensureFddDashboardForInstances(input.projectId, input.userId, task.algorithmSnapshot, committed.instances);
    } catch {
      // The SQLite receipt is authoritative; dashboard presentation is best effort.
    }
    scheduleFddRuntimeMaterialization(input.projectId, committed.instances);
    return { task, instances: committed.instances, receipt: committed.receipt };
  }

	  function fddDashboardBindingForMetric(instance: DerivedMetricInstance, algorithm: FddAlgorithm): DashboardPointBinding {
	    const fddParameters = Array.isArray(instance.metadata?.fddParameters)
	      ? instance.metadata.fddParameters.filter((parameter): parameter is Record<string, unknown> => isRecordValue(parameter))
	      : undefined;
	    return {
      source: "derived_metric",
	      metricInstanceId: instance.instanceId,
	      metricKey: instance.metricKey,
	      entityId: instance.entityId,
	      label: "Fault status",
	      role: "fault_status",
	      dependencyRole: "output",
	      defaultVisible: true,
	      groupId: instance.entityName ?? instance.entityId,
	      unit: instance.unit ?? "boolean",
	      description: algorithm.logicSummary || instance.formulaDescription || instance.displayName,
	      ...(fddParameters ? { fddParameters } : {})
	    };
	  }

	  function fddDashboardWidgetSuffix(entityId: string): string {
	    return entityId.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "") || "entity";
	  }

	  function fddDashboardMutationInput(projectId: string, algorithm: FddAlgorithm, instances: DerivedMetricInstance[]): DashboardMutationInput | null {
	    if (instances.length === 0) return null;
	    const outputBindings = instances.map((instance) => fddDashboardBindingForMetric(instance, algorithm));
	    const widgets = [
	      ...instances.map((instance) => {
	        const suffix = fddDashboardWidgetSuffix(instance.entityId);
	        return {
	          id: `fdd_status_${suffix}`,
	          kind: "status_grid",
	          title: instance.entityName ?? instance.entityId,
	          pointBindings: [fddDashboardBindingForMetric(instance, algorithm)]
	        };
	      }),
		      {
		        id: "fdd_attribution_analysis",
		        kind: "fdd_attribution_analysis",
		        title: FDD_ANALYSIS_TITLE,
		        pointBindings: outputBindings,
		        defaultTimeRange: FDD_ANALYSIS_RANGE
		      },
	      ...instances.map((instance) => {
	        const suffix = fddDashboardWidgetSuffix(instance.entityId);
	        return {
	          id: `${suffix}_trend`,
	          kind: "timeseries_chart",
	          title: `${instance.entityName ?? instance.entityId} Trend`,
	          pointBindings: [fddDashboardBindingForMetric(instance, algorithm)],
	          defaultTimeRange: "24h"
	        };
	      }),
	      {
	        id: "fdd_detection_logic",
	        kind: "note",
	        title: "Detection Logic",
	        content: algorithm.logicSummary,
	        tone: "blue",
	        pointBindings: []
	      }
	    ];
	    const normalized = normalizeDashboardCreateArgs({
	      title: `${algorithm.name} Dashboard`,
	      description: `Runtime FDD dashboard for ${algorithm.name}.`,
	      visibility: "project",
	      widgets,
	      includeOverview: false,
	      includeTrends: false
	    }, derivedMetrics, projectId);
	    const parsed = parseDashboardMutationInput(normalized);
	    return "error" in parsed ? null : parsed;
	  }

	  function ensureFddDashboardForInstances(projectId: string, userId: string, algorithm: FddAlgorithm, instances: DerivedMetricInstance[]): DashboardRecord | null {
	    if (instances.length === 0) return null;
	    const input = fddDashboardMutationInput(projectId, algorithm, instances);
	    if (!input) return null;
	    store.dashboardsByProject ??= {};
	    const dashboards = store.dashboardsByProject[projectId] ?? [];
	    const existing = dashboards.find((dashboard) => dashboard.title === input.title);
	    if (existing) {
	      const updated = updateDashboardRecord(existing, input);
	      store.dashboardsByProject[projectId] = sortedDashboards(dashboards.map((dashboard) => dashboard.id === updated.id ? updated : dashboard));
	      broadcastToProject(projectId, { type: "dashboard_updated", projectId, dashboard: updated });
	      return updated;
	    }
	    const dashboard = createDashboardRecord(input, projectId, userId);
	    store.dashboardsByProject[projectId] = sortedDashboards([dashboard, ...dashboards]);
	    broadcastToProject(projectId, { type: "dashboard_created", projectId, dashboard });
	    return dashboard;
	  }

  function configureFddMetricMaterialization(
    instance: DerivedMetricInstance,
    algorithm: FddAlgorithm,
    resetWatermark = false
  ): DerivedMetricMaterialization | null {
    if (!isExecutableFddAlgorithm(algorithm)) return null;
    return derivedMetrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: true,
      intervalSeconds: FDD_DEFAULT_INTERVAL_SECONDS,
      lookbackSeconds: FDD_DEFAULT_BACKFILL_SECONDS,
      formulaKind: "fdd_rule",
      invalidValuePolicy: "null",
      alignmentPolicy: DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
      alignmentToleranceSeconds: FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS,
      resetWatermark,
      status: "active",
      nextRunAt: new Date().toISOString(),
      lastError: null
    });
  }

  function fddMaterializationPlanFingerprint(
    algorithm: FddAlgorithm,
    selectedMappings: FddPointMapping[],
    parameterValues: FddTaskParameterValue[]
  ): string {
    return JSON.stringify({
      algorithmKey: algorithm.algorithmKey,
      version: algorithm.version,
      logicSummary: algorithm.logicSummary,
      dependencies: selectedMappings
        .map((mapping) => ({
          role: mapping.slot,
          sourceType: "raw_point",
          sourceId: mapping.pointName,
          pointName: mapping.pointName,
          objectRef: mapping.objectRef ?? null,
          unit: mapping.unit ?? null
        }))
        .sort((left, right) => left.role.localeCompare(right.role)),
      parameters: parameterValues
        .map((parameter) => ({ key: parameter.key, value: parameter.value }))
        .sort((left, right) => left.key.localeCompare(right.key))
    });
  }

  function fddInstanceMatchesEntityPlan(instance: DerivedMetricInstance, entity: FddEntityDeployability): boolean {
    if (normalizeFddEntityAlias(instance.entityId) !== normalizeFddEntityAlias(entity.entityKey)) return false;
    if (instance.dependencies.length !== entity.selectedMappings.length) return false;
    const dependencyByRole = new Map(instance.dependencies.map((dependency) => [dependency.role, dependency]));
    if (dependencyByRole.size !== entity.selectedMappings.length) return false;
    return entity.selectedMappings.every((mapping) => {
      const dependency = dependencyByRole.get(mapping.slot);
      return Boolean(
        dependency
        && dependency.sourceType === "raw_point"
        && dependency.sourceId === mapping.pointName
        && dependency.pointName === mapping.pointName
        && (dependency.objectRef ?? undefined) === (mapping.objectRef ?? undefined)
        && (dependency.unit ?? undefined) === (mapping.unit ?? undefined)
      );
    });
  }

  function derivedMetricExecutionPlanSignature(instance: DerivedMetricInstance): string {
    return JSON.stringify({
      formulaVersion: instance.formulaVersion,
      formula: instance.formula,
      fddMaterializationPlanFingerprint: instance.metadata?.fddMaterializationPlanFingerprint ?? null,
      dependencies: instance.dependencies
        .map((dependency) => ({
          role: dependency.role,
          sourceType: dependency.sourceType,
          sourceId: dependency.sourceId,
          pointName: dependency.pointName ?? null,
          objectRef: dependency.objectRef ?? null,
          unit: dependency.unit ?? null
        }))
        .sort((left, right) => left.role.localeCompare(right.role))
    });
  }

  function derivedMetricExecutionPlanIsCurrent(instanceId: string, expectedSignature: string): boolean {
    const current = derivedMetrics.getInstance(instanceId);
    const materialization = derivedMetrics.readMaterialization(instanceId);
    return Boolean(
      current
      && materialization?.enabled
      && derivedMetricExecutionPlanSignature(current) === expectedSignature
    );
  }

  function isMissingDerivedMetricError(error: unknown): boolean {
    return error instanceof Error && error.message === "derived_metric_instance_not_found";
  }

  function scheduleFddRuntimeMaterialization(projectId: string, instances: DerivedMetricInstance[]): void {
    if (instances.length === 0 || materializerDisabled) return;
    setTimeout(() => {
      void materializeFddRuntimeInstances(projectId, instances).catch((error) => {
        if (isMissingDerivedMetricError(error)) return;
        console.warn("[fdd-materializer] background materialization failed", error);
      });
    }, 0);
  }

  async function materializeFddRuntimeInstances(projectId: string, instances: DerivedMetricInstance[]): Promise<void> {
    const materializations = instances
      .map((instance) => derivedMetrics.readMaterialization(instance.instanceId))
      .filter((materialization): materialization is DerivedMetricMaterialization => Boolean(materialization));
    if (materializations.length === 0) return;
    const prevalidatedFleetGuardReceipts = await prevalidateFleetGuardMaterializationBatch(instances);
    let touched = false;
    await mapWithConcurrency(materializations, 2, async (materialization) => {
      if (!derivedMetrics.getInstance(materialization.instanceId)) return;
      try {
        await materializeDerivedMetricInstanceSingleflight(materialization.instanceId, false, prevalidatedFleetGuardReceipts);
        touched = true;
      } catch (error) {
        if (isMissingDerivedMetricError(error)) return;
        throw error;
      }
    });
    if (touched) {
      broadcastToProject(projectId, { type: "derived_metrics_updated", projectId });
    }
  }

  function registerFddDerivedMetric(projectId: string, userId: string, algorithm: FddAlgorithm, check: FddDeployabilityCheck, parameterValues: FddTaskParameterValue[] = [], projectTaskId?: string, entity?: FddEntityDeployability): DerivedMetricInstance | null {
    const requiredSlots = new Set(check.requiredRuntimeSlots?.length
      ? check.requiredRuntimeSlots
      : algorithm.requiredPoints.filter((point) => point.required).map((point) => point.slot));
    const selectedMappings = (entity?.selectedMappings ?? check.selectedMappings ?? []);
    const requiredMappings = selectedMappings.filter((mapping) => requiredSlots.has(mapping.slot));
    if (!isExecutableFddAlgorithm(algorithm) || selectedMappings.length === 0) return null;
    if (requiredMappings.length === 0) return null;
    const entityId = entity?.entityKey ?? check.exampleEntityKey ?? `${algorithm.equipmentType}_fdd`;
    if (requiredMappings.length !== requiredSlots.size) return null;
    options.fddTestHooks?.beforeRegisterMetric?.({ projectId, algorithmKey: algorithm.algorithmKey, entityId });
    const planFingerprint = fddMaterializationPlanFingerprint(algorithm, selectedMappings, parameterValues);
    const existingInstance = derivedMetrics.lookup({ projectId, metricKey: algorithm.algorithmKey, entityId, limit: 1 })[0];
    const preserveWatermark = Boolean(
      existingInstance
      && existingInstance.metadata?.fddMaterializationPlanFingerprint === planFingerprint
    );
    const result = derivedMetrics.registerMetric({
        projectId,
        metricKey: algorithm.algorithmKey,
        entityId,
        entityName: entityId.replace(/_/gu, "-"),
        displayName: algorithm.name,
        metricType: "fdd",
        formulaVersion: algorithm.version,
        formula: algorithm.logicSummary,
        formulaDescription: algorithm.logicSummary,
        dependencies: selectedMappings.map((mapping) => ({
          role: mapping.slot,
          sourceType: "raw_point",
          sourceId: mapping.pointName,
          pointName: mapping.pointName,
          ...(mapping.objectRef ? { objectRef: mapping.objectRef } : {}),
          ...(mapping.unit ? { unit: mapping.unit } : {}),
          label: mapping.slot
        })),
        createdBy: userId,
        metadata: {
          ...(projectTaskId ? { fddTaskId: projectTaskId } : {}),
          fddAlgorithmId: algorithm.id,
          // An explicit marker lets boot reconciliation distinguish a
          // committed v4 redeploy from a damaged FleetGuard receipt link.
          fddAuthorizationPolicy: "v4",
          fddDeployabilityStatus: check.status,
          fddEntityDeployabilityStatus: entity?.status ?? check.status,
          fddBuildingGptSkillId: check.agentWorkflow?.skillId,
          fddGroundingRuleIds: (check.agentWorkflow?.groundingRules ?? []).map((rule) => rule.id),
          fddMaterializationPlanFingerprint: planFingerprint,
          fddParameters: parameterValues.map((parameter) => ({
            key: parameter.key,
            value: parameter.value,
            source: parameter.source
          }))
	        }
	    });
	    const resetRuntimeHistory = Boolean(existingInstance && !preserveWatermark);
	    if (resetRuntimeHistory) derivedMetrics.clearHistory(result.instance.instanceId);
	    configureFddMetricMaterialization(result.instance, algorithm, resetRuntimeHistory);
	    return result.instance;
  }

  function materializerDependencyForRole(
    instance: DerivedMetricInstance,
    role: string,
    fallbackIndex: number
  ): DerivedMetricInstance["dependencies"][number] | null {
    return instance.dependencies.find((dependency) => dependency.role === role)
      ?? instance.dependencies[fallbackIndex]
      ?? null;
  }

  async function readMaterializerDependencySeries(
    projectId: string,
    dependency: DerivedMetricInstance["dependencies"][number],
    from: string,
    to: string,
    limit: number
  ): Promise<Map<string, number>> {
    const pageLimit = Math.min(Math.max(1, limit), FDD_MATERIALIZER_MAX_QUERY_LIMIT);
    const endMs = Date.parse(to);
    if (!Number.isFinite(endMs)) throw new Error("fdd_materializer_invalid_read_window");
    if (dependency.sourceType === "metric") {
      const dependencyInstance = derivedMetrics.getInstance(dependency.sourceId);
      if (!dependencyInstance) return new Map();
      const series = new Map<string, number>();
      let pageFrom = from;
      for (let page = 0; page < FDD_MATERIALIZER_MAX_QUERY_PAGES; page += 1) {
        const samples = derivedMetrics.readHistory(dependencyInstance.instanceId, {
          from: pageFrom,
          to,
          limit: pageLimit,
          order: "asc"
        });
        for (const [ts, value] of materializerSeriesFromSamples(samples)) series.set(ts, value);
        if (samples.length < pageLimit) return series;
        const lastMs = Date.parse(samples[samples.length - 1]!.ts);
        const pageFromMs = Date.parse(pageFrom);
        if (!Number.isFinite(lastMs) || !Number.isFinite(pageFromMs) || lastMs < pageFromMs) {
          throw new Error("fdd_materializer_pagination_stalled");
        }
        if (lastMs >= endMs) return series;
        pageFrom = new Date(lastMs + 1).toISOString();
      }
      throw new Error("fdd_materializer_pagination_limit_exceeded");
    }

    const access = resolveProjectBmsAccess(projectId);
    if (!access.ok) return new Map();
    const series = new Map<string, number>();
    let pageFrom = from;
    for (let page = 0; page < FDD_MATERIALIZER_MAX_QUERY_PAGES; page += 1) {
      const params: Record<string, string> = {
        from: pageFrom,
        to,
        limit: String(pageLimit),
        order: "asc"
      };
      if (dependency.pointName) {
        params.name = dependency.pointName;
      } else if (dependency.objectRef) {
        params.object_ref = dependency.objectRef;
      } else {
        params.name = dependency.sourceId;
      }
      const result = await fetchTimeseries(
        access.baseUrl,
        params,
        fetchProxy as typeof fetch,
        { preferReadings: true }
      );
      for (const [ts, value] of materializerSeriesFromRows(result.items)) series.set(ts, value);
      if (result.items.length === 0) return series;
      const lastMs = Date.parse(result.items[result.items.length - 1]!.ts);
      const pageFromMs = Date.parse(pageFrom);
      if (!Number.isFinite(lastMs) || !Number.isFinite(pageFromMs) || lastMs < pageFromMs) {
        throw new Error("fdd_materializer_pagination_stalled");
      }
      const responseIsComplete = result.total <= result.items.length && result.items.length < pageLimit;
      if (responseIsComplete || lastMs >= endMs) return series;
      // BMS point histories are unique by point/timestamp. Move one millisecond
      // past the inclusive boundary so replay pages remain idempotent.
      pageFrom = new Date(lastMs + 1).toISOString();
    }
    throw new Error("fdd_materializer_pagination_limit_exceeded");
  }

  function fddSampleHasDurableEvaluationState(sample: DerivedMetricSample): boolean {
    const derived = sample.metadata?.derivedValues;
    return isRecordValue(derived) && Object.keys(derived).some((key) =>
      key.startsWith("edgeEvent") || key.startsWith("conditionPersistence")
    );
  }

  function readPreviousFddEvaluationSample(instanceId: string, upperBoundMs: number): DerivedMetricSample | undefined {
    let pageToMs = upperBoundMs;
    let latestFallback: DerivedMetricSample | undefined;
    for (let page = 0; page < FDD_STATE_LOOKBACK_MAX_PAGES; page += 1) {
      const samples = derivedMetrics.readHistory(instanceId, {
        to: new Date(pageToMs).toISOString(),
        limit: FDD_STATE_LOOKBACK_PAGE_SIZE,
        order: "desc"
      });
      latestFallback ??= samples[0];
      const stateful = samples.find(fddSampleHasDurableEvaluationState);
      if (stateful) return stateful;
      if (samples.length < FDD_STATE_LOOKBACK_PAGE_SIZE) return latestFallback;
      const oldestMs = Date.parse(samples[samples.length - 1]!.ts);
      if (!Number.isFinite(oldestMs) || oldestMs >= pageToMs || oldestMs <= 0) {
        return latestFallback;
      }
      // History bounds are inclusive; step behind the oldest row to guarantee
      // progress and avoid replaying a full page forever.
      pageToMs = oldestMs - 1;
    }
    return latestFallback;
  }

  function fddRuntimeMatchesRefreshedCheck(
    projectId: string,
    task: ProjectFddTask,
    check: FddDeployabilityCheck
  ): boolean {
    if (!fddCheckHasEntityCoverage(check, task.algorithmSnapshot)) return false;
    const plannedByEntity = new Map((check.deployableEntities ?? [])
      .filter((entity) => entity.status === "can_deploy")
      .map((entity) => [normalizeFddEntityAlias(entity.entityKey), entity]));
    const instances = fddRuntimeInstancesForTask(projectId, task);
    if (instances.length !== plannedByEntity.size || instances.length === 0) return false;
    return instances.every((instance) => {
      const plan = plannedByEntity.get(normalizeFddEntityAlias(instance.entityId));
      return Boolean(plan && fddInstanceMatchesEntityPlan(instance, plan));
    });
  }

  function applyFddTaskAuthorizationResult(
    projectId: string,
    task: ProjectFddTask,
    check: FddDeployabilityCheck,
    authorized: boolean,
    blocker?: string
  ): void {
    const runtimeInstances = fddRuntimeInstancesForTask(projectId, task);
    derivedMetrics.runInTransaction(() => {
      for (const runtimeInstance of runtimeInstances) {
        const materialization = derivedMetrics.readMaterialization(runtimeInstance.instanceId);
        if (!materialization) continue;
        derivedMetrics.configureMaterialization({
          instanceId: runtimeInstance.instanceId,
          enabled: authorized,
          status: authorized ? "active" : "authorization_required",
          lastError: authorized ? null : blocker ?? "fdd_authorization_auto_recheck_failed",
          ...(authorized ? { nextRunAt: new Date().toISOString() } : {})
        });
      }
    });
    task.deployabilityCheck = check;
    task.status = authorized ? (runtimeInstances.length > 0 ? "running" : "ready") : "cannot_deploy";
    task.updatedAt = new Date().toISOString();
    upsertFddTask(projectId, task);
    persistSoon();
    broadcastToProject(projectId, { type: "fdd_tasks_updated", projectId });
  }

  function stopFleetGuardReceiptRuntime(
    task: ProjectFddTask,
    receipt: FddDeploymentReceipt,
    blocker: string
  ): void {
    const instances = receipt.entities
      .map((entity) => derivedMetrics.getInstance(entity.instanceId))
      .filter((instance): instance is DerivedMetricInstance => Boolean(instance));
    derivedMetrics.runInTransaction(() => {
      for (const instance of instances) {
        const materialization = derivedMetrics.readMaterialization(instance.instanceId);
        if (!materialization) continue;
        derivedMetrics.configureMaterialization({
          instanceId: instance.instanceId,
          enabled: false,
          status: "authorization_required",
          lastError: blocker
        });
      }
    });
    task.status = "cannot_deploy";
    task.updatedAt = new Date().toISOString();
    upsertFddTask(task.projectId, task);
    persistSoon();
    broadcastToProject(task.projectId, { type: "fdd_tasks_updated", projectId: task.projectId });
  }

  function fleetGuardReceiptExecutionIsCurrent(
    task: ProjectFddTask,
    receipt: FddDeploymentReceipt
  ): boolean {
    const authoritativeTask = (store.fddTasksByProject?.[task.projectId] ?? [])
      .find((candidate) => candidate.id === task.id);
    if (
      !authoritativeTask
      || authoritativeTask.authorizationPolicy !== "fleetguard-v1"
      || authoritativeTask.activeDeploymentReceiptId !== receipt.receiptId
    ) return false;
    const instances = fleetGuardRuntimeForReceipt(receipt);
    return Boolean(instances && instances.every((instance) => derivedMetrics.readMaterialization(instance.instanceId)?.enabled));
  }

  function refreshFleetGuardReceiptAuthorization(
    task: ProjectFddTask,
    receipt: FddDeploymentReceipt
  ): Promise<boolean> {
    const runKey = `${task.projectId}:${task.id}:${receipt.receiptId}`;
    const existing = fddFleetGuardRuntimeAuthorizationRuns.get(runKey);
    if (existing) return existing;
    const run = (async (): Promise<boolean> => {
      let blocker = "fdd_fleetguard_runtime_evidence_changed";
      try {
        const templateVersion = fddFleetTemplateVersionByRef(
          store,
          receipt.projectId,
          receipt.templateRef.templateId,
          receipt.templateRef.version
        );
        const registration = fleetGuardEvaluatorRegistration(task.algorithmSnapshot.algorithmKey);
        if (
          !templateVersion
          || templateVersion.state !== "locked"
          || templateVersion.signature !== receipt.templateRef.signature
          || task.algorithmSnapshot.id !== receipt.algorithm.id
          || task.algorithmSnapshot.algorithmKey !== receipt.algorithm.key
          || task.algorithmSnapshot.version !== receipt.algorithm.version
          || registration?.evaluatorId !== receipt.evaluator.id
          || registration.evaluatorVersion !== receipt.evaluator.version
          || fddFleetGuardParameterSignature(recommendFddTaskParameters(
            task.algorithmSnapshot,
            task.deployabilityCheck,
            receipt.deployedBy,
            task.parameterValues ?? []
          )) !== receipt.parameterSignature
          || !fleetGuardRuntimeForReceipt(receipt)
        ) {
          blocker = "fdd_fleetguard_historical_receipt_invalid";
          throw new Error(blocker);
        }
        const context = await buildFddEntityContext(task.projectId);
        const inventory = fddEquipmentAvailabilityFromContext(context);
        const refreshedCheck = await runFddDeployabilityCheck(
          task.projectId,
          receipt.deployedBy,
          task.algorithmSnapshot,
          "auto",
          task.id,
          context,
          inventory,
          true,
          { templateVersion, rolloutRevision: receipt.rolloutRevision }
        );
        const assessment = fleetGuardAssessmentsByCheck.get(refreshedCheck);
        if (!assessment) {
          blocker = "fdd_fleetguard_runtime_assessment_missing";
          throw new Error(blocker);
        }
        if (
          assessment.plan.state !== "ready"
          || assessment.plan.coverage.expected !== 8
          || assessment.plan.coverage.bound !== 8
          || assessment.plan.coverage.dataReady !== 8
          || assessment.plan.coverage.authorized !== 8
        ) {
          blocker = `fdd_fleetguard_runtime_plan_not_ready:${assessment.plan.primaryBlocker?.code ?? "coverage"}`;
          throw new Error(blocker);
        }
        if (fleetGuardStructuralPlanSignature(assessment.plan) !== receipt.structuralPlanSignature) {
          blocker = "fdd_fleetguard_runtime_structural_plan_changed";
          throw new Error(blocker);
        }
        if (
          assessment.plan.signatures.algorithm !== receipt.signatures.algorithm
          || assessment.plan.signatures.evaluator !== receipt.signatures.evaluator
          || assessment.plan.signatures.template !== receipt.signatures.template
        ) {
          blocker = "fdd_fleetguard_runtime_contract_signature_changed";
          throw new Error(blocker);
        }
        if (!fleetGuardReceiptExecutionIsCurrent(task, receipt)) {
          blocker = "fdd_fleetguard_runtime_receipt_rows_changed";
          throw new Error(blocker);
        }
        return true;
      } catch {
        const authoritativeTask = (store.fddTasksByProject?.[task.projectId] ?? [])
          .find((candidate) => candidate.id === task.id);
        if (
          authoritativeTask?.authorizationPolicy === "fleetguard-v1"
          && authoritativeTask.activeDeploymentReceiptId === receipt.receiptId
        ) {
          stopFleetGuardReceiptRuntime(authoritativeTask, receipt, blocker);
        }
        return false;
      }
    })().finally(() => {
      fddFleetGuardRuntimeAuthorizationRuns.delete(runKey);
    });
    fddFleetGuardRuntimeAuthorizationRuns.set(runKey, run);
    return run;
  }

  async function prevalidateFleetGuardMaterializationBatch(
    instances: DerivedMetricInstance[]
  ): Promise<Set<string>> {
    const receipts = new Map<string, FddDeploymentReceipt>();
    for (const instance of instances) {
      if (instance.metadata?.fddAuthorizationPolicy !== "fleetguard-v1") continue;
      const receiptId = typeof instance.metadata?.fddFleetGuardReceiptId === "string"
        ? instance.metadata.fddFleetGuardReceiptId
        : undefined;
      const receipt = receiptId ? derivedMetrics.getFddDeploymentReceipt(receiptId) : null;
      if (receipt) receipts.set(receipt.receiptId, receipt);
    }
    const validated = new Set<string>();
    for (const receipt of receipts.values()) {
      const task = (store.fddTasksByProject?.[receipt.projectId] ?? [])
        .find((candidate) => candidate.id === receipt.taskId);
      if (
        task?.authorizationPolicy === "fleetguard-v1"
        && task.activeDeploymentReceiptId === receipt.receiptId
        && await refreshFleetGuardReceiptAuthorization(task, receipt)
      ) validated.add(receipt.receiptId);
    }
    return validated;
  }

  function refreshExpiredFddTaskAuthorization(
    projectId: string,
    userId: string,
    task: ProjectFddTask
  ): Promise<boolean> {
    const runKey = `${projectId}:${task.id}`;
    const existingRun = fddTaskAuthorizationRefreshRuns.get(runKey);
    if (existingRun) return existingRun;
    const run = (async (): Promise<boolean> => {
      try {
        const context = await buildFddEntityContext(projectId);
        const inventory = fddEquipmentAvailabilityFromContext(context);
        const refreshedCheck = await runFddDeployabilityCheck(
          projectId,
          userId,
          task.algorithmSnapshot,
          "auto",
          task.id,
          context,
          inventory
        );
        const inventorySignature = fddEquipmentInventorySignature(context, inventory);
        const authorized = refreshedCheck.status === "can_deploy"
          && fddCheckMatchesCurrentPolicy(refreshedCheck)
          && fddCheckIsFresh(refreshedCheck)
          && fddCheckMatchesAlgorithm(refreshedCheck, task.algorithmSnapshot)
          && fddCheckMatchesCurrentProjectSignature(projectId, refreshedCheck)
          && refreshedCheck.equipmentInventorySignature === inventorySignature
          && fddRuntimeMatchesRefreshedCheck(projectId, task, refreshedCheck);
        if (authorized) {
          applyFddTaskAuthorizationResult(projectId, task, refreshedCheck, true);
          options.fddTestHooks?.onAuthorizationRefresh?.({ projectId, taskId: task.id });
          return true;
        }
        const blocker = "Automatic FDD authorization refresh did not reproduce the complete deployed fleet and exact dependency plan.";
        const blockedCheck: FddDeployabilityCheck = {
          ...refreshedCheck,
          status: "cannot_deploy",
          historyIssues: [...new Set([...refreshedCheck.historyIssues, blocker])]
        };
        persistFddDeployabilityCheck(projectId, blockedCheck, task.id);
        applyFddTaskAuthorizationResult(projectId, task, blockedCheck, false, "fdd_authorization_refresh_plan_mismatch");
        options.fddTestHooks?.onAuthorizationRefresh?.({ projectId, taskId: task.id });
        return false;
      } catch (error) {
        const blocker = `Automatic FDD authorization refresh failed: ${error instanceof Error ? error.message : "unknown error"}.`;
        const previousCheck = task.deployabilityCheck;
        if (previousCheck) {
          const blockedCheck: FddDeployabilityCheck = {
            ...previousCheck,
            status: "cannot_deploy",
            checkedAt: new Date().toISOString(),
            historyIssues: [...new Set([...previousCheck.historyIssues, blocker])]
          };
          persistFddDeployabilityCheck(projectId, blockedCheck, task.id);
          applyFddTaskAuthorizationResult(projectId, task, blockedCheck, false, "fdd_authorization_auto_recheck_failed");
        }
        options.fddTestHooks?.onAuthorizationRefresh?.({ projectId, taskId: task.id });
        return false;
      }
    })().finally(() => {
      fddTaskAuthorizationRefreshRuns.delete(runKey);
    });
    fddTaskAuthorizationRefreshRuns.set(runKey, run);
    return run;
  }

  async function materializeFddRuleMetricInstance(
    instance: DerivedMetricInstance,
    materialization: DerivedMetricMaterialization,
    expectedPlanSignature: string,
    prevalidatedFleetGuardReceipts?: ReadonlySet<string>
  ): Promise<void> {
    const taskId = typeof instance.metadata?.fddTaskId === "string" ? instance.metadata.fddTaskId : undefined;
    const algorithmId = typeof instance.metadata?.fddAlgorithmId === "string" ? instance.metadata.fddAlgorithmId : undefined;
    const task = (store.fddTasksByProject?.[instance.projectId] ?? []).find((candidate) =>
      (taskId ? candidate.id === taskId : false)
      || (!taskId && algorithmId ? candidate.algorithmSnapshot.id === algorithmId || candidate.globalAlgorithmId === algorithmId : false)
    );
    const receiptId = typeof instance.metadata?.fddFleetGuardReceiptId === "string"
      ? instance.metadata.fddFleetGuardReceiptId
      : undefined;
    const usesFleetGuard = instance.metadata?.fddAuthorizationPolicy === "fleetguard-v1";
    if (usesFleetGuard) {
      const receipt = receiptId ? derivedMetrics.getFddDeploymentReceipt(receiptId) : null;
      if (
        !task
        || task.authorizationPolicy !== "fleetguard-v1"
        || task.activeDeploymentReceiptId !== receiptId
        || !receipt
        || receipt.taskId !== task.id
        || (!prevalidatedFleetGuardReceipts?.has(receipt.receiptId)
          && !await refreshFleetGuardReceiptAuthorization(task, receipt))
      ) {
        const activeReceipt = task?.activeDeploymentReceiptId
          ? derivedMetrics.getFddDeploymentReceipt(task.activeDeploymentReceiptId)
          : null;
        if (task && activeReceipt && activeReceipt.taskId === task.id) {
          stopFleetGuardReceiptRuntime(task, activeReceipt, "fdd_fleetguard_runtime_receipt_mismatch");
        }
        return;
      }
    }
    let check = task?.deployabilityCheck;
    let automaticRefreshFailed = false;
    if (!usesFleetGuard && task && check && !fddCheckIsFresh(check) && isExecutableFddAlgorithm(task.algorithmSnapshot)) {
      const refreshed = await refreshExpiredFddTaskAuthorization(
        instance.projectId,
        instance.createdBy ?? "buildinggpt-system",
        task
      );
      check = task.deployabilityCheck;
      automaticRefreshFailed = !refreshed;
    }
    if (!derivedMetricExecutionPlanIsCurrent(instance.instanceId, expectedPlanSignature)) return;
    const hasCurrentBmsSource = projectBmsSources(instance.projectId).length > 0;
    const currentlyAuthorized = usesFleetGuard
      ? Boolean(task && receiptId && task.activeDeploymentReceiptId === receiptId)
      : Boolean(
          task
          && check
          && isExecutableFddAlgorithm(task.algorithmSnapshot)
          && check.status === "can_deploy"
          && fddCheckMatchesCurrentPolicy(check)
          && fddCheckIsFresh(check)
          && (!hasCurrentBmsSource || fddCheckMatchesCurrentProjectSignature(instance.projectId, check))
          && fddCheckMatchesAlgorithm(check, task.algorithmSnapshot)
          && fddCheckHasEntityCoverage(check, task.algorithmSnapshot)
          && check.equipmentInventorySignature === currentFddEquipmentInventorySignatureSync(instance.projectId)
        );
    if (!currentlyAuthorized) {
      if (task && (task.status === "running" || task.status === "ready")) {
        task.status = "checking";
        task.updatedAt = new Date().toISOString();
      }
      derivedMetrics.configureMaterialization({
        instanceId: materialization.instanceId,
        enabled: false,
        status: "authorization_required",
        lastError: automaticRefreshFailed
          ? "fdd_authorization_auto_recheck_failed"
          : "fdd_equipment_inventory_revalidation_required"
      });
      persistSoon();
      return;
    }
    if (instance.dependencies.length === 0) {
      throw new Error("fdd_materializer_dependencies_not_found");
    }
    const toMs = Date.now();
    const alignmentToleranceSeconds = materialization.alignmentToleranceSeconds ?? FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS;
    const readWindow = fddMaterializerReadWindow(instance, materialization, toMs);
    const { from, to, limit } = readWindow;
    const toleranceMs = alignmentToleranceSeconds * 1000;
    const seriesEntries = await Promise.all(instance.dependencies.map(async (dependency) => ({
      role: dependency.role,
      dependency,
      points: materializerSortedSeries(await readMaterializerDependencySeries(instance.projectId, dependency, from, to, limit))
    })));
    // A redeploy can replace dependencies/parameters while remote history is
    // in flight. Never let an obsolete execution plan repopulate samples or a
    // watermark that the redeploy transaction deliberately cleared.
    if (!derivedMetricExecutionPlanIsCurrent(instance.instanceId, expectedPlanSignature)) return;
    if (usesFleetGuard) {
      const receipt = receiptId ? derivedMetrics.getFddDeploymentReceipt(receiptId) : null;
      if (!task || !receipt || !fleetGuardReceiptExecutionIsCurrent(task, receipt)) return;
    }
    const seriesByRole = new Map(seriesEntries.map((entry) => [entry.role, entry.points]));
    const anchor = [...seriesEntries].sort((left, right) => right.points.length - left.points.length)[0];
    const calculationRunId = `fdd-materializer:${instance.instanceId}`;

    if (!anchor || anchor.points.length === 0) {
      derivedMetrics.recordSample({
        instanceId: instance.instanceId,
        ts: to,
        valueText: "no_data",
        quality: "invalid",
        status: "not_calculable",
        calculationRunId,
        sourceWindowStart: from,
        sourceWindowEnd: to,
        metadata: {
          formulaKind: "fdd_rule",
          materialized: true,
          invalidReason: "no_input_timeseries",
          alignmentToleranceSeconds,
          incrementalRead: readWindow.incremental,
          queryLimit: limit
        }
      });
      derivedMetrics.configureMaterialization({
        instanceId: instance.instanceId,
        enabled: true,
        formulaKind: "fdd_rule",
        invalidValuePolicy: materializerInvalidPolicy(materialization),
        alignmentPolicy: DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
        alignmentToleranceSeconds,
        lastRunAt: to,
        nextRunAt: new Date(toMs + materialization.intervalSeconds * 1000).toISOString(),
        status: "active",
        lastError: null
      });
      options.fddTestHooks?.onFddMaterialized?.({ projectId: instance.projectId, instanceId: instance.instanceId });
      return;
    }

    const evaluationAnchorPoints = readWindow.incremental && typeof readWindow.watermarkMs === "number"
      ? anchor.points.filter((point) => point.ms > readWindow.watermarkMs!)
      : anchor.points;
    if (evaluationAnchorPoints.length === 0) {
      // The replay range supplied dependency context, but there is no sample
      // newer than the durable watermark. Do not double-apply persistence or
      // advance the watermark to wall-clock time.
      derivedMetrics.configureMaterialization({
        instanceId: instance.instanceId,
        enabled: true,
        formulaKind: "fdd_rule",
        invalidValuePolicy: materializerInvalidPolicy(materialization),
        alignmentPolicy: DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
        alignmentToleranceSeconds,
        lastRunAt: to,
        nextRunAt: new Date(toMs + materialization.intervalSeconds * 1000).toISOString(),
        status: "active",
        lastError: null
      });
      options.fddTestHooks?.onFddMaterialized?.({ projectId: instance.projectId, instanceId: instance.instanceId });
      return;
    }

    const firstAnchorMs = evaluationAnchorPoints[0]!.ms;
    const previousStateUpperBoundMs = readWindow.incremental && typeof readWindow.watermarkMs === "number"
      ? readWindow.watermarkMs
      : firstAnchorMs - 1;
    const previousSample = readPreviousFddEvaluationSample(instance.instanceId, previousStateUpperBoundMs);
    const previousDerived = isRecordValue(previousSample?.metadata?.derivedValues)
      ? Object.fromEntries(Object.entries(previousSample.metadata.derivedValues)
          .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
      : undefined;
    let previousEvaluationState: FddRuleEvaluationState | undefined = previousSample
      ? {
          sampleMs: Date.parse(previousSample.ts),
          status: previousSample.status,
          ...(previousDerived ? { derivedValues: previousDerived } : {})
        }
      : undefined;

    for (const anchorPoint of evaluationAnchorPoints) {
      const inputs: Record<string, number> = {};
      const inputTimestamps: Record<string, string> = {};
      const inputLagSeconds: Record<string, number> = {};
      for (const entry of seriesEntries) {
        const point = entry.role === anchor.role
          ? anchorPoint
          : materializerNearestNumericPoint(entry.points, anchorPoint.ms, toleranceMs);
        if (!point) continue;
        inputs[entry.role] = point.value;
        inputTimestamps[entry.role] = point.ts;
        inputLagSeconds[entry.role] = Math.round((point.ms - anchorPoint.ms) / 1000);
      }
      const evaluation = evaluateFddRuleSample(
        instance,
        inputs,
        seriesByRole,
        anchorPoint.ms,
        alignmentToleranceSeconds,
        previousEvaluationState
      );
      const metadata: Record<string, unknown> = {
        formulaKind: "fdd_rule",
        materialized: true,
        inputs,
        inputTimestamps,
        inputLagSeconds,
        alignmentToleranceSeconds,
        incrementalRead: readWindow.incremental,
        queryLimit: limit
      };
      if (evaluation.reason) metadata.reason = evaluation.reason;
      if (evaluation.derivedValues) metadata.derivedValues = evaluation.derivedValues;
      derivedMetrics.recordSample({
        instanceId: instance.instanceId,
        ts: anchorPoint.ts,
        ...(typeof evaluation.valueNum === "number" ? { valueNum: evaluation.valueNum } : {}),
        valueText: evaluation.valueText,
        quality: evaluation.quality,
        status: evaluation.status,
        calculationRunId,
        sourceWindowStart: from,
        sourceWindowEnd: to,
        metadata
      });
      // Missing inputs must not acknowledge/clear durable edge or level
      // persistence. Only a subsequent calculable sample may advance/reset it.
      if (evaluation.quality === "good") {
        previousEvaluationState = {
          sampleMs: anchorPoint.ms,
          status: evaluation.status,
          ...(evaluation.derivedValues ? { derivedValues: evaluation.derivedValues } : {})
        };
      }
    }

    const evaluatedWatermarkTs = evaluationAnchorPoints[evaluationAnchorPoints.length - 1]?.ts;
    const evaluatedWatermarkMs = evaluatedWatermarkTs ? Date.parse(evaluatedWatermarkTs) : NaN;
    const durableWatermarkMs = materialization.watermarkTs ? Date.parse(materialization.watermarkTs) : NaN;
    const watermarkTs = Number.isFinite(durableWatermarkMs) && Number.isFinite(evaluatedWatermarkMs)
      ? new Date(Math.max(durableWatermarkMs, evaluatedWatermarkMs)).toISOString()
      : evaluatedWatermarkTs ?? materialization.watermarkTs ?? to;
    derivedMetrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: true,
      formulaKind: "fdd_rule",
      invalidValuePolicy: materializerInvalidPolicy(materialization),
      alignmentPolicy: DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
      alignmentToleranceSeconds,
      lastRunAt: to,
      nextRunAt: new Date(toMs + materialization.intervalSeconds * 1000).toISOString(),
      watermarkTs,
      status: "active",
      lastError: null
    });
    options.fddTestHooks?.onFddMaterialized?.({ projectId: instance.projectId, instanceId: instance.instanceId });
  }

  async function materializeDerivedMetricInstance(
    instance: DerivedMetricInstance,
    materialization: DerivedMetricMaterialization,
    expectedPlanSignature: string,
    prevalidatedFleetGuardReceipts?: ReadonlySet<string>
  ): Promise<void> {
    const kind = inferredMaterializerKind(instance, materialization);
    if (!kind) {
      derivedMetrics.configureMaterialization({
        instanceId: materialization.instanceId,
        enabled: false,
        status: "unsupported",
        lastError: "No executable formula kind is available for this metric."
      });
      return;
    }
    if (kind === "fdd_rule") {
      await materializeFddRuleMetricInstance(instance, materialization, expectedPlanSignature, prevalidatedFleetGuardReceipts);
      return;
    }
    const leftRole = materialization.leftRole ?? instance.dependencies[0]?.role ?? "left";
    const rightRole = materialization.rightRole ?? instance.dependencies.find((dependency) => dependency.role !== leftRole)?.role ?? "right";
    const leftDependency = materializerDependencyForRole(instance, leftRole, 0);
    const rightDependency = materializerDependencyForRole(instance, rightRole, 1);
    if (!leftDependency || !rightDependency) {
      throw new Error("materializer_dependencies_not_found");
    }

    const toMs = Date.now();
    const to = new Date(toMs).toISOString();
    const from = new Date(toMs - materialization.lookbackSeconds * 1000).toISOString();
    const limit = Math.min(Math.max(240, Math.ceil(materialization.lookbackSeconds / 30)), 20_000);
    const [leftSeries, rightSeries] = await Promise.all([
      readMaterializerDependencySeries(instance.projectId, leftDependency, from, to, limit),
      readMaterializerDependencySeries(instance.projectId, rightDependency, from, to, limit)
    ]);
    if (!derivedMetricExecutionPlanIsCurrent(instance.instanceId, expectedPlanSignature)) return;
    const policy = materializerInvalidPolicy(materialization);
    const alignmentPolicy = materialization.alignmentPolicy ?? DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY;
    const alignmentToleranceSeconds = materialization.alignmentToleranceSeconds ?? DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS;
    const alignedSamples = alignNumericSeries(leftSeries, rightSeries, alignmentPolicy, alignmentToleranceSeconds);
    const recordableSamples = alignedSamples.length > 0
      ? alignedSamples
      : [null];
    const calculationRunId = `materializer:${instance.instanceId}`;

    for (const aligned of recordableSamples) {
      const ts = aligned?.ts ?? to;
      const left = aligned?.left;
      const right = aligned?.right;
      const metadata: Record<string, unknown> = {
        formulaKind: kind,
        materialized: true,
        inputs: {
          ...(typeof left === "number" ? { [leftRole]: left } : {}),
          ...(typeof right === "number" ? { [rightRole]: right } : {})
        },
        invalidValuePolicy: policy,
        alignmentPolicy,
        alignmentToleranceSeconds
      };
      if (aligned) {
        metadata.inputTimestamps = {
          [leftRole]: aligned.leftTs,
          [rightRole]: aligned.rightTs
        };
        metadata.inputLagSeconds = {
          [leftRole]: aligned.leftLagSeconds,
          [rightRole]: aligned.rightLagSeconds
        };
      }
      let sample: { valueNum?: number; valueText?: string; quality: string; status: string };
      if (typeof left !== "number" || typeof right !== "number") {
        const fallback = materializerFallbackValue(policy);
        sample = { ...fallback, quality: "invalid" };
        metadata.invalidReason = "no_aligned_samples";
      } else if (kind === "ratio" && right === 0) {
        const fallback = materializerFallbackValue(policy);
        sample = { ...fallback, quality: "invalid" };
        metadata.invalidReason = "division_by_zero";
      } else {
        const value = kind === "ratio" ? left / right : left - right;
        if (Number.isFinite(value)) {
          sample = { valueNum: value, quality: "good", status: "ok" };
        } else {
          const fallback = materializerFallbackValue(policy);
          sample = { ...fallback, quality: "invalid" };
          metadata.invalidReason = "non_finite_result";
        }
      }
      derivedMetrics.recordSample({
        instanceId: instance.instanceId,
        ts,
        ...(typeof sample.valueNum === "number" ? { valueNum: sample.valueNum } : {}),
        ...(sample.valueText ? { valueText: sample.valueText } : {}),
        quality: sample.quality,
        status: sample.status,
        calculationRunId,
        sourceWindowStart: from,
        sourceWindowEnd: to,
        metadata
      });
    }

    const watermarkTs = recordableSamples[recordableSamples.length - 1]?.ts ?? to;
    derivedMetrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: true,
      formulaKind: kind,
      leftRole,
      rightRole,
      invalidValuePolicy: policy,
      alignmentPolicy,
      alignmentToleranceSeconds,
      lastRunAt: to,
      nextRunAt: new Date(toMs + materialization.intervalSeconds * 1000).toISOString(),
      watermarkTs,
      status: "active",
      lastError: null
    });
  }

  function materializeDerivedMetricInstanceSingleflight(
    instanceId: string,
    requireDue = false,
    prevalidatedFleetGuardReceipts?: ReadonlySet<string>
  ): Promise<void> {
    const existingRun = derivedMetricMaterializationRuns.get(instanceId);
    if (existingRun) return existingRun;
    const run = (async (): Promise<void> => {
      // Read both records only after this instance owns the lock. Callers may
      // have queued a stale object before a redeploy reset its cursor/plan.
      const instance = derivedMetrics.getInstance(instanceId);
      const materialization = derivedMetrics.readMaterialization(instanceId);
      if (!instance || !materialization || !materialization.enabled) return;
      if (requireDue && materialization.nextRunAt && Date.parse(materialization.nextRunAt) > Date.now()) return;
      const expectedPlanSignature = derivedMetricExecutionPlanSignature(instance);
      await materializeDerivedMetricInstance(instance, materialization, expectedPlanSignature, prevalidatedFleetGuardReceipts);
    })().finally(() => {
      derivedMetricMaterializationRuns.delete(instanceId);
    });
    derivedMetricMaterializationRuns.set(instanceId, run);
    return run;
  }

  let derivedMetricMaterializerRunning = false;
  async function runDerivedMetricMaterializer(): Promise<void> {
    if (derivedMetricMaterializerRunning) return;
    derivedMetricMaterializerRunning = true;
    const now = Date.now();
    const touchedProjects = new Set<string>();
    try {
      const due = derivedMetrics.listMaterializations()
        .filter((materialization) =>
          materialization.enabled
          && (!materialization.nextRunAt || Date.parse(materialization.nextRunAt) <= now)
        )
        .slice(0, 50);
      const dueInstances = due
        .map((materialization) => derivedMetrics.getInstance(materialization.instanceId))
        .filter((instance): instance is DerivedMetricInstance => Boolean(instance));
      const prevalidatedFleetGuardReceipts = await prevalidateFleetGuardMaterializationBatch(dueInstances);
      for (const materialization of due) {
        try {
          await materializeDerivedMetricInstanceSingleflight(
            materialization.instanceId,
            true,
            prevalidatedFleetGuardReceipts
          );
          touchedProjects.add(materialization.projectId);
        } catch (error) {
          if (isMissingDerivedMetricError(error)) {
            continue;
          }
          if (!derivedMetrics.getInstance(materialization.instanceId)) {
            continue;
          }
          try {
            derivedMetrics.configureMaterialization({
              instanceId: materialization.instanceId,
              enabled: true,
              status: "error",
              nextRunAt: new Date(now + materialization.intervalSeconds * 1000).toISOString(),
              lastError: error instanceof Error ? error.message : "materializer_failed"
            });
          } catch (configureError) {
            if (isMissingDerivedMetricError(configureError)) {
              continue;
            }
            throw configureError;
          }
          touchedProjects.add(materialization.projectId);
        }
      }
    } finally {
      derivedMetricMaterializerRunning = false;
      for (const projectId of touchedProjects) {
        broadcastToProject(projectId, { type: "derived_metrics_updated", projectId });
      }
    }
  }

  const materializerDisabled = env.DERIVED_METRIC_MATERIALIZER_DISABLED === "1";
  options.fddTestHooks?.onMaterializerReady?.(runDerivedMetricMaterializer);
  const derivedMetricMaterializerInterval = materializerDisabled
    ? null
    : setInterval(() => {
        void runDerivedMetricMaterializer();
      }, 60_000);
  const derivedMetricMaterializerKickoff = materializerDisabled
    ? null
    : setTimeout(() => {
        void runDerivedMetricMaterializer();
      }, 5_000);
  derivedMetricMaterializerInterval?.unref?.();
  derivedMetricMaterializerKickoff?.unref?.();
  app.addHook("onClose", async () => {
    if (derivedMetricMaterializerInterval) clearInterval(derivedMetricMaterializerInterval);
    if (derivedMetricMaterializerKickoff) clearTimeout(derivedMetricMaterializerKickoff);
  });

  function storeActiveChatStreamActivity(
    activities: ChatMessageActivity[],
    activity: ChatMessageActivity
  ): ChatMessageActivity[] {
    if (activity.id) {
      const existingIndex = activities.findIndex((entry) => entry.id === activity.id);
      if (existingIndex >= 0) {
        const next = activities.slice();
        next[existingIndex] = { ...activity };
        return next;
      }
    }
    const duplicateIndex = activities.findIndex((entry) =>
      !entry.id && !activity.id && entry.label === activity.label && entry.kind === activity.kind
    );
    if (duplicateIndex >= 0) {
      const next = activities.slice();
      next[duplicateIndex] = { ...activity };
      return next;
    }
    return [...activities, { ...activity }];
  }

  function activityFromStreamPayload(payload: unknown): ChatMessageActivity | null {
    if (typeof payload !== "object" || payload === null) return null;
    const value = payload as Record<string, unknown>;
    if (typeof value.label !== "string" || typeof value.kind !== "string") return null;
    const activity: ChatMessageActivity = {
      label: value.label,
      kind: value.kind as ChatMessageActivity["kind"]
    };
    if (typeof value.id === "string") activity.id = value.id;
    if (typeof value.tool === "string") activity.tool = value.tool;
    if (value.status === "running" || value.status === "done") activity.status = value.status;
    if (typeof value.raw === "string") activity.raw = value.raw;
    if (typeof value.requestId === "string") activity.requestId = value.requestId;
    if (typeof value.detail === "string") activity.detail = value.detail;
    if (typeof value.output === "string") activity.output = value.output;
    if (typeof value.durationMs === "number") activity.durationMs = value.durationMs;
    if (typeof value.exitCode === "number") activity.exitCode = value.exitCode;
    if (typeof value.at === "number") activity.at = value.at;
    return activity;
  }

  function updateActiveChatStreamWorkState(snapshot: ActiveChatStreamSnapshot, now: number): void {
    const hasRunningTool = snapshot.activities.some((activity) => activity.kind === "tool" && activity.status === "running");
    if (hasRunningTool) {
      if (snapshot.workSegmentStartedAt == null) {
        snapshot.workSegmentStartedAt = now;
      }
      snapshot.workTimelinePaused = false;
      return;
    }
    if (snapshot.workSegmentStartedAt != null) {
      snapshot.workElapsedMs += Math.max(0, now - snapshot.workSegmentStartedAt);
      snapshot.workSegmentStartedAt = null;
    }
    snapshot.workTimelinePaused = true;
  }

  function applyStreamEventToActiveChatStream(
    projectId: string,
    conversationId: string,
    requestId: string,
    event: string,
    data: unknown
  ): void {
    const key = activeChatStreamKey(projectId, conversationId);
    const snapshot = activeChatStreams.get(key);
    if (!snapshot || snapshot.requestId !== requestId) return;
    const now = Date.now();
    let changed = false;

    if ((event === "narration_token" || event === "answer_token" || event === "token") && typeof (data as { content?: unknown })?.content === "string") {
      const content = (data as { content: string }).content;
      if (event === "narration_token") {
        if (!snapshot.answerPhase) {
          snapshot.interimNarration += content;
          changed = true;
        }
      } else {
        snapshot.answerPhase = true;
        snapshot.interimNarration = "";
        snapshot.assistantMessage = {
          ...snapshot.assistantMessage,
          content: snapshot.assistantMessage.content + content
        };
        changed = true;
      }
      updateActiveChatStreamWorkState(snapshot, now);
    } else if (event === "final_answer_start") {
      snapshot.answerPhase = true;
      snapshot.interimNarration = "";
      updateActiveChatStreamWorkState(snapshot, now);
      changed = true;
    } else if (event === "narration_reset") {
      snapshot.interimNarration = "";
      changed = true;
    } else if (event === "token_reset") {
      snapshot.interimNarration = "";
      snapshot.assistantMessage = { ...snapshot.assistantMessage, content: "" };
      changed = true;
    } else if (event === "activity") {
      const activity = activityFromStreamPayload(data);
      if (activity) {
        snapshot.activities = storeActiveChatStreamActivity(snapshot.activities, activity);
        if (activity.kind === "context") {
          snapshot.interimNarration = "";
        }
        updateActiveChatStreamWorkState(snapshot, now);
        changed = true;
      }
    }

    if (!changed) return;
    snapshot.updatedAt = now;
    activeChatStreams.set(key, snapshot);
    broadcastActiveChatStream(snapshot);
  }

  async function pollDashboardSubscriptions(projectId: string): Promise<void> {
    const projectSubscriptions = dashboardSubscriptions.get(projectId);
    if (!projectSubscriptions || projectSubscriptions.size === 0) return;
    const requestedNames = new Set<string>();
    for (const pointNames of projectSubscriptions.values()) {
      for (const pointName of pointNames) {
        if (pointName.trim()) requestedNames.add(pointName.trim());
      }
    }
    if (requestedNames.size === 0) return;

    const access = resolveProjectBmsAccess(projectId);
    if (!access.ok) return;
    const baseUrl = access.baseUrl;
    const lastValues = dashboardLastValues.get(projectId) ?? new Map<string, string>();
    dashboardLastValues.set(projectId, lastValues);
    const updates: Array<Record<string, unknown>> = [];

    for (const pointName of requestedNames) {
      try {
        const response = await fetchProxy(`${baseUrl}/api/v1/points?${new URLSearchParams({ q: pointName, limit: "5" }).toString()}`, {
          headers: { accept: "application/json" }
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
        const exact = payload.items?.find((item) => item.name === pointName) ?? payload.items?.[0];
        if (!exact || typeof exact.name !== "string") continue;
        const serialized = JSON.stringify({
          last_value: typeof exact.last_value === "string" || exact.last_value == null ? exact.last_value : String(exact.last_value),
          last_polled_at: typeof exact.last_polled_at === "string" || exact.last_polled_at == null ? exact.last_polled_at : String(exact.last_polled_at)
        });
        if (lastValues.get(exact.name) === serialized) continue;
        lastValues.set(exact.name, serialized);
        updates.push({
          pointName: exact.name,
          objectRef: typeof exact.object_ref === "string" ? exact.object_ref : undefined,
          value: typeof exact.last_value === "string" || exact.last_value == null ? exact.last_value : String(exact.last_value),
          polledAt: typeof exact.last_polled_at === "string" ? exact.last_polled_at : undefined
        });
      } catch {
        // best effort
      }
    }

    if (updates.length > 0) {
      broadcastToProject(projectId, {
        type: "dashboard_point_update",
        projectId,
        updates,
        at: new Date().toISOString()
      });
    }
  }

  function ensureDashboardPoller(projectId: string): void {
    if (dashboardPollers.has(projectId)) return;
    dashboardPollers.set(projectId, setInterval(() => {
      void pollDashboardSubscriptions(projectId);
    }, 15_000));
    void pollDashboardSubscriptions(projectId);
  }

  function maybeStopDashboardPoller(projectId: string): void {
    const subscriptions = dashboardSubscriptions.get(projectId);
    const hasActiveSubscriptions = Boolean(subscriptions && [...subscriptions.values()].some((pointNames) => pointNames.size > 0));
    if (hasActiveSubscriptions) return;
    const poller = dashboardPollers.get(projectId);
    if (poller) {
      clearInterval(poller);
      dashboardPollers.delete(projectId);
    }
    dashboardLastValues.delete(projectId);
  }

  // CORS disabled: @fastify/cors v9 requires Fastify v5, but we're on Fastify v4.
  // Vite dev server proxies /api requests so CORS is not needed for development.
  // Upgrade path: either use @fastify/cors@^8 or upgrade Fastify to v5.
  // void app.register(cors, { origin: true });

  // Attach structured request logging
  attachStructuredLogging(app, structuredLogger);

  app.get("/health", async (request) => ({
    ok: true,
    service: "building-agent-api",
    requestId: requestIdFor(request)
  }));

  app.get("/api/bms/health", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }
    if (!session.projectId) {
      return sendError(request, reply, 403, "project_not_selected", "Select a project before querying BMS health.");
    }
    const membership = requireProjectMembership(request, reply, store, session, session.projectId);
    if (isReply(membership)) return membership;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;
    const access = resolveProjectBmsAccess(session.projectId);
    if (!access.ok) {
      return sendProjectBmsAccessError(request, reply, access);
    }
    const proxied = await proxyBmsCollector(env, fetchProxy, "/health", "", { method: "GET" }, access.baseUrl);
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  const forwardBmsCollector = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }
    if (!session.projectId) {
      return sendError(request, reply, 403, "project_not_selected", "Select a project before querying BMS catalog data.");
    }
    const membership = requireProjectMembership(request, reply, store, session, session.projectId);
    if (isReply(membership)) return membership;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;
    const access = resolveProjectBmsAccess(session.projectId);
    if (!access.ok) {
      return sendProjectBmsAccessError(request, reply, access);
    }
    const parsed = new URL(request.url, "http://buildingagent.local");
    const prefix = "/api/bms/collector";
    const pathname = parsed.pathname === prefix
      ? "/health"
      : parsed.pathname.startsWith(prefix)
      ? parsed.pathname.slice(prefix.length) || "/"
      : "/";
    const proxied = await proxyBmsCollector(env, fetchProxy, pathname, parsed.search, { method: request.method }, access.baseUrl);
    if (proxied.contentType) {
      reply.header("content-type", proxied.contentType);
    }
    return reply.status(proxied.statusCode).send(proxied.payload);
  };

  app.get("/api/bms/collector/*", forwardBmsCollector);
  app.get("/api/bms/collector", forwardBmsCollector);

  app.post<{ Body: unknown }>("/api/bms/dashboard/history-batch", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    if (!session.projectId) {
      return sendError(request, reply, 403, "project_not_selected", "Select a project before querying dashboard history.");
    }
    const membership = requireProjectMembership(request, reply, store, session, session.projectId);
    if (isReply(membership)) return membership;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;
    const projectId = session.projectId;

    const body = isRecordValue(request.body) ? request.body : {};
    const rawQueries = Array.isArray(body.queries) ? body.queries : [];
    if (rawQueries.length === 0) {
      return sendError(request, reply, 422, "bms_history_batch_invalid", "queries must be a non-empty array.");
    }
    if (rawQueries.length > 32) {
      return sendError(request, reply, 422, "bms_history_batch_too_large", "Dashboard history batch supports at most 32 queries.");
    }
    const queries = rawQueries.map((entry) => parseBmsDashboardHistoryBatchQuery(entry));
    if (queries.some((entry) => entry === null)) {
      return sendError(request, reply, 422, "bms_history_batch_invalid", "Each query requires key, from, and either name/point_id/object_ref or derived metric identifiers.");
    }
    const parsedQueries = queries as BmsDashboardHistoryBatchQuery[];
    const historyBmsAccessBySource = new Map<string, ProjectBmsAccessResult>();
    const historyAccessForQuery = (query: BmsDashboardHistoryBatchQuery): ProjectBmsAccessResult => {
      const key = query.bms_source_id ?? "";
      const cached = historyBmsAccessBySource.get(key);
      if (cached) return cached;
      const access = resolveProjectBmsAccess(projectId, query.bms_source_id ? { sourceId: query.bms_source_id } : {});
      historyBmsAccessBySource.set(key, access);
      return access;
    };

    const abortController = new AbortController();
    const abortIfClientClosed = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    };
    reply.raw.on("close", abortIfClientClosed);

    try {
      const results = await mapWithConcurrency(
        parsedQueries,
        BMS_DASHBOARD_HISTORY_BATCH_CONCURRENCY,
        async (query) => {
          try {
            if (query.source === "derived_metric") {
              const instance = resolveDerivedDashboardMetric(derivedMetrics, session.projectId!, query);
              if (!instance) {
                return {
                  key: query.key,
                  ok: false,
                  total: 0,
                  items: [] as BmsTimeseriesRow[],
                  error: "derived_metric_not_found"
                };
              }
              const items = derivedMetrics.readHistory(instance.instanceId, {
                from: query.from,
                ...(query.to ? { to: query.to } : {}),
                limit: Math.min(Math.max(1, Number.parseInt(query.limit ?? "720", 10) || 720), 20_000),
                order: query.order === "desc" ? "desc" : "asc"
              }).map((sample) => derivedMetricTimeseriesRow(instance, sample));
              return {
                key: query.key,
                ok: true,
                total: items.length,
                items
              };
            }
            const historyBmsAccess = historyAccessForQuery(query);
            if (!historyBmsAccess.ok) {
              return {
                key: query.key,
                ok: false,
                total: 0,
                items: [] as BmsTimeseriesRow[],
                error: historyBmsAccess.error,
                message: historyBmsAccess.message,
                ...(historyBmsAccess.sourceId ?? query.bms_source_id ? { sourceId: historyBmsAccess.sourceId ?? query.bms_source_id } : {})
              };
            }
            const params = paramsForBmsDashboardHistoryBatchQuery(query);
            const pointId = await resolveBmsDashboardPointId(historyBmsAccess.baseUrl, query, fetchProxy as typeof fetch, abortController.signal);
            if (pointId) {
              params.point_id = pointId;
              delete params.name;
              delete params.object_ref;
            }
            const result = await fetchTimeseries(
              historyBmsAccess.baseUrl,
              params,
              fetchProxy as typeof fetch,
              { signal: abortController.signal, preferReadings: true }
            );
            return {
              key: query.key,
              ok: true,
              total: result.total,
              items: result.items as BmsTimeseriesRow[],
              sourceId: historyBmsAccess.sourceId,
              sourceName: historyBmsAccess.sourceName
            };
          } catch (error) {
            return {
              key: query.key,
              ok: false,
              total: 0,
              items: [] as BmsTimeseriesRow[],
              error: error instanceof Error ? error.message : "bms_history_query_failed"
            };
          }
        }
      );

      return {
        results,
        requestId: requestIdFor(request)
      };
    } finally {
      reply.raw.off("close", abortIfClientClosed);
    }
  });

  app.post<{ Body: unknown }>("/api/bms/dashboard/latest-batch", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    if (!session.projectId) {
      return sendError(request, reply, 403, "project_not_selected", "Select a project before querying dashboard latest values.");
    }
    const membership = requireProjectMembership(request, reply, store, session, session.projectId);
    if (isReply(membership)) return membership;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;
    const projectId = session.projectId;

    const body = isRecordValue(request.body) ? request.body : {};
    const rawQueries = Array.isArray(body.queries) ? body.queries : [];
    if (rawQueries.length === 0) {
      return sendError(request, reply, 422, "bms_latest_batch_invalid", "queries must be a non-empty array.");
    }
    if (rawQueries.length > 64) {
      return sendError(request, reply, 422, "bms_latest_batch_too_large", "Dashboard latest batch supports at most 64 queries.");
    }
    const queries = rawQueries.map((entry) => parseBmsDashboardLatestBatchQuery(entry));
    if (queries.some((entry) => entry === null)) {
      return sendError(request, reply, 422, "bms_latest_batch_invalid", "Each query requires key and either name/point_id/object_ref or derived metric identifiers.");
    }
    const parsedQueries = queries as BmsDashboardLatestBatchQuery[];
    const latestBmsAccessBySource = new Map<string, ProjectBmsAccessResult>();
    const latestAccessForQuery = (query: BmsDashboardLatestBatchQuery): ProjectBmsAccessResult => {
      const key = query.bms_source_id ?? "";
      const cached = latestBmsAccessBySource.get(key);
      if (cached) return cached;
      const access = resolveProjectBmsAccess(projectId, query.bms_source_id ? { sourceId: query.bms_source_id } : {});
      latestBmsAccessBySource.set(key, access);
      return access;
    };

    const abortController = new AbortController();
    const abortIfClientClosed = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    };
    reply.raw.on("close", abortIfClientClosed);

    try {
      const results = await mapWithConcurrency(
        parsedQueries,
        BMS_DASHBOARD_HISTORY_BATCH_CONCURRENCY,
        async (query) => {
          try {
            if (query.source === "derived_metric") {
              const instance = resolveDerivedDashboardMetric(derivedMetrics, session.projectId!, query);
              const sample = instance ? derivedMetrics.readLatest(instance.instanceId) : null;
              if (!instance || !sample) {
                return { key: query.key, ok: false, total: 0, point: null, error: instance ? "derived_metric_latest_not_found" : "derived_metric_not_found" };
              }
              return {
                key: query.key,
                ok: true,
                total: 1,
                point: {
                  id: -1,
                  name: query.metric_instance_id ? `derived:${query.metric_instance_id}` : `derived:${query.entity_id}:${query.metric_key}`,
                  object_ref: instance.instanceId,
                  last_value: typeof sample.valueNum === "number" ? String(sample.valueNum) : sample.valueText ?? null,
                  last_polled_at: sample.ts,
                  quality: sample.quality,
                  status: sample.status
                }
              };
            }

            const latestBmsAccess = latestAccessForQuery(query);
            if (!latestBmsAccess.ok) {
              return {
                key: query.key,
                ok: false,
                total: 0,
                point: null,
                error: latestBmsAccess.error,
                message: latestBmsAccess.message,
                ...(latestBmsAccess.sourceId ?? query.bms_source_id ? { sourceId: latestBmsAccess.sourceId ?? query.bms_source_id } : {})
              };
            }
            const lookupValue = query.name ?? query.object_ref ?? query.point_id;
            if (!lookupValue) {
              return { key: query.key, ok: false, total: 0, point: null, error: "bms_lookup_missing" };
            }
            const response = await fetchProxy(`${latestBmsAccess.baseUrl}/api/v1/points?${new URLSearchParams({ q: lookupValue, limit: "20" }).toString()}`, {
              headers: { accept: "application/json" },
              signal: abortController.signal
            });
            if (!response.ok) {
              return { key: query.key, ok: false, total: 0, point: null, error: `bms_points_failed:${response.status}` };
            }
            const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
            const items = Array.isArray(payload.items) ? payload.items : [];
            const match = items.find((item) => query.name ? item.name === query.name : query.object_ref ? item.object_ref === query.object_ref : String(item.id ?? "") === query.point_id)
              ?? items[0];
            if (!match || typeof match.name !== "string") {
              return { key: query.key, ok: false, total: 0, point: null, error: "bms_point_not_found" };
            }
            const rawId = match.id;
            return {
              key: query.key,
              ok: true,
              total: 1,
              point: {
                id: typeof rawId === "number" ? rawId : Number.parseInt(String(rawId ?? "-1"), 10) || -1,
                name: match.name,
                ...(typeof match.object_ref === "string" ? { object_ref: match.object_ref } : {}),
                last_value: typeof match.last_value === "string" || match.last_value == null ? match.last_value : String(match.last_value),
                last_polled_at: typeof match.last_polled_at === "string" || match.last_polled_at == null ? match.last_polled_at : null
              },
              sourceId: latestBmsAccess.sourceId,
              sourceName: latestBmsAccess.sourceName
            };
          } catch (error) {
            return {
              key: query.key,
              ok: false,
              total: 0,
              point: null,
              error: error instanceof Error ? error.message : "bms_latest_query_failed"
            };
          }
        }
      );

      return {
        results,
        requestId: requestIdFor(request)
      };
    } finally {
      reply.raw.off("close", abortIfClientClosed);
    }
  });

  app.post<{ Params: ProjectParams; Body: unknown }>("/api/projects/:projectId/fdd-attribution-analysis", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const body = isRecordValue(request.body) ? request.body : {};
    const summary = body.summary;
    if (summary === undefined) {
      return sendError(request, reply, 422, "fdd_attribution_analysis_invalid", "summary is required.");
    }
    const serializedSummary = JSON.stringify(summary) ?? "";
    if (serializedSummary.length > FDD_ATTRIBUTION_ANALYSIS_PROMPT_MAX_CHARS * 2) {
      return sendError(request, reply, 422, "fdd_attribution_analysis_too_large", "Fault attribution evidence packet is too large.");
    }

    const reqId = requestIdFor(request);
    const messages = fddAttributionAnalysisPrompt({
      widgetTitle: stringField(body, "widgetTitle"),
      rangeLabel: stringField(body, "rangeLabel"),
      summary
    });

    const completeAttribution = (attemptMessages: Array<{ role: "system" | "user"; content: string }>) => provider.complete({
      messages: attemptMessages,
      projectId: request.params.projectId,
      userId: session.userId,
      requestId: reqId,
      maxTokens: FDD_ATTRIBUTION_ANALYSIS_MAX_TOKENS
    });

    try {
      let completion;
      try {
        completion = await completeAttribution(messages);
      } catch (error) {
        if (!(error instanceof ProviderError) || error.code !== "provider_empty_text") throw error;
        completion = await completeAttribution([
          ...messages,
          {
            role: "user",
            content: "The previous provider response had empty assistant content. Use minimal internal reasoning and write the final 180-260 word Markdown answer now."
          }
        ]);
      }
      let content = sanitizeFddAttributionGeneratedText(completion.text);
      if (!completion.fallbackUsed && completion.provider.mode !== "mock" && !isUsableFddAttributionGeneratedText(content)) {
        completion = await completeAttribution([
          ...messages,
          {
            role: "user",
            content: "The previous answer was too short or malformed. Regenerate the fault cause analysis now in 180-260 words. Return final Markdown only. Include the exact Markdown labels **Overall summary:**, **Likely cause:**, **Equipment:**, **Problem input:**, **Data evidence:**, and **Data-based next check:** with data-backed content."
          }
        ]);
        content = sanitizeFddAttributionGeneratedText(completion.text);
      }
      if (!content || completion.fallbackUsed || completion.provider.mode === "mock") {
        return {
          ok: false,
          error: "buildinggpt_unavailable",
          provider: providerDiagnostics(completion.provider, completion.fallbackUsed),
          requestId: reqId
        };
      }
      if (!isUsableFddAttributionGeneratedText(content)) {
        return {
          ok: false,
          error: "buildinggpt_invalid_output",
          provider: providerDiagnostics(completion.provider, completion.fallbackUsed),
          requestId: reqId
        };
      }
      return {
        ok: true,
        content,
        provider: providerDiagnostics(completion.provider, completion.fallbackUsed),
        requestId: reqId
      };
    } catch (error) {
      const diagnostic = fddAttributionProviderFailure(error);
      request.log.warn(
        { requestId: reqId, providerError: diagnostic },
        "BuildingGPT FDD attribution generation failed"
      );
      return {
        ok: false,
        error: "buildinggpt_unavailable",
        provider: providerDiagnostics(provider.metadata, false),
        diagnostic,
        requestId: reqId
      };
    }
  });

  app.post<{ Body: BmsTempUploadPayload }>("/api/bms/temp-upload", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const body = request.body ?? {} as BmsTempUploadPayload;
    if (typeof body.project_id !== "string" || !body.project_id.trim()) {
      return sendError(request, reply, 422, "bms_invalid_project", "project_id is required.");
    }
    const membership = requireProjectMembership(request, reply, store, session, body.project_id);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, body.project_id);
    if (isReply(selected)) return selected;
    if (typeof body.file_name !== "string" || !body.file_name.trim() || typeof body.content_base64 !== "string" || !body.content_base64.trim()) {
      return sendError(request, reply, 422, "bms_invalid_upload", "file_name and content_base64 are required.");
    }
    const root = tempUploadRoot();
    const uploadId = `upload_${randomUUID().slice(0, 8)}`;
    const safeName = sanitizeFilename(body.file_name);
    const relativeDir = path.join(body.project_id, uploadId);
    const relativeFile = path.join(relativeDir, safeName);
    const absoluteDir = path.join(root, relativeDir);
    const absoluteFile = path.join(root, relativeFile);
    await mkdir(absoluteDir, { recursive: true });
    const buffer = Buffer.from(body.content_base64, "base64");
    await writeFile(absoluteFile, buffer);
    const parsed = previewRowsFromBuffer(body.file_name, buffer);
    const previewRows = body.preview_rows && body.preview_rows.length > 0 ? body.preview_rows.slice(0, 10) : parsed.rows;
    const points = Array.isArray(body.points) && body.points.length > 0 ? body.points.slice(0, 25).map((point, index) => ensurePointId(point, body.project_id, index)) : parsed.points;
    const warnings = [
      ...(parsed.warnings ?? []),
      ...(Array.isArray(body.warnings) ? body.warnings.filter((warning) => typeof warning === "string") : [])
    ];
    const response: BmsTempUploadResponse = {
      upload_id: uploadId,
      project_id: body.project_id,
      file_name: body.file_name,
      mime_type: body.mime_type?.trim() || "application/octet-stream",
      temp_file_token: path.posix.join(".temp", "bms-config", relativeFile.replace(/\\/g, "/")),
      temp_relative_path: path.posix.join(".temp", "bms-config", relativeFile.replace(/\\/g, "/")),
      uploaded_at: new Date().toISOString(),
      row_count: typeof body.row_count === "number" ? body.row_count : parsed.rowCount,
      preview_headers: body.preview_headers?.filter((header) => typeof header === "string") ?? parsed.headers,
      preview_rows: previewRows,
      points,
      ...(warnings.length > 0 ? { warnings } : {})
    };
    return response;
  });

  app.get<{ Querystring: { project_id?: string } }>("/api/bms/sources", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const projectId = typeof request.query?.project_id === "string" ? request.query.project_id : "";
    if (!projectId) {
      return sendError(request, reply, 422, "bms_invalid_project", "project_id is required.");
    }
    const membership = requireProjectMembership(request, reply, store, session, projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, projectId);
    if (isReply(selected)) return selected;
    if (isElementBmsProject(projectId)) {
      return elementBmsBridge!.listSources(projectId);
    }
    if (useMockBmsClient) {
      return [...bmsSources.values()].map((entry) => entry.source).filter((source) => source.project_id === projectId);
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/sources?project_id=${encodeURIComponent(projectId)}`, { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.post<{ Body: BmsSourcePayload }>("/api/bms/sources", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.body?.project_id ?? "");
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.body?.project_id ?? "");
    if (isReply(selected)) return selected;
    if (isElementBmsProject(request.body?.project_id ?? "")) {
      return elementBmsBridge!.createSource(request.body);
    }
    if (useMockBmsClient) {
      const sourceId = nextBmsSourceId();
      const source: BmsSourceSummary = {
        source_id: sourceId,
        project_id: request.body.project_id,
        building_id: request.body.building_id,
        name: request.body.name,
        vendor_type: request.body.vendor_type,
        protocol_type: request.body.protocol_type,
        base_url: request.body.base_url,
        host: request.body.host,
        port: request.body.port,
        auth_type: request.body.auth_type,
        read_only: request.body.read_only,
        config: request.body.config ?? {},
        status: "configured",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      bmsSources.set(sourceId, { source, points: [] });
      return source;
    }
    const proxied = await proxyBms(env, fetchProxy, "/api/bms/sources", { method: "POST", body: JSON.stringify(request.body) });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.get<{ Params: { sourceId: string } }>("/api/bms/sources/:sourceId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    let source: BmsSourceSummary | undefined;
    if (elementBmsBridge) {
      try {
        source = elementBmsBridge.getSource(request.params.sourceId);
      } catch {
        source = undefined;
      }
    }
    if (!source) {
      source = [...bmsSources.values()].map((entry) => entry.source).find((candidate) => candidate.source_id === request.params.sourceId);
    }
    if (!source) {
      return sendError(request, reply, 404, "bms_source_not_found", "BMS source not found.");
    }
    const membership = requireProjectMembership(request, reply, store, session, source.project_id);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, source.project_id);
    if (isReply(selected)) return selected;
    if (elementBmsBridge && source.project_id === "project_element") return source;
    if (useMockBmsClient) return source;
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/sources/${encodeURIComponent(request.params.sourceId)}`, { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.post<{ Params: { sourceId: string } }>("/api/bms/sources/:sourceId/test-connection", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const sourceProjectId = resolveBmsSourceProjectId(request.params.sourceId);
    const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, sourceProjectId);
    if (isReply(selected)) return selected;
    if (elementBmsBridge && isElementBmsProject(sourceProjectId)) {
      return elementBmsBridge.testConnection(request.params.sourceId);
    }
    if (useMockBmsClient) {
      const source = mockSourceById(request.params.sourceId).source;
      const response: BmsConnectionTestResponse = {
        source_id: source.source_id,
        success: true,
        message: "Mock BMS connection successful.",
        capabilities: {
          discover_points: true,
          read_latest: true,
          read_history: false,
          write_point: false
        },
        tested_at: new Date().toISOString()
      };
      const current = mockSourceById(request.params.sourceId);
      current.source = { ...current.source, status: "connected", last_connection_test: response, updated_at: response.tested_at };
      bmsSources.set(request.params.sourceId, current);
      return response;
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/sources/${encodeURIComponent(request.params.sourceId)}/test-connection`, { method: "POST" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.post<{ Params: { sourceId: string } }>("/api/bms/sources/:sourceId/discover-points", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const sourceProjectId = resolveBmsSourceProjectId(request.params.sourceId);
    const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, sourceProjectId);
    if (isReply(selected)) return selected;
    if (elementBmsBridge && isElementBmsProject(sourceProjectId)) {
      return elementBmsBridge.discoverPoints(request.params.sourceId);
    }
    if (useMockBmsClient) {
      const source = mockSourceById(request.params.sourceId).source;
      const points = createBmsMockPoint(source.source_id);
      const current = mockSourceById(request.params.sourceId);
      current.points = points;
      current.source = { ...current.source, status: "ready", updated_at: new Date().toISOString() };
      bmsSources.set(request.params.sourceId, current);
      return { source_id: source.source_id, points, count: points.length };
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/sources/${encodeURIComponent(request.params.sourceId)}/discover-points`, { method: "POST" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.get<{ Params: { sourceId: string } }>("/api/bms/sources/:sourceId/points", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const sourceProjectId = resolveBmsSourceProjectId(request.params.sourceId);
    const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, sourceProjectId);
    if (isReply(selected)) return selected;
    if (elementBmsBridge && isElementBmsProject(sourceProjectId)) {
      return elementBmsBridge.getPoints(request.params.sourceId);
    }
    if (useMockBmsClient) {
      const current = mockSourceById(request.params.sourceId);
      return { source_id: current.source.source_id, points: current.points, count: current.points.length };
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/sources/${encodeURIComponent(request.params.sourceId)}/points`, { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.post<{ Body: BmsMinimalIngestionRequest }>("/api/bms/ingestion/test", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const sourceProjectId = resolveBmsSourceProjectId(request.body.source_id);
    const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, sourceProjectId);
    if (isReply(selected)) return selected;
    if (elementBmsBridge && isElementBmsProject(sourceProjectId)) {
      return elementBmsBridge.startIngestionTest(request.body);
    }
    if (useMockBmsClient) {
      const source = mockSourceById(request.body.source_id).source;
      const current = mockSourceById(request.body.source_id);
      const selectedPoints = current.points.filter((point) => request.body.point_ids.includes(point.id));
      const jobId = nextBmsJobId();
      const job: BmsIngestionJobStatusResponse = {
        job_id: jobId,
        source_id: request.body.source_id,
        status: "running",
        sample_count: request.body.sample_count,
        interval_seconds: request.body.interval_seconds,
        total_expected_records: selectedPoints.length * request.body.sample_count,
        inserted_records: 0,
        success_rate: 0,
        started_at: new Date().toISOString(),
        finished_at: null,
        errors: []
      };
      const results: BmsIngestionResultsResponse = {
        job_id: jobId,
        series: selectedPoints.map((point, index) => ({
          point_id: point.id,
          point_name: point.point_name,
          unit: point.unit,
          values: Array.from({ length: request.body.sample_count }, (_, sampleIndex) => ({
            timestamp: new Date(Date.parse(job.started_at) + sampleIndex * request.body.interval_seconds * 1000).toISOString(),
            value: Number((7.1 + index * 2 + sampleIndex * 0.3).toFixed(1)),
            quality: "good"
          }))
        }))
      };
      bmsJobs.set(jobId, { job, results, pollsRemaining: 1 });
      current.source = { ...current.source, status: "ingesting", last_ingestion_job_id: jobId, updated_at: job.started_at };
      bmsSources.set(request.body.source_id, current);
      return { job_id: jobId, status: "running", message: "Minimal ingestion test started." };
    }
    const proxied = await proxyBms(env, fetchProxy, "/api/bms/ingestion/test", { method: "POST", body: JSON.stringify(request.body) });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.get<{ Params: { jobId: string } }>("/api/bms/ingestion/jobs/:jobId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    if (elementBmsBridge) {
      try {
        const job = elementBmsBridge.getJob(request.params.jobId);
        const sourceProjectId = resolveBmsSourceProjectId(job.source_id);
        const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
        if (isReply(membership)) return membership;
        const selected = requireSelectedProject(request, reply, session, sourceProjectId);
        if (isReply(selected)) return selected;
        return job;
      } catch {
        // fall through to mock jobs
      }
    }
    const jobState = bmsJobs.get(request.params.jobId);
    if (!jobState) {
      return sendError(request, reply, 404, "bms_job_not_found", "BMS ingestion job not found.");
    }
    const source = mockSourceById(jobState.job.source_id).source;
    const membership = requireProjectMembership(request, reply, store, session, source.project_id);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, source.project_id);
    if (isReply(selected)) return selected;
    if (useMockBmsClient) {
      if (jobState.job.status === "running") {
        jobState.pollsRemaining -= 1;
        if (jobState.pollsRemaining <= 0) {
          jobState.job = {
            ...jobState.job,
            status: "completed",
            inserted_records: jobState.job.total_expected_records,
            success_rate: 1,
            finished_at: new Date(Date.parse(jobState.job.started_at) + 12000).toISOString()
          };
          bmsJobs.set(request.params.jobId, jobState);
        }
      }
      return jobState.job;
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/ingestion/jobs/${encodeURIComponent(request.params.jobId)}`, { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  app.get<{ Params: { jobId: string } }>("/api/bms/ingestion/jobs/:jobId/results", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    if (elementBmsBridge) {
      try {
        const job = elementBmsBridge.getJob(request.params.jobId);
        const sourceProjectId = resolveBmsSourceProjectId(job.source_id);
        const membership = requireProjectMembership(request, reply, store, session, sourceProjectId);
        if (isReply(membership)) return membership;
        const selected = requireSelectedProject(request, reply, session, sourceProjectId);
        if (isReply(selected)) return selected;
        return elementBmsBridge.getJobResults(request.params.jobId);
      } catch {
        // fall through
      }
    }
    const jobState = bmsJobs.get(request.params.jobId);
    if (!jobState) {
      return sendError(request, reply, 404, "bms_job_not_found", "BMS ingestion job not found.");
    }
    const source = mockSourceById(jobState.job.source_id).source;
    const membership = requireProjectMembership(request, reply, store, session, source.project_id);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, source.project_id);
    if (isReply(selected)) return selected;
    if (useMockBmsClient) {
      return jobState.results;
    }
    const proxied = await proxyBms(env, fetchProxy, `/api/bms/ingestion/jobs/${encodeURIComponent(request.params.jobId)}/results`, { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  const findUserForLogin = (identifier: string, password: string) => {
    const loginId = identifier.trim().toLowerCase();
    const loginPassword = password;
    return store.users.find((candidate) => {
      const emails = [candidate.email, ...(candidate.loginAliases ?? [])].map((value) => value.trim().toLowerCase());
      const passwords = [candidate.password, ...(candidate.passwordAliases ?? [])];
      return emails.includes(loginId) && passwords.includes(loginPassword);
    });
  };

  app.post<{ Body: LoginBody }>("/api/login", async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return sendError(request, reply, 401, "auth_invalid", "Invalid credentials.");
    }

    const user = findUserForLogin(email, password);
    if (!user) {
      return sendError(request, reply, 401, "auth_invalid", "Invalid email or password.");
    }

    const token = issueTokenForUser(store, user.id);
    const ttlMs = getTokenTtlMs(env);
    let shouldPersist = false;
    if (token.startsWith("ba_") && ttlMs !== null && ensureTokenMeta(store, token, ttlMs)) {
      shouldPersist = true;
    }
    if (!store.sessionsByToken[token]) {
      writeSessionForToken(store, token, { userId: user.id, selectedProjectId: null });
      shouldPersist = true;
    }
    if (shouldPersist) {
      persistSoon();
    }

    return {
      token,
      tokenType: "Bearer",
      expiresAt: tokenExpiresAtIso(store, token),
      user: { id: user.id, name: user.name },
      requestId: requestIdFor(request)
    };
  });

  app.get("/api/session", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    return {
      session: {
        userId: session.userId,
        projectId: session.projectId,
        permissions: session.permissions
      },
      requestId: requestIdFor(request)
    };
  });

  app.get("/api/projects", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const memberships = store.memberships.filter((membership) => membership.userId === session.userId);
    const projects = bounded(memberships, store.maxListSize).flatMap((membership) => {
      const project = store.projects.find((candidate) => candidate.id === membership.projectId);
      return project ? [{ id: project.id, name: project.name, permissions: membership.permissions }] : [];
    });

    return { projects, limit: store.maxListSize, requestId: requestIdFor(request) };
  });

  app.post<{ Body: { name?: unknown } }>("/api/projects", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 80) {
      return sendError(request, reply, 422, "project_invalid", "Project name must be 1-80 characters.");
    }

    const projectId = `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const project = { id: projectId, name };
    store.projects.push(project);
    store.memberships.push({ userId: session.userId, projectId, permissions: ["chat:read", "chat:write"] });
    store.messagesByProject[projectId] = [];
    store.conversationsByProject[projectId] = [];
    store.knowledgeBaseByProject[projectId] = [];
    store.repositoryByProject[projectId] = [];
    store.managementByProject[projectId] = { gateways: [], capabilities: [], tools: [] };
    projectSkillBindings.initProject(projectId);

    const selectedSession = { userId: session.userId, selectedProjectId: projectId };
    writeSessionForToken(store, session.token, selectedSession);
    persistSoon();

    return reply.status(201).send({
      project: { id: project.id, name: project.name, permissions: ["chat:read", "chat:write"] },
      session: {
        userId: session.userId,
        projectId,
        permissions: ["chat:read", "chat:write"]
      },
      requestId: requestIdFor(request)
    });
  });

  app.get("/api/registry", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const registryProjectIds = session.projectId
      ? [session.projectId]
      : store.memberships.filter((membership) => membership.userId === session.userId).map((membership) => membership.projectId);
    const activeSkillIds = mergeSkillIdsForRegistry(registryProjectIds, projectSkillBindings);
    const activeAgentSkills = skills.listForProject(activeSkillIds);

    return {
      runtimeProviders: boundedPlaceholderList(store.runtimeProviders, store),
      tools: boundedPlaceholderList(
        [
          ...store.tools,
          ...tools.list().map((tool) => ({
            id: `agent_${tool.name}`,
            name: tool.schema.name,
            category: tool.category === "memory" || tool.category === "session" || tool.category === "utility" ? "analysis" as const : "building" as const,
            status: "mock" as const,
            description: tool.description
          }))
        ],
        store
      ),
      skills: boundedPlaceholderList(
        [
          ...store.skills.filter((skill) => activeSkillIds.includes(skill.id)),
          ...activeAgentSkills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            domain: skill.domain,
            status: "mock" as const,
            description: skill.description
          }))
        ],
        store
      ),
      gateways: boundedPlaceholderList(store.gateways, store),
      buildingCapabilities: boundedPlaceholderList(store.buildingCapabilities, store),
      limit: store.maxListSize,
      placeholderOnly: true,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/management", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const management = store.managementByProject[request.params.projectId] ?? {
      gateways: [],
      capabilities: [],
      tools: []
    };

    return {
      projectId: request.params.projectId,
      gateways: boundedPlaceholderList(management.gateways, store),
      capabilities: boundedPlaceholderList(management.capabilities, store),
      tools: boundedPlaceholderList(management.tools, store),
      limit: store.maxListSize,
      placeholderOnly: true,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams }>("/api/projects/:projectId/select", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selectedSession = {
      userId: session.userId,
      selectedProjectId: request.params.projectId
    };
    writeSessionForToken(store, session.token, selectedSession);
    persistSoon();

    return {
      session: {
        userId: session.userId,
        projectId: request.params.projectId,
        permissions: getPermissionsForSelectedProject(store, selectedSession)
      },
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/bounds", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const canConfigure = hasConfigurePermission(store, session.userId, request.params.projectId);
    return platformBoundsPayload(canConfigure);
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/memory/user", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const bank = memory.readProjectUserBank(request.params.projectId, session.userId);
    return {
      projectId: request.params.projectId,
      scope: "project",
      entries: bank.entries,
      usage: bank.usage,
      charLimit: bank.charLimit,
      mutable: true,
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams; Body: { entries?: unknown } }>("/api/projects/:projectId/memory/user", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const entries = Array.isArray(request.body?.entries)
      ? request.body.entries.filter((entry): entry is string => typeof entry === "string")
      : null;
    if (!entries) {
      return sendError(request, reply, 422, "memory_invalid", "Body must include entries: string[].");
    }
    const result = memory.setEntries(request.params.projectId, session.userId, "user", entries);
    if (!result.success) {
      return sendError(request, reply, 422, "memory_update_failed", result.error ?? "Failed to update user memory.");
    }
    return {
      projectId: request.params.projectId,
      scope: "project",
      entries: result.entries ?? [],
      usage: result.usage,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/memory/project", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const canConfigure = hasConfigurePermission(store, session.userId, request.params.projectId);
    const bank = memory.readBank(request.params.projectId, session.userId, "project");
    return {
      projectId: request.params.projectId,
      scope: "project",
      entries: bank.entries,
      usage: bank.usage,
      charLimit: bank.charLimit,
      mutable: canConfigure,
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams; Body: { entries?: unknown } }>("/api/projects/:projectId/memory/project", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    if (!hasConfigurePermission(store, session.userId, request.params.projectId)) {
      return sendError(request, reply, 403, "bounds_violation", "Project memory bank writes require project:configure.");
    }

    const entries = Array.isArray(request.body?.entries)
      ? request.body.entries.filter((entry): entry is string => typeof entry === "string")
      : null;
    if (!entries) {
      return sendError(request, reply, 422, "memory_invalid", "Body must include entries: string[].");
    }
    const result = memory.setEntries(request.params.projectId, session.userId, "project", entries);
    if (!result.success) {
      return sendError(request, reply, 422, "memory_update_failed", result.error ?? "Failed to update project memory.");
    }
    return {
      projectId: request.params.projectId,
      scope: "project",
      entries: result.entries ?? [],
      usage: result.usage,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/memory/global", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const bank = memory.readGlobalUserBank(session.userId);
    return {
      scope: "global",
      entries: bank.entries,
      usage: bank.usage,
      charLimit: bank.charLimit,
      mutable: true,
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams; Body: { entries?: unknown } }>("/api/projects/:projectId/memory/global", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const entries = Array.isArray(request.body?.entries)
      ? request.body.entries.filter((entry): entry is string => typeof entry === "string")
      : null;
    if (!entries) {
      return sendError(request, reply, 422, "memory_invalid", "Body must include entries: string[].");
    }
    const result = memory.setGlobalUserEntries(session.userId, entries);
    if (!result.success) {
      return sendError(request, reply, 422, "memory_update_failed", result.error ?? "Failed to update global user memory.");
    }
    return {
      scope: "global",
      entries: result.entries ?? [],
      usage: result.usage,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/memory/rules", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const projectId = request.params.projectId;
    return {
      projectId,
      grounding: projectGroundingBindings.list(projectId),
      playbooks: projectFeedbackBindings.listPlaybooks(projectId),
      pendingMemoryProposals: projectMemoryProposalBindings
        .list(projectId, session.userId)
        .filter((proposal) => proposal.status === "proposed"),
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams; Querystring: { conversationId?: string } }>("/api/projects/:projectId/chat", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    let allMessages = store.messagesByProject[request.params.projectId] ?? [];
    const conversationId = typeof request.query?.conversationId === "string" ? request.query.conversationId : undefined;
    let messages = allMessages;
    let activeConversationId: string | null = null;

    if (conversationId) {
      const conversation = (store.conversationsByProject[request.params.projectId] ?? []).find((c) => c.id === conversationId);
      if (conversation) {
        if (repairMissingConversationMessages(store, request.params.projectId, conversation, sessionIndex, session.userId)) {
          persistSoon();
          allMessages = store.messagesByProject[request.params.projectId] ?? [];
        }
        messages = orderedConversationMessages(allMessages, conversation);
        activeConversationId = conversation.id;
      }
    } else {
      const conversations = store.conversationsByProject[request.params.projectId] ?? [];
      const lastConv = conversations.length > 0 ? conversations[conversations.length - 1] : undefined;
      if (lastConv) {
        if (repairMissingConversationMessages(store, request.params.projectId, lastConv, sessionIndex, session.userId)) {
          persistSoon();
          allMessages = store.messagesByProject[request.params.projectId] ?? [];
        }
        messages = orderedConversationMessages(allMessages, lastConv);
        activeConversationId = lastConv.id;
      }
    }

    return {
      messages: bounded(messages, store.maxListSize),
      activeConversationId,
      limit: store.maxListSize,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/chat/active-streams", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const streams = [...activeChatStreams.values()]
      .filter((stream) => stream.projectId === request.params.projectId)
      .map(publicActiveChatStream)
      .sort((left, right) => left.startedAt - right.startedAt);

    return {
      projectId: request.params.projectId,
      streams,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams; Querystring: { tool?: string; limit?: string } }>("/api/projects/:projectId/tool-logs", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const toolFilter = typeof request.query?.tool === "string" ? request.query.tool : undefined;
    const limit = typeof request.query?.limit === "string" ? Math.min(parseInt(request.query.limit, 10) || 50, 200) : 50;
    const logs = tools.queryLogs({ projectId: request.params.projectId, ...(toolFilter ? { tool: toolFilter } : {}), limit });

    return {
      projectId: request.params.projectId,
      logs,
      count: logs.length,
      totalCount: tools.logCount(),
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/knowledge-base", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const projectKbRoot = kbRootForProject(request.params.projectId);
    const [documents, totalCount] = await Promise.all([
      indexKnowledgeBase(request.params.projectId, { rootDir: projectKbRoot }),
      countFiles(projectKbRoot)
    ]);
    store.knowledgeBaseByProject[request.params.projectId] = documents;

    return {
      projectId: request.params.projectId,
      documents: bounded(documents, Math.max(store.maxListSize, 200)),
      totalCount,
      rootConfigured: Boolean(projectKbRoot),
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/repository", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    // Scan repository directory on disk and merge with in-memory artifacts
    const repoRoot = repoRootForProject(request.params.projectId);
    const [diskArtifacts, totalCount] = await Promise.all([
      indexRepository(request.params.projectId, repoRoot),
      countFiles(repoRoot)
    ]);
    const memoryArtifacts = store.repositoryByProject[request.params.projectId] ?? [];

    // Merge: disk first, then in-memory items not already present by id or path
    const diskIds = new Set(diskArtifacts.map((a) => a.id));
    const diskPaths = new Set(diskArtifacts.map((a) => a.path).filter(Boolean));
    const merged = [
      ...diskArtifacts,
      ...memoryArtifacts.filter((a) => !diskIds.has(a.id) && (!a.path || !diskPaths.has(a.path)))
    ];

    // Update in-memory store so sidebar counts stay in sync
    store.repositoryByProject[request.params.projectId] = merged;

    return {
      projectId: request.params.projectId,
      artifacts: bounded(merged, store.maxListSize),
      totalCount: totalCount + memoryArtifacts.filter((a) => !diskIds.has(a.id) && (!a.path || !diskPaths.has(a.path))).length,
      requestId: requestIdFor(request)
    };
  });

  // Serve individual files from the project's repository directory.
  // Wildcard path parameter is captured as request.params["*"].
  app.get<{ Params: ProjectParams & { "*": string } }>("/api/projects/:projectId/repository/files/*", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const requestedPath = (request.params["*"] ?? "").replace(/\\/g, "/");
    if (!requestedPath || requestedPath.includes("..") || requestedPath.startsWith("/")) {
      return sendError(request, reply, 400, "repo_invalid_path", "Invalid file path.");
    }

    const absolutePath = resolveRepositoryFileForRead(request.params.projectId, requestedPath, env);
    if (!absolutePath || !existsSync(absolutePath)) {
      return sendError(request, reply, 404, "repo_file_not_found", "File not found.");
    }

    try {
      const info = await stat(absolutePath);
      if (info.isDirectory()) {
        return sendError(request, reply, 404, "repo_file_not_found", "File not found.");
      }
      const data = await readFile(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      const filename = path.basename(absolutePath);
      if (DOWNLOAD_ATTACHMENT_EXTENSIONS.has(ext)) {
        return reply
          .header("Content-Type", mime)
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .header("Cache-Control", "public, max-age=3600")
          .send(data);
      }
      return reply.header("Content-Type", mime).header("Cache-Control", "public, max-age=3600").send(data);
    } catch {
      return sendError(request, reply, 500, "repo_read_error", "Failed to read file.");
    }
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/dashboards", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const dashboards = readableDashboardsForProject(store, request.params.projectId, session.userId);
    return {
      projectId: request.params.projectId,
      dashboards: bounded(dashboards, store.maxListSize),
      totalCount: dashboards.length,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/derived-metrics", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const metrics = derivedMetricAssetsForProject(store, derivedMetrics, request.params.projectId, session.userId);
    return {
      projectId: request.params.projectId,
      metrics: bounded(metrics, store.maxListSize),
      totalCount: metrics.length,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/fdd-library", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const entityContext = await buildFddEntityContext(request.params.projectId);
    const equipmentAvailability = fddEquipmentAvailabilityFromContext(entityContext);
    const bmsAccess = resolveProjectBmsAccess(request.params.projectId);
    let checksPending = false;
    if (bmsAccess.ok) {
      checksPending = scheduleAutomaticFddLibraryChecks(request.params.projectId, session.userId, entityContext, equipmentAvailability);
    } else {
      await ensureAutomaticFddLibraryChecks(request.params.projectId, session.userId, entityContext, equipmentAvailability);
    }
    ensureProjectFddCollections(request.params.projectId);
    return {
      projectId: request.params.projectId,
      algorithms: store.fddAlgorithms ?? [],
      checks: bounded(store.fddChecksByProject![request.params.projectId] ?? [], store.maxListSize * 4),
      tasks: bounded(fddTasksForProject(request.params.projectId), store.maxListSize),
      checkRuns: bounded(store.fddLibraryCheckRunsByProject![request.params.projectId] ?? [], store.maxListSize),
      equipmentAvailability,
      equipmentInventorySignature: fddEquipmentInventorySignature(entityContext, equipmentAvailability),
      checksPending,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/fdd-fleetguard-rollout", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;
    return {
      projectId: request.params.projectId,
      globalMode: fddFleetGuardGlobalConfig.mode,
      rollout: fddFleetGuardRollouts.get(request.params.projectId),
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams; Body: unknown }>("/api/projects/:projectId/fdd-fleetguard-rollout", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;
    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;
    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;
    const configurable = requirePermission(request, reply, membership, "project:configure");
    if (isReply(configurable)) return configurable;
    try {
      const rollout = fddFleetGuardRollouts.update(request.params.projectId, session.userId, request.body);
      return { projectId: request.params.projectId, rollout, requestId: requestIdFor(request) };
    } catch (error) {
      if (error instanceof FddFleetGuardRolloutError) {
        return sendError(request, reply, error.statusCode, error.code, error.message);
      }
      throw error;
    }
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/fdd-fleet-templates", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const templates = fddFleetTemplates.list(request.params.projectId);
    return {
      projectId: request.params.projectId,
      templates: bounded(templates, store.maxListSize),
      totalCount: templates.length,
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams & { templateId: string } }>("/api/projects/:projectId/fdd-fleet-templates/:templateId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const template = fddFleetTemplates.get(request.params.projectId, request.params.templateId);
    if (!template) {
      return sendError(request, reply, 404, "fdd_fleet_template_not_found", "The requested fleet template does not exist in this project.");
    }
    return {
      projectId: request.params.projectId,
      template,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams; Body: unknown }>("/api/projects/:projectId/fdd-fleet-templates", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const configurable = requirePermission(request, reply, membership, "project:configure");
    if (isReply(configurable)) return configurable;

    try {
      const template = fddFleetTemplates.create({
        projectId: request.params.projectId,
        actorId: session.userId,
        requestId: requestIdFor(request),
        input: request.body
      });
      return reply.status(201).send({
        projectId: request.params.projectId,
        template,
        requestId: requestIdFor(request)
      });
    } catch (error) {
      if (error instanceof FddFleetTemplateError) {
        return sendError(request, reply, error.statusCode, error.code, error.message);
      }
      throw error;
    }
  });

  app.patch<{ Params: ProjectParams & { templateId: string }; Body: unknown }>("/api/projects/:projectId/fdd-fleet-templates/:templateId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const configurable = requirePermission(request, reply, membership, "project:configure");
    if (isReply(configurable)) return configurable;

    try {
      const template = fddFleetTemplates.update({
        projectId: request.params.projectId,
        templateId: request.params.templateId,
        actorId: session.userId,
        requestId: requestIdFor(request),
        input: request.body
      });
      return {
        projectId: request.params.projectId,
        template,
        requestId: requestIdFor(request)
      };
    } catch (error) {
      if (error instanceof FddFleetTemplateError) {
        return sendError(request, reply, error.statusCode, error.code, error.message);
      }
      throw error;
    }
  });

  app.post<{ Params: ProjectParams & { algorithmId: string } }>("/api/projects/:projectId/fdd-library/:algorithmId/test", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const algorithm = (store.fddAlgorithms ?? []).find((entry) => entry.id === request.params.algorithmId);
    if (!algorithm) {
      return sendError(request, reply, 404, "fdd_algorithm_not_found", "The requested FDD algorithm does not exist.");
    }
    const existingTask = (store.fddTasksByProject?.[request.params.projectId] ?? []).find((entry) =>
      entry.source === "global_library"
      && (entry.globalAlgorithmId === algorithm.id || entry.algorithmSnapshot.algorithmKey === algorithm.algorithmKey)
    );
    const check = await runFddDeployabilityCheck(
      request.params.projectId,
      session.userId,
      algorithm,
      "manual",
      existingTask?.id
    );
    persistSoon();
    return {
      projectId: request.params.projectId,
      algorithm,
      check,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams & { algorithmId: string }; Body: unknown }>("/api/projects/:projectId/fdd-library/:algorithmId/deploy", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const algorithm = (store.fddAlgorithms ?? []).find((entry) => entry.id === request.params.algorithmId);
    if (!algorithm) {
      return sendError(request, reply, 404, "fdd_algorithm_not_found", "The requested FDD algorithm does not exist.");
    }
    if (!isExecutableFddAlgorithm(algorithm)) {
      return sendError(request, reply, 422, "fdd_runtime_not_supported", "This FDD definition is specification-only because no executable evaluator is registered.");
    }
    const existingTask = (store.fddTasksByProject?.[request.params.projectId] ?? []).find((entry) =>
      entry.source === "global_library"
      && (entry.globalAlgorithmId === algorithm.id || entry.algorithmSnapshot.algorithmKey === algorithm.algorithmKey)
    );
    const fleetGuardSelected = isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfig,
      rollout: currentFddFleetGuardRollout(store, request.params.projectId),
      algorithmKey: algorithm.algorithmKey
    });
    if (!fleetGuardSelected) ensureProjectFddCollections(request.params.projectId);
    let submittedAuthorization: FleetGuardAuthorizationToken | undefined;
    if (fleetGuardSelected) {
      try {
        submittedAuthorization = parseFddFleetGuardAuthorization(request.body);
      } catch (error) {
        return sendError(request, reply, 409, "fdd_fleetguard_authorization_invalid", error instanceof Error ? error.message : "FleetGuard authorization is invalid.");
      }
      if (!submittedAuthorization) {
        return sendError(request, reply, 409, "fdd_fleetguard_authorization_required", "Run Test and submit its FleetGuard authorization before deployment.");
      }
    }
    const entityContext = await buildFddEntityContext(request.params.projectId);
    const equipmentAvailability = fddEquipmentAvailabilityFromContext(entityContext);
    // FleetGuard deployment is a state-changing boundary: it re-reads
    // inventory, catalog mappings, and observed history without mutating the
    // cached v4 card. Default-off v4 keeps its established persistence path.
    const check = await runFddDeployabilityCheck(
      request.params.projectId,
      session.userId,
      algorithm,
      "auto",
      existingTask?.id,
      entityContext,
      equipmentAvailability,
      fleetGuardSelected
    );
    const task = existingTask
      ? {
          ...existingTask,
          globalAlgorithmId: algorithm.id,
          algorithmSnapshot: { ...algorithm },
          sharingScope: "global_community" as const,
          deployabilityCheck: check,
          status: "ready" as const,
          updatedAt: new Date().toISOString()
        }
      : fddTaskFromAlgorithm(request.params.projectId, algorithm, "global_library", "global_community", check);
    if (fleetGuardSelected) {
      const assessment = fleetGuardAssessmentsByCheck.get(check);
      if (!assessment) {
        return sendError(request, reply, 409, "fdd_fleetguard_plan_unavailable", "The fresh FleetGuard assessment is unavailable; deployment did not fall back to v4.");
      }
      const deployment = deployFleetGuardFddTaskRuntime({
        projectId: request.params.projectId,
        userId: session.userId,
        task,
        check,
        assessment,
        ...(submittedAuthorization ? { submitted: submittedAuthorization } : {}),
        ...(existingTask ? { authorizationTaskId: existingTask.id } : { prospectiveTask: true })
      });
      if (deployment.error) {
        return sendError(request, reply, 409, deployment.errorCode ?? "fdd_fleetguard_not_ready", deployment.error);
      }
      persistSoon();
      broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
      return {
        projectId: request.params.projectId,
        task: deployment.task,
        deployment: {
          expectedEntityCount: assessment.plan.coverage.expected,
          deployedEntityCount: deployment.instances.length,
          entityKeys: assessment.plan.entities.map((entity) => entity.entityKey),
          authorizationPolicy: "fleetguard-v1" as const,
          receiptId: deployment.receipt?.receiptId
        },
        requestId: requestIdFor(request)
      };
    }
    if (check.status !== "can_deploy") {
      return sendError(request, reply, 422, "fdd_cannot_deploy", "This FDD algorithm requires a confirmed can_deploy check; resolve missing, ambiguous, or history blockers first.");
    }
    const deployment = await deployFddTaskRuntime(request.params.projectId, session.userId, task, check);
    if (deployment.error) {
      return sendError(request, reply, 422, "fdd_no_runtime_entities", deployment.error);
    }
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
    return {
      projectId: request.params.projectId,
      task: deployment.task,
      deployment: {
        expectedEntityCount: check.equipmentAvailability?.entityCount ?? deployment.runtimeEntities.length,
        deployedEntityCount: deployment.instances.length,
        entityKeys: deployment.runtimeEntities.map((entity) => entity.entityKey)
      },
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/fdd-tasks", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    return {
      projectId: request.params.projectId,
      tasks: bounded(fddTasksForProject(request.params.projectId), store.maxListSize),
      totalCount: fddTasksForProject(request.params.projectId).length,
      requestId: requestIdFor(request)
    };
  });

  app.delete<{ Params: ProjectParams & { taskId: string } }>("/api/projects/:projectId/fdd-tasks/:taskId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    ensureProjectFddCollections(request.params.projectId);
    const tasks = store.fddTasksByProject![request.params.projectId] ?? [];
    const task = tasks.find((entry) => entry.id === request.params.taskId);
    if (!task) {
      return sendError(request, reply, 404, "fdd_task_not_found", "The requested FDD task does not exist.");
    }
    const generatedDashboardIds = deleteGeneratedFddDashboardsForTask(request.params.projectId, task);
    const runtimeInstances = fddRuntimeInstancesForTask(request.params.projectId, task);
    const deletion = deleteDerivedMetricInstances(request.params.projectId, runtimeInstances);
    const deletedDashboardIds = Array.from(new Set([...deletion.deletedDashboardIds, ...generatedDashboardIds]));
    store.fddTasksByProject![request.params.projectId] = tasks.filter((entry) => entry.id !== task.id);
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });

    return {
      deleted: true,
      taskId: task.id,
      deletedMetricIds: deletion.deletedMetrics.map((instance) => instance.instanceId),
      deletedDashboardIds,
      updatedDashboardIds: deletion.updatedDashboardIds,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams; Body: unknown }>("/api/projects/:projectId/fdd-tasks", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const parsed = normalizeFddCreateInput(request.body);
    if ("error" in parsed) {
      return sendError(request, reply, 422, "fdd_task_invalid", parsed.error);
    }
    const algorithm = createFddAlgorithmFromInput(parsed, session.userId);
    if (parsed.sharingScope === "global_community") {
      store.fddAlgorithms = [algorithm, ...(store.fddAlgorithms ?? [])];
    }
    const task = fddTaskFromAlgorithm(
      request.params.projectId,
      algorithm,
      "project_upload",
      parsed.sharingScope
    );
    upsertFddTask(request.params.projectId, task);
    const check = await runFddDeployabilityCheck(request.params.projectId, session.userId, algorithm, "auto", task.id);
    task.deployabilityCheck = check;
    task.status = isExecutableFddAlgorithm(task.algorithmSnapshot) && check.status === "can_deploy" ? "ready" : "cannot_deploy";
    task.updatedAt = new Date().toISOString();
    upsertFddTask(request.params.projectId, task);
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
    return {
      projectId: request.params.projectId,
      task,
      algorithm: parsed.sharingScope === "global_community" ? algorithm : null,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams & { taskId: string } }>("/api/projects/:projectId/fdd-tasks/:taskId/test", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const authoritativeTask = (store.fddTasksByProject?.[request.params.projectId] ?? [])
      .find((entry) => entry.id === request.params.taskId);
    const task = authoritativeTask ? structuredClone(authoritativeTask) : undefined;
    if (!task) {
      return sendError(request, reply, 404, "fdd_task_not_found", "The requested FDD task does not exist.");
    }
    const check = await runFddDeployabilityCheck(request.params.projectId, session.userId, task.algorithmSnapshot, "manual", task.id);
    task.deployabilityCheck = check;
    task.status = isExecutableFddAlgorithm(task.algorithmSnapshot) && check.status === "can_deploy" ? "ready" : "cannot_deploy";
    task.updatedAt = new Date().toISOString();
    upsertFddTask(request.params.projectId, task);
    persistSoon();
    return { projectId: request.params.projectId, task, requestId: requestIdFor(request) };
  });

  app.patch<{ Params: ProjectParams & { taskId: string }; Body: unknown }>("/api/projects/:projectId/fdd-tasks/:taskId/parameters", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const authoritativeTask = (store.fddTasksByProject?.[request.params.projectId] ?? [])
      .find((entry) => entry.id === request.params.taskId);
    const task = authoritativeTask ? structuredClone(authoritativeTask) : undefined;
    if (!task) {
      return sendError(request, reply, 404, "fdd_task_not_found", "The requested FDD task does not exist.");
    }
    const body = isRecordValue(request.body) ? request.body : {};
    const result = applyFddTaskParameterOverrides(task, body.parameters, session.userId);
    if (result.error) {
      return sendError(request, reply, 422, "fdd_parameters_invalid", result.error);
    }
    upsertFddTask(request.params.projectId, task);
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
    return { projectId: request.params.projectId, task, requestId: requestIdFor(request) };
  });

  app.post<{ Params: ProjectParams & { taskId: string }; Body: unknown }>("/api/projects/:projectId/fdd-tasks/:taskId/deploy", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const authoritativeTask = (store.fddTasksByProject?.[request.params.projectId] ?? [])
      .find((entry) => entry.id === request.params.taskId);
    const task = authoritativeTask ? structuredClone(authoritativeTask) : undefined;
    if (!task) {
      return sendError(request, reply, 404, "fdd_task_not_found", "The requested FDD task does not exist.");
    }
    if (!isExecutableFddAlgorithm(task.algorithmSnapshot)) {
      return sendError(request, reply, 422, "fdd_runtime_not_supported", "This FDD definition is specification-only because no executable evaluator is registered.");
    }
    const fleetGuardSelected = isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfig,
      rollout: currentFddFleetGuardRollout(store, request.params.projectId),
      algorithmKey: task.algorithmSnapshot.algorithmKey
    });
    let submittedAuthorization: FleetGuardAuthorizationToken | undefined;
    if (fleetGuardSelected) {
      try {
        submittedAuthorization = parseFddFleetGuardAuthorization(request.body);
      } catch (error) {
        return sendError(request, reply, 409, "fdd_fleetguard_authorization_invalid", error instanceof Error ? error.message : "FleetGuard authorization is invalid.");
      }
      if (!submittedAuthorization) {
        return sendError(request, reply, 409, "fdd_fleetguard_authorization_required", "Run Test and submit its FleetGuard authorization before deployment.");
      }
    }
    const entityContext = await buildFddEntityContext(request.params.projectId);
    const equipmentAvailability = fddEquipmentAvailabilityFromContext(entityContext);
    const check = await runFddDeployabilityCheck(
      request.params.projectId,
      session.userId,
      task.algorithmSnapshot,
      "auto",
      task.id,
      entityContext,
      equipmentAvailability,
      fleetGuardSelected
    );
    if (fleetGuardSelected) {
      const assessment = fleetGuardAssessmentsByCheck.get(check);
      if (!assessment) {
        return sendError(request, reply, 409, "fdd_fleetguard_plan_unavailable", "The fresh FleetGuard assessment is unavailable; deployment did not fall back to v4.");
      }
      const deployment = deployFleetGuardFddTaskRuntime({
        projectId: request.params.projectId,
        userId: session.userId,
        task,
        check,
        assessment,
        ...(submittedAuthorization ? { submitted: submittedAuthorization } : {}),
        authorizationTaskId: task.id
      });
      if (deployment.error) {
        return sendError(request, reply, 409, deployment.errorCode ?? "fdd_fleetguard_not_ready", deployment.error);
      }
      persistSoon();
      broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
      return {
        projectId: request.params.projectId,
        task: deployment.task,
        deployment: {
          expectedEntityCount: assessment.plan.coverage.expected,
          deployedEntityCount: deployment.instances.length,
          entityKeys: assessment.plan.entities.map((entity) => entity.entityKey),
          authorizationPolicy: "fleetguard-v1" as const,
          receiptId: deployment.receipt?.receiptId
        },
        requestId: requestIdFor(request)
      };
    }
    if (check.status !== "can_deploy") {
      return sendError(request, reply, 422, "fdd_cannot_deploy", "This FDD task requires a confirmed can_deploy check; resolve missing, ambiguous, or history blockers first.");
    }
    const deployment = await deployFddTaskRuntime(request.params.projectId, session.userId, task, check);
    if (deployment.error) {
      return sendError(request, reply, 422, "fdd_no_runtime_entities", deployment.error);
    }
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "fdd_tasks_updated", projectId: request.params.projectId });
    return {
      projectId: request.params.projectId,
      task: deployment.task,
      deployment: {
        expectedEntityCount: check.equipmentAvailability?.entityCount ?? deployment.runtimeEntities.length,
        deployedEntityCount: deployment.instances.length,
        entityKeys: deployment.runtimeEntities.map((entity) => entity.entityKey)
      },
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams & { instanceId: string } }>("/api/projects/:projectId/derived-metrics/:instanceId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const instance = derivedMetrics.getInstance(request.params.instanceId);
    if (!instance || instance.projectId !== request.params.projectId) {
      return sendError(request, reply, 404, "derived_metric_not_found", "The requested derived metric does not exist in this project.");
    }

    return {
      projectId: request.params.projectId,
      metric: {
        instance,
        latest: derivedMetrics.readLatest(instance.instanceId),
        materialization: derivedMetrics.readMaterialization(instance.instanceId),
        linkedDashboards: linkedDashboardsForDerivedMetric(store, request.params.projectId, instance, session.userId)
      },
      requestId: requestIdFor(request)
    };
  });

  app.delete<{ Params: ProjectParams & { instanceId: string } }>("/api/projects/:projectId/derived-metrics/:instanceId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const instance = derivedMetrics.getInstance(request.params.instanceId);
    if (!instance || instance.projectId !== request.params.projectId) {
      return sendError(request, reply, 404, "derived_metric_not_found", "The requested derived metric does not exist in this project.");
    }

    const deletion = deleteDerivedMetricInstances(request.params.projectId, [instance]);
    persistSoon();
    return {
      deleted: deletion.deletedMetrics.length > 0,
      instanceId: request.params.instanceId,
      deletedDashboardIds: deletion.deletedDashboardIds,
      updatedDashboardIds: deletion.updatedDashboardIds,
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams & { instanceId: string }; Body: unknown }>("/api/projects/:projectId/derived-metrics/:instanceId/materialization", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const body = isRecordValue(request.body) ? request.body : null;
    if (!body || typeof body.enabled !== "boolean") {
      return sendError(request, reply, 422, "derived_metric_invalid", "Body must include enabled: boolean.");
    }
    const instance = derivedMetrics.getInstance(request.params.instanceId);
    if (!instance || instance.projectId !== request.params.projectId) {
      return sendError(request, reply, 404, "derived_metric_not_found", "The requested derived metric does not exist in this project.");
    }
    const current = derivedMetrics.readMaterialization(instance.instanceId);
    const materialization = derivedMetrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: body.enabled,
      ...(current?.formulaKind ? { formulaKind: current.formulaKind } : {}),
      ...(current?.leftRole ? { leftRole: current.leftRole } : {}),
      ...(current?.rightRole ? { rightRole: current.rightRole } : {}),
      ...(current?.invalidValuePolicy ? { invalidValuePolicy: current.invalidValuePolicy } : {}),
      intervalSeconds: current?.intervalSeconds ?? 300,
      lookbackSeconds: current?.lookbackSeconds ?? 3_600,
      status: body.enabled ? "active" : "paused",
      ...(body.enabled ? { nextRunAt: new Date().toISOString() } : {})
    });
    broadcastToProject(request.params.projectId, { type: "derived_metrics_updated", projectId: request.params.projectId });
    return {
      projectId: request.params.projectId,
      metric: {
        instance,
        latest: derivedMetrics.readLatest(instance.instanceId),
        materialization,
        linkedDashboards: linkedDashboardsForDerivedMetric(store, request.params.projectId, instance, session.userId)
      },
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams & { dashboardId: string } }>("/api/projects/:projectId/dashboards/:dashboardId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) return readable;

    const dashboard = (store.dashboardsByProject[request.params.projectId] ?? []).find((entry) => entry.id === request.params.dashboardId);
    if (!dashboard || !canReadDashboard(dashboard, session.userId)) {
      return sendError(request, reply, 404, "dashboard_not_found", "The requested dashboard does not exist in this project.");
    }

    return {
      projectId: request.params.projectId,
      dashboard,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams; Body: unknown }>("/api/projects/:projectId/dashboards", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const parsed = parseDashboardMutationInput(request.body);
    if ("error" in parsed) {
      return sendError(request, reply, 422, "dashboard_invalid", parsed.error);
    }

    const dashboard = createDashboardRecord(parsed, request.params.projectId, session.userId);
    const dashboards = store.dashboardsByProject[request.params.projectId] ?? [];
    dashboards.unshift(dashboard);
    store.dashboardsByProject[request.params.projectId] = sortedDashboards(dashboards);
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "dashboard_created", projectId: request.params.projectId, dashboard });

    return reply.status(201).send({
      projectId: request.params.projectId,
      dashboard,
      path: dashboardPath(request.params.projectId, dashboard.id),
      requestId: requestIdFor(request)
    });
  });

  app.patch<{ Params: ProjectParams & { dashboardId: string }; Body: unknown }>("/api/projects/:projectId/dashboards/:dashboardId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const dashboards = store.dashboardsByProject[request.params.projectId] ?? [];
    const current = dashboards.find((entry) => entry.id === request.params.dashboardId);
    if (!current) {
      return sendError(request, reply, 404, "dashboard_not_found", "The requested dashboard does not exist in this project.");
    }
    if (!canManageDashboard(current, session.userId, hasConfigurePermission(store, session.userId, request.params.projectId))) {
      return sendError(request, reply, 403, "dashboard_forbidden", "You do not have permission to update this dashboard.");
    }

    const parsed = parseDashboardMutationInput(request.body);
    if ("error" in parsed) {
      return sendError(request, reply, 422, "dashboard_invalid", parsed.error);
    }

    const updated = updateDashboardRecord(current, parsed);
    store.dashboardsByProject[request.params.projectId] = sortedDashboards(
      dashboards.map((entry) => (entry.id === request.params.dashboardId ? updated : entry))
    );
    persistSoon();
    broadcastToProject(request.params.projectId, { type: "dashboard_updated", projectId: request.params.projectId, dashboard: updated });

    return {
      projectId: request.params.projectId,
      dashboard: updated,
      requestId: requestIdFor(request)
    };
  });

  app.delete<{ Params: ProjectParams & { dashboardId: string } }>("/api/projects/:projectId/dashboards/:dashboardId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) return session;

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) return membership;

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) return selected;

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) return writable;

    const dashboards = store.dashboardsByProject[request.params.projectId] ?? [];
    const current = dashboards.find((entry) => entry.id === request.params.dashboardId);
    if (!current) {
      return sendError(request, reply, 404, "dashboard_not_found", "The requested dashboard does not exist in this project.");
    }
    if (!canManageDashboard(current, session.userId, hasConfigurePermission(store, session.userId, request.params.projectId))) {
      return sendError(request, reply, 403, "dashboard_forbidden", "You do not have permission to delete this dashboard.");
    }

    store.dashboardsByProject[request.params.projectId] = dashboards.filter((entry) => entry.id !== request.params.dashboardId);
    persistSoon();
    broadcastToProject(request.params.projectId, {
      type: "dashboard_deleted",
      projectId: request.params.projectId,
      dashboardId: request.params.dashboardId
    });

    return {
      deleted: true,
      dashboardId: request.params.dashboardId,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams; Body: ChatBody & { conversationId?: unknown } }>("/api/projects/:projectId/chat", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const content = validateChatMessage(request.body);
    if (!content) {
      return sendError(request, reply, 422, "chat_invalid", "Chat message must be 1-1000 characters.");
    }

    const projectId = request.params.projectId;
    let conversationId = typeof request.body?.conversationId === "string" ? request.body.conversationId : undefined;
    const conversations = store.conversationsByProject[projectId] ?? [];

    // Auto-create a conversation if none provided
    if (!conversationId) {
      const newConversation: Conversation = {
        id: nextConversationId(),
        projectId,
        title: "New conversation",
        messageIds: [],
        createdAt: new Date().toISOString()
      };
      conversations.push(newConversation);
      store.conversationsByProject[projectId] = conversations;
      conversationId = newConversation.id;
    }

    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      return sendError(request, reply, 404, "conversation_not_found", "The requested conversation does not exist in this project.");
    }

    const messages = store.messagesByProject[projectId] ?? [];
    const message: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "user",
      content
    };
    messages.push(message);
    conversation.messageIds.push(message.id);
    trimProjectMessages(store, projectId, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;
    tryInstantConversationTitle({ conversation, userText: content });
    sessionIndex.upsertMessage(message, conversationId, {
      title: conversation.title,
      messageCount: conversation.messageIds.length
    });
    persistNow();

    // Pre-process time expressions (reminders) before agent turn
    const timeExpr = parseTimeExpression(content);
    if (timeExpr) {
      scheduler.schedule({
        projectId,
        conversationId,
        userId: session.userId,
        message: timeExpr.reminderText,
        triggerAt: timeExpr.triggerAt
      });

      const delayMs = timeExpr.triggerAt - Date.now();
      const delaySec = Math.round(delayMs / 1000);
      const delayText = delaySec >= 3600 ? `${Math.round(delaySec / 3600)}小时`
        : delaySec >= 60 ? `${Math.round(delaySec / 60)}分钟`
        : `${delaySec}秒`;

      const assistantMessage: ChatMessage = {
        id: nextMessageId(),
        projectId,
        userId: session.userId,
        role: "assistant",
        content: `好的，${delayText}后提醒你「${timeExpr.reminderText}」。`
      };
      messages.push(assistantMessage);
      conversation.messageIds.push(assistantMessage.id);
      trimProjectMessages(store, projectId, store.maxChatMessages);
      store.messagesByProject[projectId] = messages;

      // Auto-title on first message
      if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
        conversation.title = `提醒: ${timeExpr.reminderText}`.slice(0, 60);
      }

      persistSoon();
      return reply.status(201).send({
        message,
        assistantMessage,
        conversationId,
        conversationTitle: conversation.title,
        provider: providerDiagnostics(provider.metadata, false),
        fallbackUsed: false,
        lifecycle: [],
        requestId: requestIdFor(request)
      });
    }

    // Pre-process recurring time expressions (every N minutes, daily at H:00, etc.)
    const recurExpr = parseRecurringExpression(content);
    if (recurExpr) {
      scheduler.schedule({
        projectId,
        conversationId,
        userId: session.userId,
        message: recurExpr.reminderText,
        triggerAt: recurExpr.triggerAt,
        recurrence: recurExpr.recurrence
      });

      const intervalDesc = recurExpr.recurrence.type === "interval"
        ? `每${Math.round((recurExpr.recurrence.intervalSeconds ?? 60) / 60)}分钟`
        : `按计划`;

      const assistantMessage: ChatMessage = {
        id: nextMessageId(),
        projectId,
        userId: session.userId,
        role: "assistant",
        content: `好的，${intervalDesc}提醒你「${recurExpr.reminderText}」。`
      };
      messages.push(assistantMessage);
      conversation.messageIds.push(assistantMessage.id);
      trimProjectMessages(store, projectId, store.maxChatMessages);
      store.messagesByProject[projectId] = messages;

      if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
        conversation.title = `重复提醒: ${recurExpr.reminderText}`.slice(0, 60);
      }

      scheduleSave(store);
      return reply.status(201).send({
        message,
        assistantMessage,
        conversationId,
        conversationTitle: conversation.title,
        provider: providerDiagnostics(provider.metadata, false),
        fallbackUsed: false,
        lifecycle: [],
        requestId: requestIdFor(request)
      });
    }

    const dashboardIdsBeforeTurn = new Set((store.dashboardsByProject[projectId] ?? []).map((dashboard) => dashboard.id));
    let agentTurn;
    const agentInputs = await buildAgentTurnInputs({
      projectId,
      conversation,
      projectMessages: messages,
      store
    });
    try {
      agentTurn = await agentRuntime.runTurn({
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        conversationId,
        canConfigure: hasConfigurePermission(store, session.userId, projectId),
        messages: agentInputs.conversationMessages,
        providerMessages: agentInputs.providerMessages,
        provider,
        knowledgeBaseDocuments: agentInputs.knowledgeBaseDocuments,
        repositoryArtifacts: agentInputs.repositoryArtifacts
      });
    } catch (error) {
      if (!allowProviderFallback) {
        messages.pop();
        conversation.messageIds.pop();
        return sendError(request, reply, 502, "provider_error", formatProviderFailureMessage(error));
      }

      request.log.warn(
        { requestId: requestIdFor(request), providerError: redactedProviderError(error) },
        "Chat provider failed; using deterministic fallback"
      );
      const fallbackProvider = createDeterministicMockProvider(
        providerErrorCode(error),
        error
      );
      agentTurn = await agentRuntime.runTurn({
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        conversationId,
        canConfigure: hasConfigurePermission(store, session.userId, projectId),
        messages: agentInputs.conversationMessages,
        providerMessages: agentInputs.providerMessages,
        provider: fallbackProvider,
        knowledgeBaseDocuments: agentInputs.knowledgeBaseDocuments,
        repositoryArtifacts: agentInputs.repositoryArtifacts
      });
    }

    const assistantText = appendCreatedDashboardLinks(
      stripProviderThinkingMarkup(agentTurn.completion.text),
      projectId,
      dashboardsCreatedAfter(store, projectId, dashboardIdsBeforeTurn)
    );
    const finalizedAssistant = finalizeAssistantContent(
      assistantText,
      agentTurn.generatedImages,
      agentTurn.generatedDownloads
    );
    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "assistant",
      content: finalizedAssistant.content,
      ...(finalizedAssistant.images ? { images: finalizedAssistant.images } : {}),
      ...(finalizedAssistant.downloads ? { downloads: finalizedAssistant.downloads } : {})
    };
    messages.push(assistantMessage);
    conversation.messageIds.push(assistantMessage.id);
    trimProjectMessages(store, projectId, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;
    sessionIndex.upsertMessage(assistantMessage, conversationId, {
      title: conversation.title,
      messageCount: conversation.messageIds.length
    });

    persistSoon();

    if (isFirstConversationExchange(conversation, agentInputs.conversationMessages)) {
      void refineConversationTitleWithBuildingGptContext({
        conversation,
        userText: content,
        assistantText,
        onUpdated(title) {
          persistSoon();
          broadcastToProject(projectId, {
            type: "conversation_title_updated",
            conversationId,
            title,
            projectId
          });
        }
      });
    }

    return reply.status(201).send({
      message,
      assistantMessage,
      conversationId,
      conversationTitle: conversation.title,
      provider: providerDiagnostics(agentTurn.completion.provider, agentTurn.completion.fallbackUsed),
      fallbackUsed: agentTurn.completion.fallbackUsed,
      lifecycle: agentTurn.events,
      requestId: requestIdFor(request)
    });
  });

  // SSE streaming chat endpoint
  app.post<{ Params: ProjectParams; Body: ChatBody & { conversationId?: unknown } }>("/api/projects/:projectId/chat/stream", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const content = validateChatMessage(request.body);
    if (!content) {
      return sendError(request, reply, 422, "chat_invalid", "Chat message must be 1-1000 characters.");
    }

    const projectId = request.params.projectId;
    let conversationId = typeof request.body?.conversationId === "string" ? request.body.conversationId : undefined;
    const conversations = store.conversationsByProject[projectId] ?? [];

    // Auto-create conversation if none provided
    if (!conversationId) {
      const newConversation: Conversation = {
        id: nextConversationId(),
        projectId,
        title: "New conversation",
        messageIds: [],
        createdAt: new Date().toISOString()
      };
      conversations.push(newConversation);
      store.conversationsByProject[projectId] = conversations;
      conversationId = newConversation.id;
    }

    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      return sendError(request, reply, 404, "conversation_not_found", "The requested conversation does not exist in this project.");
    }

    const messages = store.messagesByProject[projectId] ?? [];

    const lastMessageId = conversation.messageIds[conversation.messageIds.length - 1];
    const lastMessage = lastMessageId ? messages.find((message) => message.id === lastMessageId) : undefined;
    let userMessage: ChatMessage;
    if (lastMessage?.role === "user" && lastMessage.content === content) {
      userMessage = lastMessage;
    } else {
      userMessage = {
        id: nextMessageId(),
        projectId,
        userId: session.userId,
        role: "user",
        content
      };
      messages.push(userMessage);
      conversation.messageIds.push(userMessage.id);
      store.messagesByProject[projectId] = messages;
      sessionIndex.upsertMessage(userMessage, conversationId, {
        title: conversation.title,
        messageCount: conversation.messageIds.length
      });
      persistNow();
    }

    // Set up SSE response
    const reqId = requestIdFor(request);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    let activeStreamConversationId: string | null = null;

    const sseWrite = (event: string, data: unknown): void => {
      if (
        event === "narration_token"
        || event === "final_answer_start"
        || event === "answer_token"
        || event === "final_answer_end"
      ) {
        const contentPreview = typeof (data as { content?: unknown })?.content === "string"
          ? (data as { content: string }).content.slice(0, 30)
          : undefined;
        request.log.info({ requestId: reqId, sseEvent: event, contentPreview }, "[SSE] event");
      }
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const raw = reply.raw as NodeJS.WritableStream & { flush?: () => void };
      raw.flush?.();
      if (activeStreamConversationId) {
        applyStreamEventToActiveChatStream(projectId, activeStreamConversationId, reqId, event, data);
      }
    };

    tryInstantConversationTitle({
      conversation,
      userText: content,
      onUpdated(title) {
        broadcastToProject(projectId, {
          type: "conversation_title_updated",
          conversationId,
          title,
          projectId
        });
        sseWrite("conversation_title", { conversationId, title, requestId: reqId });
      }
    });

    // Pre-process time expressions (reminders) before agent turn
    const streamTimeExpr = parseTimeExpression(content);
    if (streamTimeExpr) {
      scheduler.schedule({
        projectId,
        conversationId,
        userId: session.userId,
        message: streamTimeExpr.reminderText,
        triggerAt: streamTimeExpr.triggerAt
      });

      const delayMs = streamTimeExpr.triggerAt - Date.now();
      const delaySec = Math.round(delayMs / 1000);
      const delayText = delaySec >= 3600 ? `${Math.round(delaySec / 3600)}小时`
        : delaySec >= 60 ? `${Math.round(delaySec / 60)}分钟`
        : `${delaySec}秒`;

      const streamAssistantMessage: ChatMessage = {
        id: nextMessageId(),
        projectId,
        userId: session.userId,
        role: "assistant",
        content: `好的，${delayText}后提醒你「${streamTimeExpr.reminderText}」。`
      };
      messages.push(streamAssistantMessage);
      conversation.messageIds.push(streamAssistantMessage.id);
      trimProjectMessages(store, projectId, store.maxChatMessages);
      store.messagesByProject[projectId] = messages;

      if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
        conversation.title = `提醒: ${streamTimeExpr.reminderText}`.slice(0, 60);
      }

      persistSoon();
      sseWrite("done", {
        message: userMessage,
        assistantMessage: streamAssistantMessage,
        conversationId,
        conversationTitle: conversation.title,
        provider: providerDiagnostics(provider.metadata, false),
        fallbackUsed: false,
        requestId: reqId
      });
      reply.raw.end();
      return;
    }

    // Pre-process recurring time expressions (streaming endpoint)
    const streamRecurExpr = parseRecurringExpression(content);
    if (streamRecurExpr) {
      scheduler.schedule({
        projectId,
        conversationId,
        userId: session.userId,
        message: streamRecurExpr.reminderText,
        triggerAt: streamRecurExpr.triggerAt,
        recurrence: streamRecurExpr.recurrence
      });

      const intervalDesc = streamRecurExpr.recurrence.type === "interval"
        ? `每${Math.round((streamRecurExpr.recurrence.intervalSeconds ?? 60) / 60)}分钟`
        : `按计划`;

      const streamAssistMsg: ChatMessage = {
        id: nextMessageId(),
        projectId,
        userId: session.userId,
        role: "assistant",
        content: `好的，${intervalDesc}提醒你「${streamRecurExpr.reminderText}」。`
      };
      messages.push(streamAssistMsg);
      conversation.messageIds.push(streamAssistMsg.id);
      trimProjectMessages(store, projectId, store.maxChatMessages);
      store.messagesByProject[projectId] = messages;

      if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
        conversation.title = `重复提醒: ${streamRecurExpr.reminderText}`.slice(0, 60);
      }

      scheduleSave(store);
      sseWrite("done", JSON.stringify({
        message: userMessage,
        assistantMessage: streamAssistMsg,
        conversationId,
        conversationTitle: conversation.title,
        provider: providerDiagnostics(provider.metadata, false),
        fallbackUsed: false,
        requestId: reqId
      }));
      reply.raw.end();
      return;
    }

    const dashboardIdsBeforeTurn = new Set((store.dashboardsByProject[projectId] ?? []).map((dashboard) => dashboard.id));
    let finalText = "";
    let finalProviderDiagnostics: ReturnType<typeof providerDiagnostics> | null = null;
    let streamError: string | null = null;
    let streamGeneratedImages: ChatMessageImage[] = [];
    let streamGeneratedDownloads: ChatMessageDownload[] = [];
    const turnStartedAt = Date.now();
    let workElapsedMs = 0;
    let workSegmentStartedAt: number | null = turnStartedAt;
    activeStreamConversationId = conversationId;
    activeChatStreams.set(activeChatStreamKey(projectId, conversationId), {
      projectId,
      conversationId,
      requestId: reqId,
      startedAt: turnStartedAt,
      updatedAt: turnStartedAt,
      userMessage,
      assistantMessage: {
        id: `streaming_${reqId}`,
        projectId,
        userId: session.userId,
        role: "assistant",
        content: ""
      },
      activities: [],
      interimNarration: "",
      answerPhase: false,
      workElapsedMs: 0,
      workSegmentStartedAt,
      workTimelinePaused: false,
      streamTimelineFinalized: false
    });
    broadcastActiveChatStream(activeChatStreams.get(activeChatStreamKey(projectId, conversationId))!);
    const pauseWorkTimeline = (): void => {
      const now = Date.now();
      if (workSegmentStartedAt != null) {
        workElapsedMs += Math.max(0, now - workSegmentStartedAt);
        workSegmentStartedAt = null;
      }
    };
    const resumeWorkTimeline = (): void => {
      if (workSegmentStartedAt == null) {
        workSegmentStartedAt = Date.now();
      }
    };
    const capturedActivities: import("./seed.js").ChatMessageActivity[] = [];
    const captureActivity = (payload: Record<string, unknown>): import("./seed.js").ChatMessageActivity | null => {
      if (typeof payload.label !== "string" || typeof payload.kind !== "string") return null;
      const act: import("./seed.js").ChatMessageActivity = {
        label: payload.label,
        kind: payload.kind as import("./seed.js").ChatMessageActivity["kind"]
      };
      if (typeof payload.id === "string") act.id = payload.id;
      if (typeof payload.tool === "string") act.tool = payload.tool;
      if (payload.status === "running" || payload.status === "done") act.status = payload.status;
      if (typeof payload.raw === "string") act.raw = payload.raw;
      if (typeof payload.requestId === "string") act.requestId = payload.requestId;
      if (typeof payload.detail === "string") act.detail = payload.detail;
      if (typeof payload.output === "string") act.output = payload.output;
      if (typeof payload.durationMs === "number") act.durationMs = payload.durationMs;
      if (typeof payload.exitCode === "number") act.exitCode = payload.exitCode;
      if (typeof payload.at === "number") act.at = payload.at;
      return act;
    };
    const storeCapturedActivity = (captured: import("./seed.js").ChatMessageActivity): void => {
      if (captured.id) {
        const existingIndex = capturedActivities.findIndex((a) => a.id === captured.id);
        if (existingIndex >= 0) {
          const previous = capturedActivities[existingIndex]!;
          if (previous.at != null) {
            captured.at = previous.at;
          }
          capturedActivities[existingIndex] = captured;
          return;
        }
      }
      capturedActivities.push(captured);
    };

    const agentInputs = await buildAgentTurnInputs({
      projectId,
      conversation,
      projectMessages: messages,
      store
    });

    try {
      const seenActivities = new Map<string, number>();
      let activitySequence = 0;
      const sanitizeToolDetail = (value: unknown): string | undefined => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.replace(/[A-Za-z0-9_./\\-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_./\\-]*/gi, "[redacted]").trim();
        return trimmed ? trimmed.slice(0, 180) : undefined;
      };
      const groundingToolLabel = (state: "running" | "done", metadata?: Record<string, unknown>): string => {
        if (state === "running") {
          return "Retrieving site rules";
        }
        const count = metadata?.retrievedGroundingCount;
        const names = metadata?.retrievedRuleNames;
        if (typeof count === "number" && count > 0) {
          if (Array.isArray(names)) {
            const listed = names.filter((name): name is string => typeof name === "string").slice(0, 3);
            if (listed.length > 0) {
              const joined = listed.join(", ");
              return count === 1
                ? `Retrieved site rule: ${joined}`
                : `Retrieved site rules (${count}): ${joined}${names.length > 3 ? ", …" : ""}`;
            }
          }
          return `Retrieved site rules (${count})`;
        }
        return "No matching site rules";
      };
      const toolLabelFor = (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>): string => {
        if (state === "done" && typeof metadata?.exitCode === "number" && metadata.exitCode !== 0) {
          return "Tool failed";
        }
        if (toolName === "project_grounding") {
          return groundingToolLabel(state, metadata);
        }
        if (toolName === "bms_points_query") return state === "running" ? "Finding BMS points" : "Found BMS points";
        if (toolName === "dashboard_create") return state === "running" ? "Creating dashboard" : "Created dashboard";
        const lower = toolName.toLowerCase();
        if (lower.includes("search") || lower.includes("grep") || lower.includes("glob")) return state === "running" ? "Searching files" : "Searched files";
        if (lower.includes("edit") || lower.includes("write")) return state === "running" ? "Editing file" : "Edited file";
        if (lower.includes("read") || lower.includes("file") || lower.includes("knowledge")) return state === "running" ? "Reading file" : "Read file";
        if (lower.includes("bash") || lower.includes("command") || lower.includes("shell")) return state === "running" ? "Running command" : "Ran command";
        return state === "running" ? "Using tool" : "Used tool";
      };
      const emitActivity = (payload: Record<string, unknown>): void => {
        activitySequence += 1;
        const enriched = { requestId: reqId, at: Date.now(), id: `act_${reqId}_${activitySequence}`, ...payload };
        sseWrite("activity", enriched);
        const captured = captureActivity(enriched);
        if (!captured) return;
        storeCapturedActivity(captured);
      };
      const parallelToolActivity = createParallelToolActivityCoordinator();
      // Runtime emits work_token / answer_start / answer_token / answer_end with explicit
      // answer-phase gating. Server maps work → narration_token, answer → final-answer.
      let pendingWork = "";
      let answerPhaseStarted = false;
      const promotePendingWorkToActivity = (): void => {
        const trimmed = pendingWork.trim();
        pendingWork = "";
        if (!trimmed || answerPhaseStarted) return;
        emitActivity({
          label: trimmed.slice(0, 600),
          kind: "context"
        });
        sseWrite("narration_reset", { requestId: reqId });
      };
      const primaryStream = agentRuntime.runTurnStream({
        projectId,
        userId: session.userId,
        requestId: reqId,
        conversationId,
        canConfigure: hasConfigurePermission(store, session.userId, projectId),
        messages: agentInputs.conversationMessages,
        providerMessages: agentInputs.providerMessages,
        provider,
        knowledgeBaseDocuments: agentInputs.knowledgeBaseDocuments,
        repositoryArtifacts: agentInputs.repositoryArtifacts
      });
      let primaryStep = await primaryStream.next();
      while (!primaryStep.done) {
        const event = primaryStep.value;
        if (event.type === "work_token") {
          if (answerPhaseStarted) break;
          pendingWork += event.message;
          pauseWorkTimeline();
          sseWrite("narration_token", { content: event.message });
        } else if (event.type === "answer_start") {
          answerPhaseStarted = true;
          pendingWork = "";
          pauseWorkTimeline();
          sseWrite("final_answer_start", { requestId: reqId });
        } else if (event.type === "answer_token") {
          pauseWorkTimeline();
          sseWrite("answer_token", { content: event.message });
        } else if (event.type === "answer_end") {
          sseWrite("final_answer_end", { requestId: reqId });
        } else if (event.type === "progress") {
          const kind = typeof event.metadata?.progressKind === "string" ? event.metadata.progressKind : "context";
          const dedupKey = `${kind}:${event.message}`;
          const now = Date.now();
          if ((seenActivities.get(dedupKey) ?? 0) + 1200 < now) {
            seenActivities.set(dedupKey, now);
            emitActivity({
              label: event.message,
              kind,
              ...(event.metadata?.progressRaw ? { raw: event.metadata.progressRaw } : {})
            });
          }
        } else if (event.type === "tool_started") {
          resumeWorkTimeline();
          const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
          const toolCount = event.metadata?.toolCount;
          if (toolName || typeof toolCount === "number") {
            promotePendingWorkToActivity();
          }
          parallelToolActivity.onToolStarted(event, emitActivity, toolLabelFor, sanitizeToolDetail, reqId);
        } else if (event.type === "tool_completed") {
          const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
          const shouldHandle =
            toolName ||
            event.metadata?.parallel === true ||
            event.metadata?.flushToolActivities === true;
          if (shouldHandle) {
            parallelToolActivity.onToolCompleted(event, emitActivity, toolLabelFor, sanitizeToolDetail, reqId);
          }
        } else if (event.type === "turn_completed") {
          pendingWork = "";
          finalText = event.message || "";
        }
        primaryStep = await primaryStream.next();
      }
      const primaryResult = primaryStep.done ? primaryStep.value : null;
      streamGeneratedImages = primaryResult?.generatedImages ?? [];
      streamGeneratedDownloads = primaryResult?.generatedDownloads ?? [];

      finalProviderDiagnostics = providerDiagnostics(provider.metadata, false);
    } catch (error) {
      if (allowProviderFallback) {
        request.log.warn(
          { requestId: reqId, providerError: redactedProviderError(error) },
          "Chat provider streaming failed; using deterministic fallback"
        );
        const fallbackProvider = createDeterministicMockProvider(providerErrorCode(error), error);

        try {
          const knowledgeBaseDocuments = store.knowledgeBaseByProject[projectId] ?? [];
          const repositoryArtifacts = store.repositoryByProject[projectId] ?? [];
          const fallbackSeenActivities = new Map<string, number>();
          let fallbackActivitySequence = 0;
          const sanitizeFallbackToolDetail = (value: unknown): string | undefined => {
            if (typeof value !== "string") return undefined;
            const trimmed = value.replace(/[A-Za-z0-9_./\\-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_./\\-]*/gi, "[redacted]").trim();
            return trimmed ? trimmed.slice(0, 180) : undefined;
          };
          const fallbackGroundingToolLabel = (state: "running" | "done", metadata?: Record<string, unknown>): string => {
            if (state === "running") {
              return "Retrieving site rules";
            }
            const count = metadata?.retrievedGroundingCount;
            const names = metadata?.retrievedRuleNames;
            if (typeof count === "number" && count > 0) {
              if (Array.isArray(names)) {
                const listed = names.filter((name): name is string => typeof name === "string").slice(0, 3);
                if (listed.length > 0) {
                  const joined = listed.join(", ");
                  return count === 1
                    ? `Retrieved site rule: ${joined}`
                    : `Retrieved site rules (${count}): ${joined}${names.length > 3 ? ", …" : ""}`;
                }
              }
              return `Retrieved site rules (${count})`;
            }
            return "No matching site rules";
          };
          const fallbackToolLabelFor = (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>): string => {
            if (state === "done" && typeof metadata?.exitCode === "number" && metadata.exitCode !== 0) {
              return "Tool failed";
            }
            if (toolName === "project_grounding") {
              return fallbackGroundingToolLabel(state, metadata);
            }
            if (toolName === "bms_points_query") return state === "running" ? "Finding BMS points" : "Found BMS points";
            if (toolName === "dashboard_create") return state === "running" ? "Creating dashboard" : "Created dashboard";
            const lower = toolName.toLowerCase();
            if (lower.includes("search") || lower.includes("grep") || lower.includes("glob")) return state === "running" ? "Searching files" : "Searched files";
            if (lower.includes("edit") || lower.includes("write")) return state === "running" ? "Editing file" : "Edited file";
            if (lower.includes("read") || lower.includes("file") || lower.includes("knowledge")) return state === "running" ? "Reading file" : "Read file";
            if (lower.includes("bash") || lower.includes("command") || lower.includes("shell")) return state === "running" ? "Running command" : "Ran command";
            return state === "running" ? "Using tool" : "Used tool";
          };
          const emitFallbackActivity = (payload: Record<string, unknown>): void => {
            fallbackActivitySequence += 1;
            const enriched = { requestId: reqId, at: Date.now(), id: `act_${reqId}_fb_${fallbackActivitySequence}`, ...payload };
            sseWrite("activity", enriched);
            const captured = captureActivity(enriched);
            if (!captured) return;
            storeCapturedActivity(captured);
          };
          const fallbackParallelToolActivity = createParallelToolActivityCoordinator();
          let fallbackPendingWork = "";
          let fallbackAnswerPhaseStarted = false;
          const promoteFallbackPendingWorkToActivity = (): void => {
            const trimmed = fallbackPendingWork.trim();
            fallbackPendingWork = "";
            if (!trimmed || fallbackAnswerPhaseStarted) return;
            emitFallbackActivity({
              label: trimmed.slice(0, 600),
              kind: "context"
            });
            sseWrite("narration_reset", { requestId: reqId });
          };
          const fallbackStream = agentRuntime.runTurnStream({
            projectId,
            userId: session.userId,
            requestId: reqId,
            conversationId,
            canConfigure: hasConfigurePermission(store, session.userId, projectId),
            messages: agentInputs.conversationMessages,
            providerMessages: agentInputs.providerMessages,
            provider: fallbackProvider,
            knowledgeBaseDocuments: agentInputs.knowledgeBaseDocuments,
            repositoryArtifacts: agentInputs.repositoryArtifacts
          });
          let fallbackStep = await fallbackStream.next();
          while (!fallbackStep.done) {
            const event = fallbackStep.value;
            if (event.type === "work_token") {
              fallbackPendingWork += event.message;
              if (!fallbackAnswerPhaseStarted) {
                pauseWorkTimeline();
                sseWrite("narration_token", { content: event.message });
              }
            } else if (event.type === "answer_start") {
              fallbackAnswerPhaseStarted = true;
              fallbackPendingWork = "";
              pauseWorkTimeline();
              sseWrite("final_answer_start", { requestId: reqId });
            } else if (event.type === "answer_token") {
              pauseWorkTimeline();
              sseWrite("answer_token", { content: event.message });
            } else if (event.type === "answer_end") {
              sseWrite("final_answer_end", { requestId: reqId });
            } else if (event.type === "progress") {
              const fkind = typeof event.metadata?.progressKind === "string" ? event.metadata.progressKind : "context";
              const fdedupKey = `${fkind}:${event.message}`;
              const fnow = Date.now();
              if ((fallbackSeenActivities.get(fdedupKey) ?? 0) + 1200 < fnow) {
                fallbackSeenActivities.set(fdedupKey, fnow);
                emitFallbackActivity({
                  label: event.message,
                  kind: fkind,
                  ...(event.metadata?.progressRaw ? { raw: event.metadata.progressRaw } : {})
                });
              }
            } else if (event.type === "tool_started") {
              resumeWorkTimeline();
              const ftoolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
              const ftoolCount = event.metadata?.toolCount;
              if (ftoolName || typeof ftoolCount === "number") {
                promoteFallbackPendingWorkToActivity();
              }
              fallbackParallelToolActivity.onToolStarted(
                event,
                emitFallbackActivity,
                fallbackToolLabelFor,
                sanitizeFallbackToolDetail,
                `${reqId}_fb`
              );
            } else if (event.type === "tool_completed") {
              const ftoolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
              const fshouldHandle =
                ftoolName ||
                event.metadata?.parallel === true ||
                event.metadata?.flushToolActivities === true;
              if (fshouldHandle) {
                fallbackParallelToolActivity.onToolCompleted(
                  event,
                  emitFallbackActivity,
                  fallbackToolLabelFor,
                  sanitizeFallbackToolDetail,
                  `${reqId}_fb`
                );
              }
            } else if (event.type === "turn_completed") {
              fallbackPendingWork = "";
              finalText = event.message || "";
            }
            fallbackStep = await fallbackStream.next();
          }
          streamGeneratedImages = fallbackStep.value.generatedImages;
          streamGeneratedDownloads = fallbackStep.value.generatedDownloads;

          finalProviderDiagnostics = providerDiagnostics(fallbackProvider.metadata, true);
        } catch (fallbackError) {
          streamError = "Agent streaming failed after fallback.";
          sseWrite("error", {
            code: "agent_stream_error",
            message: streamError,
            requestId: reqId
          });
        }
      } else {
        streamError = formatProviderFailureMessage(error);
        sseWrite("error", {
          code: "provider_error",
          message: streamError,
          requestId: reqId
        });
      }
    }

    if (streamError && !finalText) {
      messages.pop();
      conversation.messageIds.pop();
      finishActiveChatStream(projectId, conversationId, reqId);
      reply.raw.end();
      return;
    }

    // Store assistant message
    const assistantContent = appendCreatedDashboardLinks(
      stripProviderThinkingMarkup(finalText || "I wasn't able to complete the analysis."),
      projectId,
      dashboardsCreatedAfter(store, projectId, dashboardIdsBeforeTurn)
    );
    const finalizedAssistant = finalizeAssistantContent(
      assistantContent,
      streamGeneratedImages,
      streamGeneratedDownloads
    );
    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "assistant",
      content: finalizedAssistant.content,
      ...(finalizedAssistant.images ? { images: finalizedAssistant.images } : {}),
      ...(finalizedAssistant.downloads ? { downloads: finalizedAssistant.downloads } : {}),
      ...(capturedActivities.length > 0 ? { activities: capturedActivities } : {}),
      workDuration: (() => {
        pauseWorkTimeline();
        return workElapsedMs;
      })()
    };
    messages.push(assistantMessage);
    conversation.messageIds.push(assistantMessage.id);
    trimProjectMessages(store, projectId, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;
    sessionIndex.upsertMessage(assistantMessage, conversationId, {
      title: conversation.title,
      messageCount: conversation.messageIds.length
    });

    persistSoon();

    // Send final done event
    sseWrite("done", {
      message: userMessage,
      assistantMessage,
      conversationId,
      conversationTitle: conversation.title,
      provider: finalProviderDiagnostics,
      fallbackUsed: finalProviderDiagnostics?.fallbackUsed ?? false,
      requestId: reqId
    });

    reply.raw.end();
    finishActiveChatStream(projectId, conversationId, reqId);

    if (isFirstConversationExchange(conversation, messages)) {
      void refineConversationTitleWithBuildingGptContext({
        conversation,
        userText: content,
        assistantText: finalizedAssistant.content,
        onUpdated(title) {
          persistSoon();
          broadcastToProject(projectId, {
            type: "conversation_title_updated",
            conversationId,
            title,
            projectId
          });
        }
      });
    }
  });

  app.delete<{ Params: ProjectParams; Querystring: { conversationId?: string } }>("/api/projects/:projectId/chat", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const projectId = request.params.projectId;
    const conversationId = typeof request.query?.conversationId === "string" ? request.query.conversationId : undefined;
    const conversations = store.conversationsByProject[projectId] ?? [];
    const conversation = conversationId ? conversations.find((c) => c.id === conversationId) : conversations[conversations.length - 1];

    if (!conversation) {
      return reply.status(200).send({
        projectId,
        clearedMessages: 0,
        clearedMemories: 0,
        requestId: requestIdFor(request)
      });
    }

    const clearedMessageIds = new Set(conversation.messageIds);
    const allMessages = store.messagesByProject[projectId] ?? [];
    const remainingMessages = allMessages.filter((m) => !clearedMessageIds.has(m.id));
    store.messagesByProject[projectId] = remainingMessages;
    conversation.messageIds = [];
    conversation.title = "New conversation";

    const resetResult = await tools.dispatch(
      "session_reset",
      {},
      {
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        conversationId: conversation?.id ?? "",
        canConfigure: hasConfigurePermission(store, session.userId, projectId),
        messages: []
      }
    );

    persistSoon();
    return reply.status(200).send({
      projectId,
      clearedMessages: clearedMessageIds.size,
      clearedMemories: typeof resetResult.result.clearedMemories === "number" ? resetResult.result.clearedMemories : 0,
      requestId: requestIdFor(request)
    });
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/conversations", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const allMessages = store.messagesByProject[request.params.projectId] ?? [];
    const messageIndexById = new Map(allMessages.map((message, index) => [message.id, index]));
    const conversations = (store.conversationsByProject[request.params.projectId] ?? [])
      .filter((c) => c.messageIds.length > 0)
      .map((c) => {
        const lastMessageId = c.messageIds[c.messageIds.length - 1];
        return {
          id: c.id,
          title: c.title,
          messageCount: c.messageIds.length,
          createdAt: c.createdAt,
          lastActivityIndex: typeof lastMessageId === "string" ? (messageIndexById.get(lastMessageId) ?? -1) : -1
        };
      })
      .sort((left, right) => {
        if (right.lastActivityIndex !== left.lastActivityIndex) {
          return right.lastActivityIndex - left.lastActivityIndex;
        }
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      })
      .map(({ lastActivityIndex: _lastActivityIndex, ...conversation }) => conversation);

    return {
      conversations: bounded(conversations, store.maxListSize),
      limit: store.maxListSize,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams }>("/api/projects/:projectId/conversations", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const conversation: Conversation = {
      id: nextConversationId(),
      projectId: request.params.projectId,
      title: "New conversation",
      messageIds: [],
      createdAt: new Date().toISOString()
    };
    store.conversationsByProject[request.params.projectId] = [
      ...(store.conversationsByProject[request.params.projectId] ?? []),
      conversation
    ];
    persistSoon();

    return reply.status(201).send({
      conversation: { id: conversation.id, title: conversation.title, messageCount: 0, createdAt: conversation.createdAt },
      requestId: requestIdFor(request)
    });
  });

  app.post<{ Params: ProjectParams & { convId: string } }>("/api/projects/:projectId/conversations/:convId/select", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const selected = requireSelectedProject(request, reply, session, request.params.projectId);
    if (isReply(selected)) {
      return selected;
    }

    const readable = requirePermission(request, reply, membership, "chat:read");
    if (isReply(readable)) {
      return readable;
    }

    const conversations = store.conversationsByProject[request.params.projectId] ?? [];
    const conversation = conversations.find((c) => c.id === request.params.convId);
    if (!conversation) {
      return sendError(request, reply, 404, "conversation_not_found", "The requested conversation does not exist in this project.");
    }

    let allMessages = store.messagesByProject[request.params.projectId] ?? [];
    if (repairMissingConversationMessages(store, request.params.projectId, conversation, sessionIndex, session.userId)) {
      persistSoon();
      allMessages = store.messagesByProject[request.params.projectId] ?? [];
    }
    const messages = orderedConversationMessages(allMessages, conversation);

    return {
      conversation: { id: conversation.id, title: conversation.title, messageCount: conversation.messageIds.length, createdAt: conversation.createdAt },
      messages: bounded(messages, store.maxListSize),
      requestId: requestIdFor(request)
    };
  });

  app.delete<{ Params: ProjectParams & { convId: string } }>("/api/projects/:projectId/conversations/:convId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const conversations = store.conversationsByProject[request.params.projectId] ?? [];
    const conversation = conversations.find((c) => c.id === request.params.convId);
    if (!conversation) {
      return sendError(request, reply, 404, "conversation_not_found", "The requested conversation does not exist in this project.");
    }

    const allMessages = store.messagesByProject[request.params.projectId] ?? [];
    const idSet = new Set(conversation.messageIds);
    store.messagesByProject[request.params.projectId] = allMessages.filter((m) => !idSet.has(m.id));
    store.conversationsByProject[request.params.projectId] = conversations.filter((c) => c.id !== request.params.convId);
    persistSoon();

    return {
      deleted: true,
      conversationId: request.params.convId,
      removedMessages: idSet.size,
      requestId: requestIdFor(request)
    };
  });

  app.patch<{ Params: ProjectParams & { convId: string }; Body: { title?: unknown } }>("/api/projects/:projectId/conversations/:convId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const conversations = store.conversationsByProject[request.params.projectId] ?? [];
    const conversation = conversations.find((c) => c.id === request.params.convId);
    if (!conversation) {
      return sendError(request, reply, 404, "conversation_not_found", "The requested conversation does not exist in this project.");
    }

    const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
    if (!title || title.length > 80) {
      return sendError(request, reply, 422, "conversation_invalid", "Conversation title must be 1-80 characters.");
    }

    conversation.title = title;
    persistSoon();

    return {
      conversation: { id: conversation.id, title: conversation.title, messageCount: conversation.messageIds.length, createdAt: conversation.createdAt },
      requestId: requestIdFor(request)
    };
  });

  app.delete<{ Params: ProjectParams }>("/api/projects/:projectId", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const membership = requireProjectMembership(request, reply, store, session, request.params.projectId);
    if (isReply(membership)) {
      return membership;
    }

    const writable = requirePermission(request, reply, membership, "chat:write");
    if (isReply(writable)) {
      return writable;
    }

    const projectId = request.params.projectId;
    store.projects = store.projects.filter((p) => p.id !== projectId);
    store.memberships = store.memberships.filter((m) => m.projectId !== projectId);
    delete store.messagesByProject[projectId];
    delete store.conversationsByProject[projectId];
    delete store.repositoryByProject[projectId];
    delete store.knowledgeBaseByProject[projectId];
    if (store.fddBindingProposalAuditsByProject) {
      delete store.fddBindingProposalAuditsByProject[projectId];
    }
    if (store.fddFleetTemplateVersionsByProject) {
      delete store.fddFleetTemplateVersionsByProject[projectId];
    }
    if (store.fddFleetTemplateAuditByProject) {
      delete store.fddFleetTemplateAuditByProject[projectId];
    }
    if (store.fddFleetGuardRolloutByProject) {
      delete store.fddFleetGuardRolloutByProject[projectId];
    }
    writeSessionForToken(store, session.token, { userId: session.userId, selectedProjectId: null });
    persistSoon();

    return {
      deleted: true,
      projectId,
      requestId: requestIdFor(request)
    };
  });

  app.post("/api/stt/transcribe", async (request, reply) => {
    const session = authenticateRequest(request, reply, store);
    if (isReply(session)) {
      return session;
    }

    const apiKey = env.DASHSCOPE_API_KEY;
    const model = env.ALIYUN_STT_MODEL || "paraformer-v2";

    if (!apiKey) {
      return sendError(request, reply, 503, "stt_unavailable", "Speech-to-text service is not configured.");
    }

    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.startsWith("audio/")) {
      return sendError(request, reply, 415, "stt_invalid_format", "Content-Type must be audio/* (e.g., audio/webm, audio/wav).");
    }

    const rawBody = await request.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return sendError(request, reply, 422, "stt_empty_audio", "Audio data is required.");
    }

    try {
      const text = await transcribeAudioViaParaformer(apiKey, model, rawBody);
      return { text, requestId: requestIdFor(request) };
    } catch (error) {
      request.log.error({ err: error, requestId: requestIdFor(request) }, "STT transcription failed");
      if (error instanceof Error && error.message.includes("401")) {
        return sendError(request, reply, 503, "stt_auth_failed", "Speech-to-text authentication failed.");
      }
      return sendError(request, reply, 500, "stt_failed", "Speech-to-text transcription failed.");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return sendError(request, reply, 422, "chat_invalid", "Request payload is invalid.");
    }

    // Fastify content-type parser rejects empty body with application/json
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return sendError(request, reply, 422, "request_invalid", "Request body must not be empty when Content-Type is application/json.");
    }

    request.log.error({ err: error, requestId: requestIdFor(request) }, "Unhandled API error");
    return sendError(request, reply, 500, "internal_error", "Unexpected API error.");
  });

  // WebSocket server for real-time push notifications
  const wss = new WebSocketServer({ noServer: true });

  app.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const match = /^\/api\/projects\/([^/]+)\/ws$/.exec(url.pathname);
    if (!match) return;

    const projectId = match[1]!;
    const token = url.searchParams.get("token");
    const userId = token ? resolveUserIdForToken(store, token) : null;
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const member = store.memberships.find((m) => m.projectId === projectId && m.userId === userId);
    if (!member || !member.permissions.includes("chat:read")) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let sockets = wsConnections.get(projectId);
      if (!sockets) {
        sockets = new Set();
        wsConnections.set(projectId, sockets);
      }
      sockets.add(ws);

      ws.send(JSON.stringify({ type: "connected", projectId }));

      ws.on("message", (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (payload.type !== "dashboard_subscribe" || !Array.isArray(payload.pointNames)) return;
          const pointNames = new Set(
            payload.pointNames
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter(Boolean)
          );
          let projectSubscriptions = dashboardSubscriptions.get(projectId);
          if (!projectSubscriptions) {
            projectSubscriptions = new Map();
            dashboardSubscriptions.set(projectId, projectSubscriptions);
          }
          projectSubscriptions.set(ws, pointNames);
          if (pointNames.size > 0) {
            ensureDashboardPoller(projectId);
          } else {
            maybeStopDashboardPoller(projectId);
          }
        } catch {
          // ignore malformed ws payloads
        }
      });

      ws.on("close", () => {
        const set = wsConnections.get(projectId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) wsConnections.delete(projectId);
        }
        const projectSubscriptions = dashboardSubscriptions.get(projectId);
        if (projectSubscriptions) {
          projectSubscriptions.delete(ws);
          if (projectSubscriptions.size === 0) {
            dashboardSubscriptions.delete(projectId);
          }
        }
        maybeStopDashboardPoller(projectId);
      });
    });
  });

  return app;
}

import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
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
import { createGenericToolRegistry } from "./agent/genericTools.js";
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
  restoreGroundingSequence
} from "./projectGrounding.js";
import {
  captureFeedbackEpisode,
  createProjectFeedbackBindings,
  ensureStoreProjectFeedback,
  restoreFeedbackSequence
} from "./projectFeedback.js";
import { createEmbeddingProvider } from "./embeddingProvider.js";
import { GroundingRuleIndex } from "./groundingRuleIndex.js";
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
import { bmsCollectorBaseUrl } from "./bmsCollectorUrl.js";
import { fetchTimeseries, type BmsTimeseriesRow } from "./bmsTimeseries.js";
import {
  canManageDashboard,
  canReadDashboard,
  DASHBOARD_LAYOUT_VERSION,
  dashboardPath,
  parseDashboardMutationInput,
  type DashboardMutationInput,
  type DashboardRecord
} from "./dashboards.js";

interface BmsDashboardHistoryBatchQuery {
  key: string;
  name?: string;
  point_id?: string;
  object_ref?: string;
  from: string;
  to?: string;
  range?: string;
  limit?: string;
  order?: string;
}

interface BuildServerOptions {
  store?: SeedStore;
  chatProvider?: ChatProvider;
  resolveChatProvider?: (env: ProviderEnv) => ChatProvider;
  env?: ProviderEnv;
  fetch?: FetchLike;
  allowProviderFallback?: boolean;
  persist?: boolean;
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

/** Best-effort LLM summary after the first assistant reply (does not block the chat response). */
async function refineConversationTitleWithLlm(params: {
  conversation: Conversation;
  userText: string;
  assistantText: string;
  provider: ChatProvider;
  projectId: string;
  userId: string;
  requestId: string;
  onUpdated?: (title: string) => void;
}): Promise<void> {
  const assistantSnippet = stripProviderThinkingMarkup(params.assistantText).slice(0, 500);
  const assistantForPrompt = assistantSnippet.length > 0 ? assistantSnippet : "(no answer yet)";
  try {
    const titleResult = await params.provider.complete({
      messages: [
        {
          role: "user",
          content: `Summarize this chat in 5 words or fewer. Reply ONLY with the summary, no other text. Do not include thinking tags or markdown. Use the same language as the User message (e.g. Hong Kong Cantonese if they wrote in Cantonese).\n\nUser: ${params.userText}\nAssistant: ${assistantForPrompt}`
        }
      ],
      projectId: params.projectId,
      userId: params.userId,
      requestId: params.requestId
    });
    const generated = sanitizeConversationTitle(titleResult.text.replace(/^["']|["']$/g, "").trim());
    const title = generated && !/<(think|redacted_thinking)/i.test(generated)
      ? generated
      : null;
    if (title && title !== params.conversation.title) {
      params.conversation.title = title;
      params.onUpdated?.(title);
    }
  } catch {
    // Keep the instant placeholder title.
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

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBmsDashboardHistoryBatchQuery(value: unknown): BmsDashboardHistoryBatchQuery | null {
  if (!isRecordValue(value)) return null;
  const key = stringField(value, "key");
  const from = stringField(value, "from");
  const name = stringField(value, "name");
  const pointId = stringField(value, "point_id") ?? stringField(value, "pointId");
  const objectRef = stringField(value, "object_ref") ?? stringField(value, "objectRef");
  const to = stringField(value, "to");
  const range = stringField(value, "range");
  const limit = stringField(value, "limit");
  if (!key || !from || (!name && !pointId && !objectRef)) return null;
  return {
    key,
    from,
    ...(name ? { name } : {}),
    ...(pointId ? { point_id: pointId } : {}),
    ...(objectRef ? { object_ref: objectRef } : {}),
    ...(to ? { to } : {}),
    ...(range ? { range } : {}),
    ...(limit ? { limit } : {}),
    ...(stringField(value, "order") === "desc" ? { order: "desc" } : { order: "asc" })
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

const BMS_DASHBOARD_HISTORY_BATCH_CONCURRENCY = 8;
const BMS_DASHBOARD_POINT_CACHE_TTL_MS = 10 * 60_000;
const BMS_DASHBOARD_POINT_CACHE_MAX_ENTRIES = 2048;

const bmsDashboardPointIdCache = new Map<string, { savedAt: number; pointId: string }>();

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
  const fetchProxy = options.fetch ?? fetch;
  const memory = new AgentMemoryStore(dataRoot(env));
  memory.start();
  const sessionIndex = new SessionSearchIndex(dataRoot(env));
  sessionIndex.rebuildFromStore(store);
  const embeddingProvider = createEmbeddingProvider(env, fetchProxy);
  const groundingRuleIndex = new GroundingRuleIndex(dataRoot(env), embeddingProvider);
  groundingRuleIndex.rebuildFromStore(store);
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
    elementBmsBridge.seedElementSource("project_element");
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

  const mockHealth = (): { ok: boolean; service: string; request_id: string } => ({
    ok: true,
    service: "mock-bms-service",
    request_id: "req_bms_mock"
  });

  const mockSourceById = (sourceId: string): BmsSourceState => {
    const source = bmsSources.get(sourceId);
    if (!source) {
      throw new Error("bms_source_not_found");
    }
    return source;
  };

  const isElementBmsProject = (projectId: string): boolean =>
    projectId === "project_element" && elementBmsBridge !== null;

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
    projectMemoryProposalBindings
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

    const baseUrl = bmsCollectorBaseUrl(env);
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
    if (elementBmsBridge) {
      return elementBmsBridge.health();
    }
    if (useMockBmsClient) return mockHealth();
    const proxied = await proxyBms(env, fetchProxy, "/health", { method: "GET" });
    return reply.status(proxied.statusCode).send(proxied.payload);
  });

  const forwardBmsCollector = async (request: { url: string; method: string }, reply: FastifyReply) => {
    const session = authenticateRequest(request as Parameters<typeof authenticateRequest>[0], reply, store);
    if (isReply(session)) {
      return session;
    }
    const parsed = new URL(request.url, "http://buildingagent.local");
    const prefix = "/api/bms/collector";
    const pathname = parsed.pathname.startsWith(prefix)
      ? parsed.pathname.slice(prefix.length) || "/"
      : "/";
    const proxied = await proxyBmsCollector(env, fetchProxy, pathname, parsed.search, { method: request.method });
    if (proxied.contentType) {
      reply.header("content-type", proxied.contentType);
    }
    return reply.status(proxied.statusCode).send(proxied.payload);
  };

  app.get("/api/bms/collector/*", forwardBmsCollector);
  app.get("/api/bms/collector", async (request, reply) => forwardBmsCollector({ url: "/api/bms/collector/health", method: "GET" }, reply));

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
      return sendError(request, reply, 422, "bms_history_batch_invalid", "Each query requires key, from, and name/point_id/object_ref.");
    }

    const baseUrl = bmsCollectorBaseUrl(env);
    const abortController = new AbortController();
    const abortIfClientClosed = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    };
    reply.raw.on("close", abortIfClientClosed);

    try {
      const results = await mapWithConcurrency(
        queries as BmsDashboardHistoryBatchQuery[],
        BMS_DASHBOARD_HISTORY_BATCH_CONCURRENCY,
        async (query) => {
          try {
            const params = paramsForBmsDashboardHistoryBatchQuery(query);
            const pointId = await resolveBmsDashboardPointId(baseUrl, query, fetchProxy as typeof fetch, abortController.signal);
            if (pointId) {
              params.point_id = pointId;
              delete params.name;
              delete params.object_ref;
            }
            const result = await fetchTimeseries(
              baseUrl,
              params,
              fetchProxy as typeof fetch,
              { signal: abortController.signal, preferReadings: true }
            );
            return {
              key: query.key,
              ok: true,
              total: result.total,
              items: result.items as BmsTimeseriesRow[]
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

    const assistantText = stripProviderThinkingMarkup(agentTurn.completion.text);
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
      void refineConversationTitleWithLlm({
        conversation,
        userText: content,
        assistantText,
        provider,
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
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

    let finalText = "";
    let finalProviderDiagnostics: ReturnType<typeof providerDiagnostics> | null = null;
    let streamError: string | null = null;
    let streamGeneratedImages: ChatMessageImage[] = [];
    let streamGeneratedDownloads: ChatMessageDownload[] = [];
    const turnStartedAt = Date.now();
    let workElapsedMs = 0;
    let workSegmentStartedAt: number | null = turnStartedAt;
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
      reply.raw.end();
      return;
    }

    // Store assistant message
    const assistantContent = stripProviderThinkingMarkup(finalText || "I wasn't able to complete the analysis.");
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

    if (isFirstConversationExchange(conversation, messages)) {
      void refineConversationTitleWithLlm({
        conversation,
        userText: content,
        assistantText: finalizedAssistant.content,
        provider,
        projectId,
        userId: session.userId,
        requestId: reqId,
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

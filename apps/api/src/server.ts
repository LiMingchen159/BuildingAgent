import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import {
  authenticateRequest,
  getPermissionsForSelectedProject,
  requestIdFor,
  requirePermission,
  requireProjectMembership,
  requireSelectedProject,
  sendError
} from "./auth.js";
import { createSeedStore, type ChatMessage, type Conversation, type RepositoryArtifact, type SeedStore } from "./seed.js";
import {
  ProviderError,
  createDeterministicMockProvider,
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
import { ProcessRegistry } from "./agent/processRegistry.js";
import { AgentRuntime } from "./agent/runtime.js";
import { createGenericSkillRegistry } from "./agent/skills.js";
import { indexKnowledgeBase, knowledgeBaseRoot } from "./agent/knowledgeBase.js";
import { loadStoreSync, saveStoreSync, scheduleSave } from "./persistence.js";
import { SchedulerService, parseTimeExpression, parseRecurringExpression, parseCancelCommand, parseListCommand } from "./scheduler.js";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { resolve, join } from "path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import type { WebSocket } from "ws";
import { StructuredLogger, attachStructuredLogging } from "./agent/logger.js";
import { randomUUID } from "node:crypto";

interface BuildServerOptions {
  store?: SeedStore;
  chatProvider?: ChatProvider;
  resolveChatProvider?: (env: ProviderEnv) => ChatProvider;
  env?: ProviderEnv;
  fetch?: FetchLike;
  allowProviderFallback?: boolean;
  persist?: boolean;
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

let messageSequence = 0;
let conversationSequence = 0;

function nextMessageId(): string {
  messageSequence += 1;
  return `msg_${String(messageSequence).padStart(6, "0")}`;
}

function nextConversationId(): string {
  conversationSequence += 1;
  return `conv_${String(conversationSequence).padStart(6, "0")}`;
}

async function transcribeAudioViaParaformer(apiKey: string, model: string, audioBuffer: Buffer, baseUrl: string): Promise<string> {
  // Save audio to temp directory and provide URL for Aliyun API
  const tempDir = resolve(process.cwd(), '.temp-audio');
  try {
    mkdirSync(tempDir, { recursive: true });
  } catch {
    // Directory already exists
  }

  const audioId = randomUUID();
  const audioFile = join(tempDir, `${audioId}.webm`);
  writeFileSync(audioFile, audioBuffer);

  const audioUrl = `${baseUrl}/temp-audio/${audioId}.webm`;

  try {
    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        input: {
          file_urls: [audioUrl]
        },
        parameters: {
          language_hints: ["zh", "en", "yue"]
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Aliyun API error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as {
      output?: {
        results?: Array<{ transcription_text?: string }>;
      };
      message?: string;
    };

    if (result.output?.results && result.output.results.length > 0) {
      const text = result.output.results.map(r => r.transcription_text || "").join(" ").trim();
      return text;
    }

    throw new Error(result.message || "No transcription result");
  } finally {
    // Clean up temp file
    try {
      unlinkSync(audioFile);
    } catch {
      // Ignore cleanup errors
    }
  }
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
    }
  }
  messageSequence = maxMsg;
  conversationSequence = maxConv;
}

function kbRootForProject(projectId: string, baseRoot: string): string {
  const projectDir = path.join(baseRoot, projectId);
  if (!existsSync(projectDir)) {
    try { mkdirSync(projectDir, { recursive: true }); } catch { /* best effort */ }
  }
  return projectDir;
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

function trimChatMessages(messages: ChatMessage[], limit: number): void {
  if (messages.length > limit) {
    messages.splice(0, messages.length - limit);
  }
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
  return messages.map((message) => ({ role: message.role, content: message.content }));
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

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const store = options.store ?? (options.persist ? (loadStoreSync() ?? createSeedStore()) : createSeedStore());
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
  const memory = new AgentMemoryStore(path.join(knowledgeBaseRoot(env), "..", "data"));
  memory.start();
  const skills = createGenericSkillRegistry();

  // Structured JSON logging with file rotation (before scheduler so callbacks can use it)
  const logDir = path.join(knowledgeBaseRoot(env), "..", "data");
  const structuredLogger = new StructuredLogger({ dir: logDir, maxFileBytes: 5 * 1024 * 1024 });

  // Scheduler for reminders/cronjobs
  const schedulerDataDir = path.join(knowledgeBaseRoot(env), "..", "data");
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
  const tools = createGenericToolRegistry(memory, scheduler, processRegistry, skills);
  tools.enableLogging(path.join(knowledgeBaseRoot(env), "..", "data"));
  const agentRuntime = new AgentRuntime({ memory, tools, skills });
  const kbRoot = knowledgeBaseRoot(env);

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
  app.addContentTypeParser("audio/*", { parseAs: "buffer" }, (req, body, done) => {
    done(null, body);
  });

  // WebSocket connection tracking per project
  const wsConnections = new Map<string, Set<WebSocket>>();

  function broadcastToProject(projectId: string, data: Record<string, unknown>): void {
    const sockets = wsConnections.get(projectId);
    if (!sockets || sockets.size === 0) return;
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
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

  app.post<{ Body: LoginBody }>("/api/login", async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return sendError(request, reply, 401, "auth_invalid", "Invalid credentials.");
    }

    const user = store.users.find((candidate) => candidate.email === email && candidate.password === password);
    if (!user) {
      return sendError(request, reply, 401, "auth_invalid", "Invalid credentials.");
    }

    const token = Object.entries(store.tokens).find(([, userId]) => userId === user.id)?.[0];
    if (!token) {
      return sendError(request, reply, 401, "auth_invalid", "Invalid credentials.");
    }

    store.sessionsByToken[token] = { userId: user.id, selectedProjectId: null };
    persistSoon();

    return {
      token,
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

    const selectedSession = { userId: session.userId, selectedProjectId: projectId };
    store.sessionsByToken[session.token] = selectedSession;
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
          ...store.skills,
          ...skills.list().map((skill) => ({
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
    store.sessionsByToken[session.token] = selectedSession;
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

    const allMessages = store.messagesByProject[request.params.projectId] ?? [];
    const conversationId = typeof request.query?.conversationId === "string" ? request.query.conversationId : undefined;
    let messages = allMessages;
    let activeConversationId: string | null = null;

    if (conversationId) {
      const conversation = (store.conversationsByProject[request.params.projectId] ?? []).find((c) => c.id === conversationId);
      if (conversation) {
        const idSet = new Set(conversation.messageIds);
        messages = allMessages.filter((m) => idSet.has(m.id));
        activeConversationId = conversation.id;
      }
    } else {
      const conversations = store.conversationsByProject[request.params.projectId] ?? [];
      const lastConv = conversations.length > 0 ? conversations[conversations.length - 1] : undefined;
      if (lastConv) {
        const idSet = new Set(lastConv.messageIds);
        messages = allMessages.filter((m) => idSet.has(m.id));
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

    const projectKbRoot = kbRootForProject(request.params.projectId, kbRoot);
    const documents = await indexKnowledgeBase(request.params.projectId, { rootDir: projectKbRoot });
    store.knowledgeBaseByProject[request.params.projectId] = documents;

    return {
      projectId: request.params.projectId,
      documents: bounded(documents, store.maxListSize),
      rootConfigured: Boolean(kbRoot),
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

    return {
      projectId: request.params.projectId,
      artifacts: bounded(store.repositoryByProject[request.params.projectId] ?? [], store.maxListSize),
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
    trimChatMessages(messages, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;
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
      trimChatMessages(messages, store.maxChatMessages);
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
      trimChatMessages(messages, store.maxChatMessages);
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
    const projectKbRoot = kbRootForProject(projectId, kbRoot);
    try {
      const knowledgeBaseDocuments = await indexKnowledgeBase(projectId, { rootDir: projectKbRoot });
      store.knowledgeBaseByProject[projectId] = knowledgeBaseDocuments;
      agentTurn = await agentRuntime.runTurn({
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        conversationId,
        messages,
        providerMessages: chatHistoryForProvider(messages),
        provider,
        knowledgeBaseDocuments
      });
    } catch (error) {
      if (!allowProviderFallback) {
        messages.pop();
        conversation.messageIds.pop();
        return sendError(request, reply, 502, "provider_error", "Chat provider failed before producing a safe response.");
      }

      request.log.warn(
        { requestId: requestIdFor(request), providerError: redactedProviderError(error) },
        "Chat provider failed; using deterministic fallback"
      );
      const fallbackProvider = createDeterministicMockProvider(
        providerErrorCode(error)
      );
      const knowledgeBaseDocuments = store.knowledgeBaseByProject[projectId] ?? [];
      agentTurn = await agentRuntime.runTurn({
        projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        conversationId,
        messages,
        providerMessages: chatHistoryForProvider(messages),
        provider: fallbackProvider,
        knowledgeBaseDocuments
      });
    }

    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "assistant",
      content: agentTurn.completion.text
    };
    messages.push(assistantMessage);
    conversation.messageIds.push(assistantMessage.id);
    trimChatMessages(messages, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;

    // Auto-title: generate on first user message using the provider
    if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
      try {
        const titleResult = await provider.complete({
          messages: [
            { role: "user", content: `Summarize this chat in 5 words or fewer. Reply ONLY with the summary, no other text.\n\nUser: ${content}\nAssistant: ${agentTurn.completion.text}` }
          ],
          projectId,
          userId: session.userId,
          requestId: requestIdFor(request)
        });
        const title = titleResult.text.replace(/^["']|["']$/g, "").trim().slice(0, 60);
        if (title) {
          conversation.title = title;
        }
      } catch {
        // title generation is best-effort; failure is not an error
      }
    }

    persistSoon();
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

    // Store user message immediately
    const userMessage: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "user",
      content
    };
    messages.push(userMessage);
    conversation.messageIds.push(userMessage.id);
    store.messagesByProject[projectId] = messages;
    persistNow();

    // Set up SSE response
    const reqId = requestIdFor(request);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const sseWrite = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

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
      trimChatMessages(messages, store.maxChatMessages);
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
      trimChatMessages(messages, store.maxChatMessages);
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
    const turnStartedAt = Date.now();
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
      return act;
    };

    try {
      const projectKbRoot = kbRootForProject(projectId, kbRoot);
      const knowledgeBaseDocuments = await indexKnowledgeBase(projectId, { rootDir: projectKbRoot });
      store.knowledgeBaseByProject[projectId] = knowledgeBaseDocuments;

      const seenActivities = new Map<string, number>();
      let activitySequence = 0;
      const sanitizeToolDetail = (value: unknown): string | undefined => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.replace(/[A-Za-z0-9_./\\-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_./\\-]*/gi, "[redacted]").trim();
        return trimmed ? trimmed.slice(0, 180) : undefined;
      };
      const toolLabelFor = (toolName: string, state: "running" | "done"): string => {
        const lower = toolName.toLowerCase();
        if (lower.includes("search") || lower.includes("grep") || lower.includes("glob")) return state === "running" ? "Searching files" : "Searched files";
        if (lower.includes("edit") || lower.includes("write")) return state === "running" ? "Editing file" : "Edited file";
        if (lower.includes("read") || lower.includes("file") || lower.includes("knowledge")) return state === "running" ? "Reading file" : "Read file";
        if (lower.includes("bash") || lower.includes("command") || lower.includes("shell")) return state === "running" ? "Running command" : "Ran command";
        return state === "running" ? "Using tool" : "Used tool";
      };
      const emitActivity = (payload: Record<string, unknown>): void => {
        activitySequence += 1;
        const enriched = { id: `act_${reqId}_${activitySequence}`, requestId: reqId, ...payload };
        sseWrite("activity", enriched);
        const captured = captureActivity(enriched);
        if (!captured) return;
        // Replace by id so paired tool started/completed events collapse to one row in history.
        if (captured.id) {
          const existingIndex = capturedActivities.findIndex((a) => a.id === captured.id);
          if (existingIndex >= 0) {
            capturedActivities[existingIndex] = captured;
            return;
          }
        }
        capturedActivities.push(captured);
      };
      // Thinking tokens for the current iteration are streamed live to the client
      // as `token` events. If the iteration ends up calling tools, the same text
      // was interim narration, not the final answer — we then move it to a
      // context activity and send `token_reset` so the client drops it from the
      // streamed answer body. If the iteration ends without tool calls, the
      // buffered text IS the final answer and stays in the answer body.
      let pendingThinking = "";
      const promotePendingToActivity = (): void => {
        const trimmed = pendingThinking.trim();
        pendingThinking = "";
        if (!trimmed) return;
        emitActivity({
          label: trimmed.slice(0, 600),
          kind: "context"
        });
        sseWrite("token_reset", { requestId: reqId });
      };
      for await (const event of agentRuntime.runTurnStream({
        projectId,
        userId: session.userId,
        requestId: reqId,
        conversationId,
        messages,
        providerMessages: chatHistoryForProvider(messages),
        provider,
        knowledgeBaseDocuments
      })) {
        if (event.type === "thinking") {
          pendingThinking += event.message;
          sseWrite("token", { content: event.message });
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
          const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
          if (toolName) {
            // Any thinking streamed in this iteration was interim narration, not
            // the final answer. Roll it back on the client and promote to activity.
            promotePendingToActivity();
            const toolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
            emitActivity({
              ...(toolCallId ? { id: `tool_${reqId}_${toolCallId}` } : {}),
              label: toolLabelFor(toolName, "running"),
              kind: "tool",
              tool: toolName,
              status: "running",
              ...(sanitizeToolDetail(event.metadata?.args) ? { detail: sanitizeToolDetail(event.metadata?.args) } : {})
            });
          }
        } else if (event.type === "tool_completed") {
          const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
          if (toolName) {
            const toolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
            emitActivity({
              ...(toolCallId ? { id: `tool_${reqId}_${toolCallId}` } : {}),
              label: toolLabelFor(toolName, "done"),
              kind: "tool",
              tool: toolName,
              status: "done",
              ...(sanitizeToolDetail(event.metadata?.resultPreview) ? { output: sanitizeToolDetail(event.metadata?.resultPreview) } : {})
            });
          }
        } else if (event.type === "turn_completed") {
          pendingThinking = "";
          finalText = event.message || "";
        }
      }

      finalProviderDiagnostics = providerDiagnostics(provider.metadata, false);
    } catch (error) {
      if (allowProviderFallback) {
        request.log.warn(
          { requestId: reqId, providerError: redactedProviderError(error) },
          "Chat provider streaming failed; using deterministic fallback"
        );
        const fallbackProvider = createDeterministicMockProvider(providerErrorCode(error));

        try {
          const knowledgeBaseDocuments = store.knowledgeBaseByProject[projectId] ?? [];
          const fallbackSeenActivities = new Map<string, number>();
          let fallbackActivitySequence = 0;
          const sanitizeFallbackToolDetail = (value: unknown): string | undefined => {
            if (typeof value !== "string") return undefined;
            const trimmed = value.replace(/[A-Za-z0-9_./\\-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_./\\-]*/gi, "[redacted]").trim();
            return trimmed ? trimmed.slice(0, 180) : undefined;
          };
          const fallbackToolLabelFor = (toolName: string, state: "running" | "done"): string => {
            const lower = toolName.toLowerCase();
            if (lower.includes("search") || lower.includes("grep") || lower.includes("glob")) return state === "running" ? "Searching files" : "Searched files";
            if (lower.includes("edit") || lower.includes("write")) return state === "running" ? "Editing file" : "Edited file";
            if (lower.includes("read") || lower.includes("file") || lower.includes("knowledge")) return state === "running" ? "Reading file" : "Read file";
            if (lower.includes("bash") || lower.includes("command") || lower.includes("shell")) return state === "running" ? "Running command" : "Ran command";
            return state === "running" ? "Using tool" : "Used tool";
          };
          const emitFallbackActivity = (payload: Record<string, unknown>): void => {
            fallbackActivitySequence += 1;
            const enriched = { id: `act_${reqId}_fb_${fallbackActivitySequence}`, requestId: reqId, ...payload };
            sseWrite("activity", enriched);
            const captured = captureActivity(enriched);
            if (!captured) return;
            if (captured.id) {
              const existingIndex = capturedActivities.findIndex((a) => a.id === captured.id);
              if (existingIndex >= 0) {
                capturedActivities[existingIndex] = captured;
                return;
              }
            }
            capturedActivities.push(captured);
          };
          let fallbackPendingThinking = "";
          const promoteFallbackPendingToActivity = (): void => {
            const trimmed = fallbackPendingThinking.trim();
            fallbackPendingThinking = "";
            if (!trimmed) return;
            emitFallbackActivity({
              label: trimmed.slice(0, 600),
              kind: "context"
            });
            sseWrite("token_reset", { requestId: reqId });
          };
          for await (const event of agentRuntime.runTurnStream({
            projectId,
            userId: session.userId,
            requestId: reqId,
            conversationId,
            messages,
            providerMessages: chatHistoryForProvider(messages),
            provider: fallbackProvider,
            knowledgeBaseDocuments
          })) {
            if (event.type === "thinking") {
              fallbackPendingThinking += event.message;
              sseWrite("token", { content: event.message });
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
              const ftoolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
              if (ftoolName) {
                promoteFallbackPendingToActivity();
                const ftoolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
                emitFallbackActivity({
                  ...(ftoolCallId ? { id: `tool_${reqId}_fb_${ftoolCallId}` } : {}),
                  label: fallbackToolLabelFor(ftoolName, "running"),
                  kind: "tool",
                  tool: ftoolName,
                  status: "running",
                  ...(sanitizeFallbackToolDetail(event.metadata?.args) ? { detail: sanitizeFallbackToolDetail(event.metadata?.args) } : {})
                });
              }
            } else if (event.type === "tool_completed") {
              const ftoolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
              if (ftoolName) {
                const ftoolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
                emitFallbackActivity({
                  ...(ftoolCallId ? { id: `tool_${reqId}_fb_${ftoolCallId}` } : {}),
                  label: fallbackToolLabelFor(ftoolName, "done"),
                  kind: "tool",
                  tool: ftoolName,
                  status: "done",
                  ...(sanitizeFallbackToolDetail(event.metadata?.resultPreview) ? { output: sanitizeFallbackToolDetail(event.metadata?.resultPreview) } : {})
                });
              }
            } else if (event.type === "turn_completed") {
              fallbackPendingThinking = "";
              finalText = event.message || "";
            }
          }

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
        streamError = "Chat provider failed before producing a safe response.";
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
    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      projectId,
      userId: session.userId,
      role: "assistant",
      content: finalText || "I wasn't able to complete the analysis.",
      ...(capturedActivities.length > 0 ? { activities: capturedActivities } : {}),
      workDuration: Date.now() - turnStartedAt
    };
    messages.push(assistantMessage);
    conversation.messageIds.push(assistantMessage.id);
    trimChatMessages(messages, store.maxChatMessages);
    store.messagesByProject[projectId] = messages;

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

    // Auto-title is best-effort and must never delay the final answer.
    // When title is generated, broadcast to frontend via WebSocket for real-time sidebar update.
    if (conversation.messageIds.length === 2 && conversation.title === "New conversation") {
      void (async () => {
        try {
          const titleResult = await provider.complete({
            messages: [
              { role: "user", content: `Summarize this chat in 5 words or fewer. Reply ONLY with the summary, no other text.\n\nUser: ${content}\nAssistant: ${finalText}` }
            ],
            projectId,
            userId: session.userId,
            requestId: reqId
          });
          const title = titleResult.text.replace(/^["']|["']$/g, "").trim().slice(0, 60);
          if (title) {
            conversation.title = title;
            persistSoon();
            broadcastToProject(projectId, {
              type: "conversation_title_updated",
              conversationId,
              title,
              projectId
            });
          }
        } catch {
          // title generation is best-effort
        }
      })();
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

    const conversations = (store.conversationsByProject[request.params.projectId] ?? [])
      .filter((c) => c.messageIds.length > 0)
      .map((c) => ({ id: c.id, title: c.title, messageCount: c.messageIds.length, createdAt: c.createdAt }));

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

    const allMessages = store.messagesByProject[request.params.projectId] ?? [];
    const idSet = new Set(conversation.messageIds);
    const messages = allMessages.filter((m) => idSet.has(m.id));

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
    store.sessionsByToken[session.token] = { userId: session.userId, selectedProjectId: null };
    persistSoon();

    return {
      deleted: true,
      projectId,
      requestId: requestIdFor(request)
    };
  });

  // Serve temporary audio files for Aliyun STT API
  app.get("/temp-audio/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const tempDir = resolve(process.cwd(), '.temp-audio');
    const filePath = join(tempDir, filename);

    try {
      const { readFileSync } = await import('fs');
      const fileBuffer = readFileSync(filePath);
      reply.type('audio/webm').send(fileBuffer);
    } catch (error) {
      return sendError(request, reply, 404, "file_not_found", "Audio file not found");
    }
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

    // Get base URL for temp file hosting
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['host'] || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    try {
      const text = await transcribeAudioViaParaformer(apiKey, model, rawBody, baseUrl);
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
    if (!token || !store.tokens[token]) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const userId = store.tokens[token]!;
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

      ws.on("close", () => {
        const set = wsConnections.get(projectId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) wsConnections.delete(projectId);
        }
      });
    });
  });

  return app;
}

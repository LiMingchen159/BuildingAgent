import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import {
  authenticateRequest,
  getPermissionsForSelectedProject,
  requestIdFor,
  requirePermission,
  requireProjectMembership,
  requireSelectedProject,
  sendError
} from "./auth.js";
import { createSeedStore, type ChatMessage, type SeedStore } from "./seed.js";
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
import { AgentRuntime } from "./agent/runtime.js";
import { createGenericSkillRegistry } from "./agent/skills.js";

interface BuildServerOptions {
  store?: SeedStore;
  chatProvider?: ChatProvider;
  resolveChatProvider?: (env: ProviderEnv) => ChatProvider;
  env?: ProviderEnv;
  fetch?: FetchLike;
  allowProviderFallback?: boolean;
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

function nextMessageId(): string {
  messageSequence += 1;
  return `msg_${String(messageSequence).padStart(6, "0")}`;
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
  const store = options.store ?? createSeedStore();
  const env = options.env ?? process.env;
  const providerResolver =
    options.resolveChatProvider ??
    ((providerEnv: ProviderEnv) => resolveChatProvider(providerEnv, options.fetch ? { fetch: options.fetch } : {}));
  const allowProviderFallback = shouldAllowProviderFallback(env, options.allowProviderFallback);
  messageSequence = 0;

  const provider = options.chatProvider ?? providerResolver(env);
  const memory = new AgentMemoryStore();
  const skills = createGenericSkillRegistry();
  const tools = createGenericToolRegistry(memory);
  const agentRuntime = new AgentRuntime({ memory, tools, skills });
  const app = Fastify({
    logger: false,
    genReqId: (() => {
      let sequence = 0;
      return () => {
        sequence += 1;
        return `req_${String(sequence).padStart(6, "0")}`;
      };
    })()
  });

  void app.register(cors, { origin: true });

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

    store.sessionsByToken[token] = store.sessionsByToken[token] ?? { userId: user.id, selectedProjectId: null };

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

    return {
      session: {
        userId: session.userId,
        projectId: request.params.projectId,
        permissions: getPermissionsForSelectedProject(store, selectedSession)
      },
      requestId: requestIdFor(request)
    };
  });

  app.get<{ Params: ProjectParams }>("/api/projects/:projectId/chat", async (request, reply) => {
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
      messages: bounded(store.messagesByProject[request.params.projectId] ?? [], store.maxListSize),
      limit: store.maxListSize,
      requestId: requestIdFor(request)
    };
  });

  app.post<{ Params: ProjectParams; Body: ChatBody }>("/api/projects/:projectId/chat", async (request, reply) => {
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

    const messages = store.messagesByProject[request.params.projectId] ?? [];
    const message: ChatMessage = {
      id: nextMessageId(),
      projectId: request.params.projectId,
      userId: session.userId,
      role: "user",
      content
    };
    messages.push(message);
    trimChatMessages(messages, store.maxChatMessages);
    store.messagesByProject[request.params.projectId] = messages;

    let agentTurn;
    try {
      agentTurn = await agentRuntime.runTurn({
        projectId: request.params.projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        messages,
        providerMessages: chatHistoryForProvider(messages),
        provider
      });
    } catch (error) {
      if (!allowProviderFallback) {
        messages.pop();
        return sendError(request, reply, 502, "provider_error", "Chat provider failed before producing a safe response.");
      }

      request.log.warn(
        { requestId: requestIdFor(request), providerError: redactedProviderError(error) },
        "Chat provider failed; using deterministic fallback"
      );
      const fallbackProvider = createDeterministicMockProvider(
        providerErrorCode(error)
      );
      agentTurn = await agentRuntime.runTurn({
        projectId: request.params.projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        messages,
        providerMessages: chatHistoryForProvider(messages),
        provider: fallbackProvider
      });
    }

    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      projectId: request.params.projectId,
      userId: session.userId,
      role: "assistant",
      content: agentTurn.completion.text
    };
    messages.push(assistantMessage);
    trimChatMessages(messages, store.maxChatMessages);
    store.messagesByProject[request.params.projectId] = messages;

    return reply.status(201).send({
      message,
      assistantMessage,
      provider: providerDiagnostics(agentTurn.completion.provider, agentTurn.completion.fallbackUsed),
      fallbackUsed: agentTurn.completion.fallbackUsed,
      lifecycle: agentTurn.events,
      requestId: requestIdFor(request)
    });
  });

  app.delete<{ Params: ProjectParams }>("/api/projects/:projectId/chat", async (request, reply) => {
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

    const clearedMessages = store.messagesByProject[request.params.projectId]?.length ?? 0;
    store.messagesByProject[request.params.projectId] = [];
    const resetResult = await tools.dispatch(
      "session_reset",
      {},
      {
        projectId: request.params.projectId,
        userId: session.userId,
        requestId: requestIdFor(request),
        messages: []
      }
    );

    return reply.status(200).send({
      projectId: request.params.projectId,
      clearedMessages,
      clearedMemories: typeof resetResult.result.clearedMemories === "number" ? resetResult.result.clearedMemories : 0,
      requestId: requestIdFor(request)
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return sendError(request, reply, 422, "chat_invalid", "Request payload is invalid.");
    }

    request.log.error({ err: error, requestId: requestIdFor(request) }, "Unhandled API error");
    return sendError(request, reply, 500, "internal_error", "Unexpected API error.");
  });

  return app;
}

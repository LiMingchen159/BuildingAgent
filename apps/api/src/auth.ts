import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission, SeedMembership, SeedStore, SessionState } from "./seed.js";

export interface ApiSessionContext {
  token: string;
  userId: string;
  projectId: string | null;
  permissions: Permission[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function requestIdFor(request: FastifyRequest): string {
  return String(request.id).startsWith("req_") ? String(request.id) : `req_${request.id}`;
}

export function errorResponse(
  request: FastifyRequest,
  code: string,
  message: string
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      requestId: requestIdFor(request)
    }
  };
}

export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string
): FastifyReply {
  return reply.status(statusCode).send(errorResponse(request, code, message));
}

function parseBearer(header: unknown): string | null {
  if (typeof header !== "string") {
    return null;
  }

  const parts = header.trim().split(/\s+/u);
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return null;
  }

  return parts[1];
}

function membershipFor(store: SeedStore, userId: string, projectId: string): SeedMembership | undefined {
  return store.memberships.find(
    (membership) => membership.userId === userId && membership.projectId === projectId
  );
}

export function getPermissionsForSelectedProject(store: SeedStore, session: SessionState): Permission[] {
  if (!session.selectedProjectId) {
    return [];
  }
  return membershipFor(store, session.userId, session.selectedProjectId)?.permissions ?? [];
}

export function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  store: SeedStore
): ApiSessionContext | FastifyReply {
  const authorization = request.headers.authorization;
  if (authorization === undefined) {
    return sendError(request, reply, 401, "auth_missing", "Missing bearer token.");
  }

  const token = parseBearer(authorization);
  if (!token) {
    return sendError(request, reply, 401, "auth_invalid", "Invalid bearer token.");
  }

  const userId = store.tokens[token];
  if (!userId) {
    return sendError(request, reply, 401, "auth_invalid", "Invalid bearer token.");
  }

  const session = store.sessionsByToken[token] ?? { userId, selectedProjectId: null };
  store.sessionsByToken[token] = session;

  return {
    token,
    userId,
    projectId: session.selectedProjectId,
    permissions: getPermissionsForSelectedProject(store, session)
  };
}

export function requireProjectMembership(
  request: FastifyRequest,
  reply: FastifyReply,
  store: SeedStore,
  session: ApiSessionContext,
  projectId: string
): SeedMembership | FastifyReply {
  const projectExists = store.projects.some((project) => project.id === projectId);
  const membership = membershipFor(store, session.userId, projectId);

  if (!projectExists || !membership) {
    return sendError(request, reply, 403, "project_forbidden", "Project is not available for this session.");
  }

  return membership;
}

export function requireSelectedProject(
  request: FastifyRequest,
  reply: FastifyReply,
  session: ApiSessionContext,
  projectId: string
): true | FastifyReply {
  if (session.projectId !== projectId) {
    return sendError(request, reply, 403, "project_not_selected", "Select this project before using project resources.");
  }

  return true;
}

export function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  membership: SeedMembership,
  permission: Permission
): true | FastifyReply {
  if (!membership.permissions.includes(permission)) {
    return sendError(request, reply, 403, "project_forbidden", "Project permission is required.");
  }

  return true;
}

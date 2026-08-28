# Authentication, projects, and conversations

[中文](../../zh-CN/features/auth-projects-conversations.md) | [Developer documentation home](../README.md) | [Interfaces and events](../architecture/api-events.md)

> Code baseline: `main@af44ff15`. Status: core REST flows are Implemented; token revocation, a production identity provider, and fine-grained administration remain incomplete.

## 1. Status and code baseline

Fastify implements bearer parsing, session lookup, project membership, selected-project, and permission checks in [auth.ts](../../../../apps/api/src/auth.ts). [authTokens.ts](../../../../apps/api/src/authTokens.ts) issues local tokens and evaluates expiry; [server.ts](../../../../apps/api/src/server.ts) registers login, project, and conversation routes. The current identity model is a local `SeedStore`, not OAuth/OIDC, enterprise SSO, or a separate IAM service.

Status labels: login, session, project selection, and project-scoped conversations are **Implemented**; seed identities and the lightweight token lifecycle are **Partial**; an external identity provider is **Planned/External**.

## 2. Purpose and scope

These capabilities answer three questions: which user sent the request, whether that user belongs to the project in the URL, and which project the token currently has selected. A `projectId` is a resource identifier, not proof of authorization. Membership, selected-project state, and the required permission are separate server checks.

A conversation is an ordered set of message ids inside a project; it is not a login session. A login session stores `userId` and `selectedProjectId`, while a conversation stores a title, creation time, and `messageIds`.

## 3. User and source entry points

| Capability | REST entry | Primary implementation |
| --- | --- | --- |
| Login and current session | `POST /api/login`, `GET /api/session` | [server.ts](../../../../apps/api/src/server.ts), [authTokens.ts](../../../../apps/api/src/authTokens.ts) |
| List, create, and select projects | `GET/POST /api/projects`, `POST /api/projects/:projectId/select` | [server.ts](../../../../apps/api/src/server.ts) |
| List and create conversations | `GET/POST /api/projects/:projectId/conversations` | [server.ts](../../../../apps/api/src/server.ts) |
| Select, rename, and delete one | `POST .../:convId/select`, `PATCH/DELETE .../:convId` | [server.ts](../../../../apps/api/src/server.ts) |
| Web client | [apps/web/src/api.ts](../../../../apps/web/src/api.ts) | Stores a bearer token and consumes these contracts. |

## 4. Normal data flow

1. `POST /api/login` validates local credentials, reuses or issues a `ba_...` token, and ensures a login session exists for it.
2. The client sends `Authorization: Bearer <token>`; `authenticateRequest` resolves the token, user, and current `selectedProjectId`.
3. The client lists member projects and calls the select route. The server only selects a project for which membership exists and writes the choice back to the token session.
4. Project resources generally check membership, selected-project state, and permission in that order. Chat reads require `chat:read`; writes, reset, and most conversation mutations require `chat:write`.
5. After a conversation is created, Chat writes messages to the project message pool; the conversation holds only the ids in that thread. Listings sort by last message activity.
6. A first exchange gets an immediate title. A provider may refine it asynchronously and notify the client over SSE/WebSocket.

## 5. Data, state, and persistence

The authoritative local snapshot for users, token metadata, login sessions, projects, memberships, permissions, messages, and conversations is `apps/data/store.json`. Its shape is in [seed.ts](../../../../apps/api/src/seed.ts), and writes are in [persistence.ts](../../../../apps/api/src/persistence.ts). The default token TTL is 90 days. `BUILDING_AGENT_TOKEN_TTL_DAYS=0` disables automatic expiry; legacy seed tokens without metadata are also treated as non-expiring.

Repository-root `data/session_index.db`, maintained by [sessionIndex.ts](../../../../apps/api/src/sessionIndex.ts), supports project-scoped past-conversation search and is rebuilt from the store at startup. It is a rebuildable index, not the message authority. See [runtime and storage topology](../architecture/runtime-storage.md) for the recovery semantics of both data roots.

## 6. Authorization and project isolation

The permission enum is `chat:read`, `chat:write`, and `project:configure`. A newly created project grants its creator only the first two. Project configuration, project Memory, and some Agent mutations require `project:configure`.

The main Chat read/write and conversation list/create/select paths require both membership and a matching selected project. At this baseline, conversation rename/delete and project delete validate membership plus `chat:write` but do not call `requireSelectedProject`. This is a current enforcement difference; client state must not be treated as a substitute. WebSocket isolation is described in [interfaces and events](../architecture/api-events.md).

## 7. Errors, degradation, and external dependencies

- A missing or invalid token returns `401` with `auth_missing` or `auth_invalid`.
- A missing project or absent membership returns `403 project_forbidden`; selecting a different URL project returns `403 project_not_selected`.
- A missing permission also returns `403 project_forbidden`; callers should use the structured code rather than matching only English text.
- Invalid project names, conversation titles, or Chat bodies return `422`; an absent conversation returns `404 conversation_not_found`.
- Failure to load `apps/data/store.json` falls back to the seed store. This is a local-startup degradation path, not a production recovery guarantee.

## 8. Extension points

When adding a real identity provider, preserve `ApiSessionContext` and the project authorization boundary: map an external subject to an internal user instead of trusting user/project fields from the browser. A new project resource should reuse `authenticateRequest`, `requireProjectMembership`, `requireSelectedProject`, and `requirePermission`, with any intentional omission of selected-project enforcement documented. Token rotation, revocation, logout, password hashing, and audit policy require a separate security design.

## 9. Tests

- Login, session, project list, and selection: [apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- TTL and expired tokens: [apps/api/src/authTokens.test.ts](../../../../apps/api/src/authTokens.test.ts)
- Project isolation, conversation CRUD, auto-create, and ordering: [apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- In-conversation message order: [apps/api/src/conversationMessages.test.ts](../../../../apps/api/src/conversationMessages.test.ts)
- Browser API parsing and primary UI flow: [apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts), [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)

## 10. Known limitations and related documentation

- Local credentials and the token store are not a production identity system; repository fixtures are not a template for real customer account policy.
- There is no explicit logout/revoke route; expiry is evaluated when a token is resolved.
- Selected-project enforcement does not cover every mutation route and must be reviewed route by route.
- Conversation deletion changes current JSON messages, while the session SQLite database is a rebuildable retrieval index; their cleanup and recovery policies are different.
- Continue with [Chat and Agent Runtime](chat-agent-runtime.md), [Tools, Skills, Memory, and Grounding](tools-skills-memory-grounding.md), and [interfaces and events](../architecture/api-events.md).

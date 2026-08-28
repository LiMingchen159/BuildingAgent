# REST, SSE, and WebSocket contracts

[中文](../../zh-CN/architecture/api-events.md) | [Developer documentation home](../README.md) | [Current implementation architecture](current-architecture.md)

> Code baseline: `main@af44ff15`. Status: Fastify REST, Chat SSE, and project WebSocket are Implemented; client-declared and collector capabilities must be classified against actual providers.

## 1. Status and code baseline

The source of truth for the public local API is the Fastify routes and upgrade handler registered in [server.ts](../../../../apps/api/src/server.ts). The browser consumer is [apps/web/src/api.ts](../../../../apps/web/src/api.ts). A function or parser branch in the Web client alone does not prove that the server emits or implements the contract.

This page uses four states: **Implemented** means Fastify registers it now; **Partial** means only a branch or compatibility behavior exists; **External** means a collector/BMS/LLM supplies it; **Planned** means the client declares it without a matching Fastify implementation. Route-level BMS gaps are in [BMS integration](../features/bms-integration.md).

## 2. Purpose and scope

REST handles bounded request/response and resource CRUD. SSE is one-way incremental output within one Chat request. WebSocket carries project-wide asynchronous notifications and Dashboard point subscriptions. They share the project identity model but do not have the same retry or delivery semantics.

This page records current wire behavior. It does not add schemas, treat a TypeScript cast as runtime validation, or present an external collector path as a local Fastify route.

## 3. User and source entry points

| Contract surface | Implementation entry | Consumer entry |
| --- | --- | --- |
| REST | [server.ts](../../../../apps/api/src/server.ts), [auth.ts](../../../../apps/api/src/auth.ts) | [apps/web/src/api.ts](../../../../apps/web/src/api.ts), [apps/cli/src/api.ts](../../../../apps/cli/src/api.ts) |
| Chat SSE | `POST /api/projects/:projectId/chat/stream` in [server.ts](../../../../apps/api/src/server.ts) | `sendChatMessageStream` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| Project WebSocket | HTTP upgrade handler in [server.ts](../../../../apps/api/src/server.ts) | `createProjectSocket` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| Runtime internal events | [apps/api/src/agent/types.ts](../../../../apps/api/src/agent/types.ts), [runtime.ts](../../../../apps/api/src/agent/runtime.ts) | Mapped by the server; not automatically a wire enum. |

## 4. Normal data flow

### REST

The client sends a bearer token and Fastify assigns a `req_...` request id. Successful objects generally include `requestId` directly. The canonical error shape is:

```json
{"error":{"code":"project_not_selected","message":"Select this project before using project resources.","requestId":"req_000001"}}
```

Major Implemented groups cover login/session/projects/registry; project management/bounds/memory/chat/conversations/tool logs/KB/Repository/Dashboards; BMS bridge/proxy/ingestion; and STT. `/health` is the unauthenticated exception. Each route remains authoritative for its exact permission sequence.

### SSE

After a successful handshake, the response uses `Content-Type: text/event-stream`; each frame contains `event: <name>` and JSON `data:`. The current server emits:

| Event | Payload and meaning |
| --- | --- |
| `conversation_title` | `{conversationId,title,requestId}` for the immediate title. |
| `activity` | Tool/context activity with label, kind, and optional status/tool/timing. |
| `narration_token` / `narration_reset` | Pre-answer work narration and reset signal. |
| `final_answer_start` / `answer_token` / `final_answer_end` | Explicit final-answer phase and incremental text. |
| `error` | `{code,message,requestId}` after a provider/runtime error once streaming began. |
| `done` | Final user/assistant message, conversation, provider, fallback, and request id. |

The Web parser retains compatibility branches for `lifecycle`, `progress`, `token`, and `token_reset`, but the baseline server does not directly emit them. Internal `AgentLifecycleEventType` names are likewise not the public SSE event list.

### WebSocket

The browser connects to `ws(s)://.../api/projects/:projectId/ws?token=...`. Upgrade validates the token, membership, and `chat:read`, then first sends `{type:"connected",projectId}`. The client may send `{type:"dashboard_subscribe",pointNames:[...]}`; the server holds project-scoped subscriptions and polls the collector best-effort about every 15 seconds.

Current broadcasts include `dashboard_created`, `dashboard_updated`, `dashboard_deleted`, `dashboard_point_update`, `conversation_title_updated`, and `reminder_fired`. The Web client reconnects every five seconds after an unintentional close.

## 5. Data, state, and persistence

REST/SSE messages ultimately persist in `apps/data/store.json`. WebSocket connections, subscriptions, pollers, and last-sent values exist only in process memory, so clients reconnect and resubscribe after restart. SSE activities are stored on the assistant message for conversation reopening; raw wire frames are not persisted as a separate event log.

The common authentication parser accepts query tokens, used for the WebSocket URL and browser-constrained Repository resources. URL tokens can enter proxy/browser logs. Deployments need TLS, restricted logging, and header authentication whenever the protocol permits it.

## 6. Authorization and project isolation

REST project routes usually run `authenticate -> membership -> selected project -> permission`. Synchronous and SSE Chat require `chat:write`. WebSocket upgrade requires membership and `chat:read` but does not require the token to have that project selected; broadcasts are still bucketed by the URL project id.

A Dashboard subscribe message cannot supply a different project id, only point names. Downstream collector queries currently carry no end-user identity, so project-isolated subscriptions in this service do not by themselves prove that collector data is tenant-isolated.

## 7. Errors, degradation, and external dependencies

- A REST failure before response uses an HTTP status and canonical error envelope. Fastify validation, an empty JSON body, and uncaught exceptions have shared mappings.
- After SSE headers, a failure cannot change HTTP status; it emits `error` and closes. A close without a terminal event becomes `stream_incomplete` in the Web client.
- WebSocket upgrade returns `401` for unauthenticated access and `403` without membership/read permission. Malformed message JSON is ignored.
- Dashboard point polling skips an individual failed fetch best-effort and does not broadcast an error event.
- Collector, LLM, and STT status is proxied or translated. A successful local `/health` does not establish dependency health.

## 8. Extension points

A new REST contract should include the route, runtime validator/client parser, permission order, and integration test together. A new SSE event must define terminal, duplicate, ordering, and disconnection behavior. A new WebSocket type needs a client-to-server schema, project scope, reconnect restoration, and backpressure semantics. Do not mark a method Implemented merely because it exists in `apps/web/src/api.ts`; identify its provider in `server.ts` or an explicit External collector contract.

## 9. Tests

- REST authorization and error envelope: [apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- Chat REST/SSE, event order, and failures: [apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- Runtime phase events: [apps/api/src/agent/runtime.streamPhase.test.ts](../../../../apps/api/src/agent/runtime.streamPhase.test.ts)
- Web-client parsing and page behavior: [apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts), [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- Dashboard contract behavior: [apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)

## 10. Known limitations and related documentation

- SSE has no resumable event id. Reconnecting may encounter an already-stored user message or repeated side effects.
- The recurring-reminder SSE fast path manually stringifies its `done` object before the common writer stringifies again, producing a JSON-string payload unlike ordinary `done`.
- The WebSocket token is in the query string. Subscriptions are in-process, with no cross-instance fan-out or durable replay.
- Web-client compatibility parsing exceeds the current server emission set; contract reviews must distinguish “can parse” from “will receive.”
- Continue with [authentication, projects, and conversations](../features/auth-projects-conversations.md), [Chat and Agent Runtime](../features/chat-agent-runtime.md), and [BMS integration](../features/bms-integration.md).

# Current implementation architecture

[中文](../../zh-CN/architecture/current-architecture.md) | [Developer documentation home](../README.md) | [Target architecture](target-architecture.md)

> Code baseline: `main@af44ff15`. Status: Implemented monorepo application with Partial capabilities and External integration boundaries.

![BuildingAgent current system context](../../../assets/diagrams/current-system-context.drawio.svg)

## 1. Status and code baseline

BuildingAgent is a TypeScript monorepo managed by npm workspaces: `@building-agent/web` is a React/Vite SPA, `@building-agent/api` is a Fastify/Node service, and `@building-agent/cli` is a Node CLI. They agree on API behavior without publishing a separate shared-contract package.

[server.ts](../../../../apps/api/src/server.ts) assembles authentication, projects, Chat, WebSocket, BMS, FDD, Dashboard, Scheduler, and other routes/services. [App.tsx](../../../../apps/web/src/App.tsx) assembles sign-in, navigation, workspace, and many feature UIs. They are large composition roots. Responsibility-oriented documentation is a reading model, not evidence of microservices or micro-frontends.

## 2. Purpose and scope

The current diagram answers “where does a request actually go?” Web and CLI are equally untrusted clients; Fastify authenticates and isolates projects; Agent Runtime controls the provider/tool loop; building-domain modules integrate with external LLM/BMS systems; local JSON, SQLite, and project files persist different state classes.

Diagram boundaries are not deployment guarantees. Except for external systems, most API capabilities run in one Fastify process.

## 3. User and source entry points

| Responsibility | Entry | Notes |
| --- | --- | --- |
| Web | [apps/web/src/main.tsx](../../../../apps/web/src/main.tsx), [App.tsx](../../../../apps/web/src/App.tsx) | Vite bootstraps; the browser API client uses `/api`. |
| CLI | [apps/cli/src/index.ts](../../../../apps/cli/src/index.ts) | Calls the same API after saving local connection/token config. |
| API | [apps/api/src/index.ts](../../../../apps/api/src/index.ts), [server.ts](../../../../apps/api/src/server.ts) | Starts Fastify and assembles all routes. |
| Agent | [apps/api/src/agent/runtime.ts](../../../../apps/api/src/agent/runtime.ts) | Manages provider output, tool calls, parallel/loop limits, and stream events. |
| Building domain | `apps/api/src/{bms*,fdd*,derivedMetrics*}` | BMS bridge, FDD catalog/evaluation, and derived metrics. |
| Persistence | [persistence.ts](../../../../apps/api/src/persistence.ts), [knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) | Resolve the JSON store and project data root respectively. |

## 4. Normal data flow

```text
Web / CLI
  -> Fastify request id + bearer authentication
  -> membership / permission / project scope
  -> direct domain route OR Agent Runtime
  -> provider and/or deterministic tools
  -> JSON response or SSE stream
  -> JSON / SQLite / project-file persistence
  -> optional WebSocket project broadcast
```

Direct domain routes such as Dashboard CRUD or BMS batch reads do not need an LLM. Chat may call deterministic tools, but answers and tool results remain scoped by the same project id.

## 5. Data, state, and persistence

- `apps/data/store.json`: in-memory model snapshot for users, tokens, projects, memberships, messages, conversations, Dashboards, and several project configurations.
- Repository-root `data/**` (overridable by `BUILDING_AGENT_DATA_DIR`): project KB/Repository, Memory, outputs, logs, SQLite files, and scheduler state.
- External LLM: must not be an authoritative store for local business facts.
- External BMS/collector: authoritative for real points and time series; local state may hold connection metadata, mappings, or derived results.

See [runtime and storage topology](runtime-storage.md).

## 6. Authorization and project isolation

Business paths other than `/health` normally require a bearer token. Protected routes validate user id, membership, and permission for project access; WebSocket upgrade validates the token and `chat:read`. Merely placing a project id in a URL is not authorization.

CLI configuration and browser state are never server-side authorization sources. The server must independently validate every request.

## 7. Errors, degradation, and external dependencies

- Fastify uses canonical request-id-bearing errors and handles validation, empty JSON bodies, and uncaught exceptions separately.
- Chat uses mock without credentials; a real-provider failure is fatal unless fallback is explicitly allowed.
- BMS routes may use mock, bridge, or collector proxy, with different authorities.
- Rebuildable SQLite indexes do not make the JSON store or project files disposable.
- A successful API/Web build may still report the Web bundle-over-500-kB performance warning.

## 8. Extension points

Within the current monolith, place implementation in a clear domain module and register it from the composition root. A new API requires server route, Web/CLI client, permission checks, error contract, and tests together; declaring only a frontend method is insufficient. Call a boundary a service only when independent deployment, versioning, and failure boundaries exist.

## 9. Tests

- Server assembly and main path: [apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- Authentication: [apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- Web composition: [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- CLI: [apps/cli/src/commands.test.ts](../../../../apps/cli/src/commands.test.ts)
- Local end-to-end gate: `npm run smoke`

## 10. Known limitations and related documentation

- Composition-root size raises cross-domain change risk; this milestone records but does not refactor it.
- Some frontend BMS client methods lack matching Fastify routes; see [BMS integration](../features/bms-integration.md).
- The repository has no actual GitHub Actions workflow; see [testing and verification](../development/testing.md).
- Event details are in [REST, SSE, and WebSocket contracts](api-events.md).


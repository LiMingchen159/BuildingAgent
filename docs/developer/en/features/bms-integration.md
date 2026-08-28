# BMS integration

[中文](../../zh-CN/features/bms-integration.md) | [Developer documentation home](../README.md) | [Runtime and storage topology](../architecture/runtime-storage.md)

> Code baseline: `main@af44ff15`. Status: read-only collector queries, Dashboard batch reads, the basic source lifecycle, mock/Element bridges, and Agent query tools are implemented; the BMS configuration wizard and several frontend contracts are only partially implemented; real BMS, collector, and enteliWEB systems are external capabilities.

## 1. Status and code baseline

BMS is not one backend. The baseline has three server-side paths: [server.ts](../../../../apps/api/src/server.ts) can forward source/ingestion management requests to `BMS_API_BASE_URL`, use an in-process mock when `USE_MOCK_BMS_CLIENT` is enabled, or assemble [BmsDatabaseBridge](../../../../apps/api/src/bmsDatabaseBridge.ts) for `project_element` when `BMS_DATABASE_API_URL` is explicitly set. Separately, [bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts) exposes an authenticated read-only collector proxy to the browser, while [bmsLiveRead.ts](../../../../apps/api/src/agent/bmsLiveRead.ts) is an independent enteliWEB live-read tool used by the Agent.

| Capability | Status | Baseline fact |
| --- | --- | --- |
| BMS health, temporary upload, and source create/list | **Implemented** | Fastify has explicit routes; health/source calls route across the external service, mock, or Element bridge, while upload is handled in this process. |
| Source detail/connection test/point discovery and list, and minimal ingestion job | **Implemented (mock/Element) / Partial (external)** | Fastify has routes and mock/Element close the loop. A pure `BMS_API_BASE_URL` source is not added to the local owner map, so later id-based project lookup fails before the intended upstream forwarding can reliably run. |
| Collector point/timeseries reads and Dashboard latest/history batches | **Implemented** | Fastify proxies read-only GET requests; batch routes isolate a point failure in its own result. |
| Temporary CSV/XLSX upload and preview | **Implemented** | The API decodes into `.temp/bms-config/**` and returns at most 10 preview rows and 25 normalized points; legacy `.xls` produces a warning but no real preview. |
| Web “BMS Data Configuration” six-step wizard | **Partial** | The page and some calls work, but source update, credentials, and Agent Excel analysis call Fastify routes that do not exist; the completion page is not live job status. |
| Agent point, history, and enteliWEB live read | **Implemented + External** | Tool code exists; results still depend on the collector, site system, network, and server environment. |
| Point import/update and semantic suggestions | **Planned** | A Web client declares methods, or the older client explicitly returns 501, but Fastify has no corresponding implementation. |

Do not summarize these paths as “the BMS service is fully integrated.” `BMS_API_BASE_URL` and `BMS_DATABASE_API_URL` are different external boundaries, and a complete-looking configuration wizard does not imply every step has a server contract.

The explicit baseline Fastify surface is: `GET /api/bms/health`; `GET /api/bms/collector` and `GET /api/bms/collector/*`; `POST /api/bms/dashboard/{history-batch,latest-batch}`; `POST /api/bms/temp-upload`; `GET|POST /api/bms/sources`; `GET /api/bms/sources/:sourceId`; source `test-connection`, `discover-points`, and `points`; plus ingestion start, job status, and results. “Route registered” does not automatically mean every backend branch completes end to end.

## 2. Purpose and boundary

The integration has four responsibilities: maintain BMS source metadata; safely expose external collector points, latest values, and history to the Web and Agent; provide raw readings to Dashboards and derived metrics; and perform site live reads through an explicit server-side adapter. It does not make BuildingAgent the authoritative BMS database, and it does not let an LLM or browser bypass the API to write site points.

“Semantics” has three different meanings here and they must not be conflated: the `semantic_class` string inferred from an uploaded point name/description; a description/object reference returned by the BMS database; and the Brick/semantic model used by FDD or reports. The baseline has no `/api/bms/semantic/suggest` implementation, so a `semantic_class` field does not mean a complete or validated Brick graph exists.

## 3. User entry and key source entry

- Web workspace entry and six-step wizard: [apps/web/src/ui/BmsDataConfig.tsx](../../../../apps/web/src/ui/BmsDataConfig.tsx)
- Client actually used by the wizard and its declared contracts: [apps/web/src/bmsApiClient.ts](../../../../apps/web/src/bmsApiClient.ts)
- Collector and Dashboard batch browser client: [apps/web/src/bmsCollectorClient.ts](../../../../apps/web/src/bmsCollectorClient.ts)
- Fastify routes, temporary-upload parsing, and routing: [apps/api/src/server.ts](../../../../apps/api/src/server.ts)
- Server-side BMS source/point/job types: [apps/api/src/bmsTypes.ts](../../../../apps/api/src/bmsTypes.ts)
- Element collector bridge: [apps/api/src/bmsDatabaseBridge.ts](../../../../apps/api/src/bmsDatabaseBridge.ts)
- Collector URL and proxy: [apps/api/src/bmsCollectorUrl.ts](../../../../apps/api/src/bmsCollectorUrl.ts), [apps/api/src/bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts)
- Timeseries read and legacy fallback: [apps/api/src/bmsTimeseries.ts](../../../../apps/api/src/bmsTimeseries.ts)
- Agent BMS tools: [apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts), [apps/api/src/agent/bmsLiveRead.ts](../../../../apps/api/src/agent/bmsLiveRead.ts)
- Environment variable names and empty placeholders that may be committed: [.env.example](../../../../.env.example)

The older [BMS Data Config UI](../../../bms/BMS_DATA_CONFIG_UI.md) is a historical design note. Its claim that point import, credential storage, and first-point live verification are all connected goes beyond current Fastify behavior; use this page’s route matrix as the current source of truth.

## 4. Normal data flow

### 4.1 Collector and Dashboard reads

1. The browser calls `/api/bms/collector/*` with a BuildingAgent bearer token. Fastify removes the proxy prefix and forwards the GET to `BMS_DATABASE_API_URL`; the browser never addresses the collector port directly.
2. Point lookup reads catalog names, object references, latest values, and last-polled timestamps. The timeseries helper tries the unified timeseries API and falls back to the legacy readings API when it is absent or fails. Dashboard history batches explicitly use the poll-readings path today.
3. Dashboard batches require a selected project and `chat:read`. History accepts at most 32 queries, latest accepts 64, and concurrency is 8. The server resolves names/object references to point ids and caches the mapping for 10 minutes.
4. Each query returns its own `ok`, data, or error, so one offline point does not fail the entire HTTP batch. A derived-metric binding is instead resolved in the current project’s local Derived Metric store and does not call the collector.

### 4.2 Source, upload, and ingestion

1. A user uploads CSV/XLSX inside a project. Fastify checks the token, membership, and selected project, sanitizes the filename, writes a project-partitioned temporary file, and parses a server-side preview. An upload response does not import those points into a source.
2. The wizard creates a source. `project_element` creates/reads an in-memory source through the bridge; mock mode writes an in-memory map; otherwise the request is forwarded to the management service identified by `BMS_API_BASE_URL`.
3. Connection test and point discover/list follow the same routing. The Element bridge reads at most 500 catalog points and maps external fields to `BmsPointSummary`.
4. An ingestion test accepts source id, point ids, sample count, and interval. Mock mode generates deterministic samples; the Element bridge reads existing collector history; external mode delegates to the BMS management service. Two GET routes expose job status and results.

Steps 3–4 describe the intended routing. A pure external source is not cached in the baseline’s local source-owner map, so source/job id routes can return not found or throw an owner-lookup error before forwarding. `BMS_API_BASE_URL` health and source list/create are connected, while the subsequent detail/test/ingestion chain remains **Partial**.

The wizard’s “24h / 7d / 30d / 1y” choices do not currently send a `from`/`to` range. They are translated only into small `sample_count` values, with a fixed two-second interval. The page shows static “listener started / verified” copy as soon as ingestion start returns and never polls job status or results. It is therefore a workflow prototype, not an operational status screen.

### 4.3 Agent live read

`bms_points_query` and `bms_timeseries_query` use the server-side collector catalog/history. `bms_live_read` first resolves a point name or object reference to an API path through the catalog, then uses server environment configuration to call enteliWEB and parse its present value. This is not the same contract as the missing `/api/bms/points/test-live-values` declared by the Web client.

## 5. Data, state, and persistence

| Data | Location/owner | Lifecycle and authority |
| --- | --- | --- |
| Real points, poll/history, and site present values | External collector / BMS / enteliWEB | **Externally authoritative**; BuildingAgent reads or proxies them and must not claim its local state is more authoritative. |
| External source/job state | Service behind `BMS_API_BASE_URL` | Persistence and recovery semantics belong to that external service and are not implemented in this repository. |
| Mock source and mock job | In-process `Map` in `server.ts` | Lost at process restart; never written to `apps/data/store.json`. |
| Element bridge source, discovered points, job/results | In-process `Map` in `BmsDatabaseBridge` | A source is seeded again after restart, while discovery/job state is not restored; real series remain in the collector. |
| Uploaded files and preview | Repository-root `.temp/bms-config/<project>/<upload>/...` | Written to disk, but the baseline has no TTL, cleanup job, or delete API; the returned temp token is a relative locator, not an access credential. |
| Dashboard point-id mapping | Process-global Fastify cache | Up to 2,048 entries with a 10-minute TTL; keyed by lookup kind/value and not an authoritative point catalog. |
| Web form, username/password input, and wizard step | React component state | Lost on refresh and not written to browser local/session storage. The wizard cannot persist credentials because the server route is missing. |

Upload preview, source points, and collector catalog are three separate collections. The current wizard sends point ids from the upload preview directly to ingestion without first calling point import or discovery. In mock/Element bridge mode those ids might not exist in the source’s point map, producing a zero-record “completed” job. Extensions must not assume that a successful upload means the points have been imported.

## 6. Permissions and project isolation

- `/api/bms/health` requires a valid token but not a selected project.
- Temporary upload, source list/create/detail, connection test, point discover/list, and ingestion-job routes require membership and selected project. Access by source/job id first resolves its owner project and then checks access.
- Dashboard latest/history batches require selected project, membership, and `chat:read`; local derived metrics are resolved only under that project id.
- `/api/bms/collector/*` currently checks only the token, with no membership, selected-project, or fine-grained read permission. It proxies a shared collector catalog, so a request with no project id cannot be described as project-isolated.
- Source creation, temporary upload, and ingestion mutate configuration or temporary state but currently do not check `project:configure`. This is a known permission gap, not a pattern to copy.
- enteliWEB identity material belongs only in the API process environment. Never put real URLs, usernames, passwords, bearer tokens, or customer point lists in documentation, persisted frontend state, logs, or repository fixtures.

## 7. Errors, degradation, and external dependencies

- Without bridge/mock and without `BMS_API_BASE_URL`, management health/source paths report BMS unavailable. Collector paths use the collector URL resolver’s local default and still require that service to be reachable.
- The Web BMS client has an eight-second timeout; network, abort, and nonstandard-response failures are normalized to `bms_service_unavailable`. The configuration page suppresses that banner class, so some failures can appear only as missing progress or status.
- The collector proxy largely preserves HTTP status/content type. Dashboard batches record lookup, timeout, or point-network failure in that query’s error. Callers must inspect every `ok`, not just the batch HTTP 200.
- CSV/XLSX parsing is deliberately lightweight: it reads the first worksheet and a bounded preview; `.xls` is not parsed. Temporary files have no automatic cleanup.
- Mock data validates contracts and UI only. It is not evidence of site accuracy, protocol compatibility, or write capability. Every baseline path should be treated as read-only.
- enteliWEB live read is a real-network external capability and parses a specific XML present-value shape. Authentication, path formatting, or response changes can fail. Environment fallbacks are public local fixtures, not production secrets or a product guarantee.

## 8. Extension method

For a new adapter, first decide whether it belongs to the external `BMS_API_BASE_URL` management service, the read-only collector, or an in-repository bridge; do not make the three silently substitute for one another. Implement and test the server route, project/permission guard, schema, errors, and persistence before exposing it from either Web client. Writing site points requires a separate high-risk permission, audit, and confirmation flow; changing `read_only` to false is not sufficient.

Completing the configuration wizard requires at least: source PATCH and a secure credential store; implementation or removal of the Excel analyze client; an import/update lifecycle from upload points to a source; deterministic evidence and provenance for semantic suggestions; a Web live-values endpoint or an explicit reuse of the Agent tool; and real time-window parameters plus job/results polling for sync range. Every new route must also update the [REST, SSE, and WebSocket contracts](../architecture/api-events.md) and add an end-to-end Fastify test.

## 9. Corresponding tests

- Fastify authentication, mock source, upload preview, ingestion, and history batch: [apps/api/src/bms.test.ts](../../../../apps/api/src/bms.test.ts)
- Collector URL/query forwarding: [apps/api/src/bmsCollectorProxy.test.ts](../../../../apps/api/src/bmsCollectorProxy.test.ts)
- Agent catalog/history and fallback: [apps/api/src/agent/bmsQueryTools.test.ts](../../../../apps/api/src/agent/bmsQueryTools.test.ts)
- enteliWEB live-read integration: [apps/api/src/agent/bmsLiveRead.test.ts](../../../../apps/api/src/agent/bmsLiveRead.test.ts)
- Dashboard BMS/derived bindings: [apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)
- Web workspace and configuration wizard: [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)

`App.test.tsx` mocks responses for credentials, point update, and live-values routes. It proves UI behavior under an assumed contract, not that Fastify implements those routes. `bmsLiveRead.test.ts` depends on an external system and returns early when that system is unreachable; it is not a fully repeatable offline gate.

## 10. Known limitations and related documentation

The following client paths have no corresponding Fastify route in the baseline. Treat them as **Planned** when calling the BuildingAgent API, not as available interfaces:

| Client declaration | Method and path | Current effect |
| --- | --- | --- |
| Update source | `PATCH /api/bms/sources/:sourceId` | Saving configuration after initial source creation fails. |
| Save credentials | `POST /api/bms/sources/:sourceId/credentials` | The wizard’s Save Credentials cannot create a server-side credential record. |
| Agent/Excel analysis | `POST /api/bms/import/excel/analyze` | Run Agent in Review Config cannot be completed by current Fastify. |
| Import points | `POST /api/bms/points/import` | Upload preview does not become a source point inventory. |
| Update point | `PATCH /api/bms/points/:pointId` | Normalized fields and semantic class cannot be saved through this client. |
| Semantic suggestions | `POST /api/bms/semantic/suggest` | `semantic_class` is only a lightweight upload/bridge mapping; there is no suggestion service. |
| Web live-values test | `POST /api/bms/points/test-live-values` | The configuration-page client cannot verify imported points; Agent `bms_live_read` is a separate implementation. |

In addition, the unauthenticated `/bms` public prefix declared by `bmsCollectorClient.ts` depends on a reverse-proxy deployment outside this repository. Fastify does not implement that route, so it is an **External** capability. Continue with [Derived Metrics and KPI](derived-metrics-kpi.md), [Dashboards and Reports](dashboards-reports.md), [FDD Brick mapping and deployability](../fdd/brick-deployability.md), and [Troubleshooting and known contract gaps](../development/troubleshooting.md).

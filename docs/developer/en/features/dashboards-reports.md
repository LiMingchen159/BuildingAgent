# Dashboards and Reports

[中文](../../zh-CN/features/dashboards-reports.md) | [Developer documentation home](../README.md) | [REST, SSE, and WebSocket contracts](../architecture/api-events.md)

> Code baseline: `main@af44ff15`. Overall status: Dashboard resources, the Web workspace, and BMS/Derived Metric reads are **Implemented**; browser AutoReport is **Partial**; the server report kernel consists of **implemented, unit-tested library components**, while a callable report API, scheduled execution, run records, and download delivery remain **Planned**.

## 1. Status and code baseline

The repository contains three similarly named capabilities at different maturity levels. They must be evaluated separately:

| Capability | Status | Current fact |
| --- | --- | --- |
| Dashboard model and CRUD REST | **Implemented** | [`dashboards.ts`](../../../../apps/api/src/dashboards.ts) validates widgets, bindings, sections, and a 12-column layout; [`server.ts`](../../../../apps/api/src/server.ts) registers list, detail, create, whole-spec update, and delete routes. |
| Dashboard Web workspace | **Implemented** | [`DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx) renders live/stat/trend/comparison/note widgets and supports layout, sections, visibility, rename, duplicate, merge, cross-dashboard widget copy, and solo view. |
| Dashboard BMS and Derived Metric data | **Implemented** | Latest/history batches resolve both raw BMS and derived-metric bindings; raw named BMS points can also receive best-effort updates over the project WebSocket. |
| Agent-created Dashboards | **Implemented** | `dashboard_create` normalizes tool input into a Dashboard resource and associates `sourceConversationId` with Chat. |
| Web AutoReport | **Partial** | [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx) aggregates latest/history evidence for selected Dashboards in the browser, renders a fixed bilingual preview, and calls `window.print()`; it does not persist report definitions, runs, or generated artifacts. |
| Server report contracts, planning, evidence, analysis, assembly, and LaTeX | **Implemented as library components** | [`reports/`](../../../../apps/api/src/reports) contains versioned types, strict validators, execution kernels, safe rendering/compilation boundaries, and unit tests. |
| Server Reports API and product pipeline | **Planned** | `server.ts` has no report-spec, run, status, artifact, or download routes and does not assemble the complete evidence tools, artifact store, scheduler, and PDF compiler into a product service. |

Consequently, the “Auto Report” tab is not the UI for the server report kernel, and “Save PDF” does not call server-side XeLaTeX. Conversely, a full fixture path across `reports/*.test.ts` does not prove that deployed Fastify exposes that path.

## 2. Purpose and boundaries

A Dashboard is a reusable project-scoped operations-view definition. It stores a title, visibility, widgets, data bindings, layout, and sections; it does not copy BMS or Derived Metric time-series values. Widget types are `live_value_grid`, `timeseries_chart`, `stat_value`, `bar_comparison`, and a `note` that requires no point binding. A data binding references either a raw BMS point or a persisted Derived Metric instance/entity metric.

AutoReport is a browser workbench for shift operators. A user selects from currently readable Dashboards, then chooses a daily handover, weekly/monthly management summary, or fault/issue review. The page summarizes only Dashboard specifications, BMS latest/history, Derived Metric latest/history, and user-edited narrative. It explicitly does not infer alarms, work orders, CMMS records, or verified root causes.

The server `reports/` directory is a separate, stricter report-pipeline kernel. Its intended model is to parse a `ReportSpec`, discover and pin equipment-asset sources, build a `ReportPlan`, collect an `EvidencePackage` through deterministic producers, let a constrained B-Agent interpret only projected evidence, assemble a renderer-neutral `ReportDocument`, and safely render and compile a PDF. The product entry point that would authenticate, persist, schedule, and orchestrate these steps does not exist yet; no REST contract should be inferred directly from library interfaces.

## 3. User entry points and key source entry points

### Dashboard

- Web composition root, routing, and CRUD operations: [`apps/web/src/App.tsx`](../../../../apps/web/src/App.tsx)
- Dashboard rendering, editing, and batch queries: [`apps/web/src/ui/DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx)
- Web REST client and mirror types: [`apps/web/src/api.ts`](../../../../apps/web/src/api.ts)
- BMS/Derived Metric batch client: [`apps/web/src/bmsCollectorClient.ts`](../../../../apps/web/src/bmsCollectorClient.ts)
- Server model and payload validation: [`apps/api/src/dashboards.ts`](../../../../apps/api/src/dashboards.ts)
- Fastify CRUD, batch, WebSocket, and store assembly: [`apps/api/src/server.ts`](../../../../apps/api/src/server.ts)
- Agent tool: [`apps/api/src/agent/genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts)

The primary HTTP entry points are:

- `GET|POST /api/projects/:projectId/dashboards`
- `GET|PATCH|DELETE /api/projects/:projectId/dashboards/:dashboardId`
- `POST /api/bms/dashboard/latest-batch`
- `POST /api/bms/dashboard/history-batch`
- `WS /api/projects/:projectId/ws`, with `dashboard_subscribe` and `dashboard_point_update` messages

### Reports

- Browser AutoReport: [`apps/web/src/ui/AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx)
- Spec, package, and document contracts: [`apps/api/src/reports/contracts.ts`](../../../../apps/api/src/reports/contracts.ts)
- Equipment profiles and asset discovery: [`profiles.ts`](../../../../apps/api/src/reports/profiles.ts), [`assetDiscovery.ts`](../../../../apps/api/src/reports/assetDiscovery.ts)
- Planning: [`planner.ts`](../../../../apps/api/src/reports/planner.ts)
- Evidence definitions, tool interfaces, and execution: [`evidenceDefinitions.ts`](../../../../apps/api/src/reports/evidenceDefinitions.ts), [`evidenceTools.ts`](../../../../apps/api/src/reports/evidenceTools.ts), [`evidenceExecutor.ts`](../../../../apps/api/src/reports/evidenceExecutor.ts)
- Constrained analysis: [`analysisDefinitions.ts`](../../../../apps/api/src/reports/analysisDefinitions.ts), [`analysisExecutor.ts`](../../../../apps/api/src/reports/analysisExecutor.ts)
- Document, rendering, assets, and compilation: [`reportAssembler.ts`](../../../../apps/api/src/reports/reportAssembler.ts), [`latexRenderer.ts`](../../../../apps/api/src/reports/latexRenderer.ts), [`reportArtifacts.ts`](../../../../apps/api/src/reports/reportArtifacts.ts), [`latexCompiler.ts`](../../../../apps/api/src/reports/latexCompiler.ts)

The baseline has no `/api/reports` or equivalent Fastify surface. `ReportSpec.schedule` is a validated data contract, not an executing Scheduler job.

## 4. Normal data flow

### 4.1 Dashboard creation and reads

1. A user can ask Chat to monitor equipment; the Agent first queries BMS/Derived Metrics, then calls `dashboard_create`. A user can also duplicate an existing Dashboard in the Web app, but there is no standalone blank-Dashboard builder.
2. The server normalizes and validates the input: title, widget/binding, layout, and section references must agree. The Agent tool can generate a canonical specification when layout or sections are omitted or invalid.
3. The create path writes to `dashboardsByProject`, schedules persistence, and broadcasts `dashboard_created` to the project. When `sourceConversationId` matches the active conversation, the Web app opens the new Dashboard automatically.
4. The Web app opens a resource from the right-side Dashboard list or `/projects/<project>/dashboards/<id>`. `DashboardView` reads history in batches of at most 32 queries for trend widgets and latest values in batches of at most 64 for all valid bindings.
5. Raw named BMS bindings in the active Dashboard are registered through `dashboard_subscribe`; the API polls the collector best-effort every 15 seconds and broadcasts only changes. The page also polls latest-batch for all bindings every 60 seconds, allowing Derived Metrics and values without WebSocket updates to refresh.
6. Drag/resize, section, note, widget-title, or Dashboard-visibility changes ultimately send a complete `PATCH` specification. The server is not implementing JSON Merge Patch: callers must retain required fields such as title, layout, and widgets.

The Web app can duplicate or merge Dashboards and copy one widget into another Dashboard. These operations construct a new specification in the browser and invoke the existing `POST`/`PATCH`; the server has no dedicated duplicate or merge endpoint. Deleting a Dashboard removes only the view definition, not BMS data or Derived Metrics.

### 4.2 Browser AutoReport

1. The Reports tab receives the readable Dashboard array already loaded by App. Selection changes and editable narrative exist only in React state.
2. Generation creates latest and history queries from deduplicated bindings. The page chunks them to the API limits of 64/32, while templates fix the evidence window to 24 hours, seven days, or 48 hours.
3. BMS and Derived Metric responses share point/time-series shapes. The page calculates sample count, min/max/average, latest coverage, and a `stale` state for values not refreshed for more than two hours.
4. It renders a fixed bilingual summary, risk/data-quality section, Dashboard/widget inventory, trend evidence, and raw point snapshot. Edited notes are not submitted to an API.
5. “Generate web” updates only the current page snapshot. After the same evidence fetch, “Save PDF” delays and invokes the browser print dialog. Destination, PDF support, and failure behavior belong to the browser and operating system.

### 4.3 Intended call order of the server report library

The following is a composable library sequence, not a currently reachable product API:

1. `parseReportSpec` validates period, timezone, schedule, sections, KPI keys, Dashboard IDs, and equipment selection.
2. `discoverProjectReportAssets`/`resolveReportAssets` resolves equipment identity, profile, classification rules, provenance, and content revision from semantic, project, and BMS metadata.
3. `buildReportPlan` pins equipment, sections, Dashboard revisions, evidence/analysis-definition revisions, and every request.
4. `executeReportEvidence` invokes injected metric, chart, Dashboard, and fault producers concurrently and records `complete`, `no_data`, or `error` plus typed evidence, query hash, producer provenance, and package revision.
5. `executeReportAnalysis` gives a constrained model only the per-request evidence projection. The model cannot dispatch tools or author facts, and fault-diagnosis output is marked as a hypothesis.
6. `assembleReportDocument` builds a structured block graph from validated plan/evidence/analysis packages. `renderReportLatex` escapes external text and produces a source bundle.
7. `materializeReportArtifacts` validates path, checksum, type, and size through an injected reader. `createXeLatexProcessCompiler` runs two compiler passes with `/usr/bin/prlimit` and `/usr/bin/xelatex` in an isolated temporary directory and returns in-memory PDF bytes.

The repository supplies only a Derived Metric evidence adapter. A complete registry, BMS/chart/Dashboard/FDD producers, artifact sink/reader, run orchestrator, and external delivery still require deployment assembly.

## 5. Data, state, and persistence

| Data/state | Location | Lifecycle and authority |
| --- | --- | --- |
| Dashboard specification | `dashboardsByProject` in `apps/data/store.json` | Modified in the API process and saved best-effort after about 500 ms; authoritative for local Dashboard definitions. |
| BMS latest/history | External collector/BMS | Externally authoritative facts; Dashboards do not copy time series. Fastify holds only a short-lived point-ID cache and WebSocket-poll deduplication state. |
| Derived Metric latest/history | `derived_metrics.db` under the project data root | Local derived facts; Dashboards store only instance/key/entity references. |
| Dashboard Web state | React state and history/latest caches | Rebuilt after project change or refresh; chart cache and realtime values are not authoritative records. |
| AutoReport selection, narrative, and snapshot | `AutoReport` React state | Lost on navigation/refresh; there is no report ID, save API, audit record, or recovery. |
| Browser print result | Browser/user-selected destination | Not written to Repository, not registered as a `RepositoryArtifact`, and not queryable by the server. |
| Server `ReportSpec`, Plan, Packages, Document, and PDF | TypeScript values/test fixtures | No product persistence, run registry, or artifact-store assembly exists in the baseline. Schema revisions make values verifiable; they do not make them durable. |

The Dashboard JSON store and Derived Metric SQLite database live under different data roots; see [Runtime and storage topology](../architecture/runtime-storage.md). Startup backfills an empty `dashboardsByProject` for an old store, and Dashboard IDs continue after the highest persisted `dash_<number>`, but JSON persistence still has no multi-instance transactional consistency.

## 6. Permissions and project isolation

Dashboard REST first requires a valid session, project membership, and a session whose selected project matches the URL. List/detail require `chat:read`; create/update/delete require `chat:write`. `canReadDashboard` then restricts reads to “owned by this user” or `visibility: "project"`. Updates/deletes are allowed to the owner or to a user with `project:configure` for a project-visible Dashboard; a configurator cannot use that rule to manage another user's private Dashboard.

Agent creation inherits the authenticated Chat `projectId` and `userId`. A `chat:write` user can currently create a project-visible resource without a separate `project:configure` check. That is the existing contract, not a recommended high-privilege design.

WebSocket upgrade validates token, project membership, and `chat:read`, but does not require that the session currently selected the same project. Its `dashboard_subscribe` message accepts an arbitrary point-name array and queries the shared collector without a Dashboard ID/readability check. It therefore depends on the client subscribing only to bindings from an authorized Dashboard and is not a point-level authorization boundary. The batch APIs do require a selected project and check project ownership when resolving a Derived Metric.

AutoReport has no separate permission layer. It can use only the Dashboards already obtained by App and the two protected batch routes. A `projectId`, asset revision, and package validation inside the server report library enforce data consistency, not authentication or membership. Future routes must authorize before calling the library and must protect artifact downloads.

## 7. Errors, degradation, and external dependencies

- Invalid Dashboard payloads return `422 dashboard_invalid`; missing and unreadable detail resolves to `404 dashboard_not_found`; an unauthorized mutation returns `403 dashboard_forbidden`.
- JSON persistence is best-effort: a save failure logs a warning, so a successful REST response is not a durable-commit guarantee.
- History/latest batches isolate each query's error; consumers must inspect each result's `ok`. Raw BMS depends on the collector, while Derived Metrics depend on local SQLite.
- WebSocket polling swallows individual network failures and broadcasts only changes. The Web app marks realtime stale after 70 seconds without an update, while the 60-second latest fallback may still provide values. WebSocket pushes only raw named BMS points; Derived Metrics depend on batch polling.
- A failed Dashboard trend load retains an empty/old display rather than inventing readings. Comparison/stat widgets with no numeric values display an unavailable state.
- AutoReport requires at least one Dashboard. When the overall evidence read throws, it degrades to Dashboard definitions and editable narrative and treats points as missing; individual history failures omit that trend evidence. It does not fabricate alarms, work orders, or root causes.
- Browser PDF relies on `window.print()` and has no server status, retry, download URL, or checksum.
- The server compiler depends on Linux `/usr/bin/prlimit` and `/usr/bin/xelatex` and enforces concurrency, timeout, source/asset/PDF-size, and pixel limits. Fastify does not invoke it. Complete evidence execution also depends on injected producers and an artifact store.

## 8. Extension method

When adding a Dashboard widget or binding, update the server discriminated union/validator, Web mirror types and parser, Agent tool schema/normalization, `DashboardView` query/rendering, AutoReport summary, layout/section migration, and API/Web tests together. Do not make the frontend accept a specification the server rejects. A time-series widget should reuse the batch APIs and define source, unit, missing/stale behavior, and project checks.

Dashboard update currently means “send the entire specification.” Before adding partial patching, optimistic concurrency, or multi-user editing, add revision/ETag and conflict semantics; otherwise the last writer overwrites another edit. For realtime expansion, have the server derive subscriptions from an authorized Dashboard/binding instead of accepting arbitrary names, and specify Derived Metric and external BMS update strategies separately.

To connect server Reports, introduce an explicit orchestrator and state machine that stores spec → run → immutable plan/package/document → artifact, retaining definition/asset revisions and failure stage in an audit record. Routes need project membership/permission, idempotency, cancellation/retry, download authorization, and retention. Do not let the LLM generate LaTeX, invoke evidence producers, or mutate deterministic facts; retain the existing “deterministic evidence → constrained analysis → structured assembly → inert rendering” boundary.

If the Web AutoReport is to reuse the server kernel, rebuild it around a formal ReportSpec/API instead of wiring features merely because their labels or templates sound alike. During migration, make “browser draft” and “persisted server report” visibly different states.

## 9. Corresponding tests

Dashboard and Web coverage:

- [`apps/api/src/dashboards.test.ts`](../../../../apps/api/src/dashboards.test.ts): CRUD, visibility/management permissions, payload validation, BMS/Derived Metric batches, legacy-store backfill, and ID recovery.
- [`apps/api/src/chat.test.ts`](../../../../apps/api/src/chat.test.ts): Agent point queries, Dashboard creation, Derived Metric reuse, conditional notes, and the `sourceConversationId` path.
- [`apps/web/src/App.test.tsx`](../../../../apps/web/src/App.test.tsx): right-side list, deep links, WebSocket updates, layout persistence, Derived Metric queries, legacy sections, duplicate/merge, and related workspace behavior.
- [`apps/web/src/ui/AutoReport.test.tsx`](../../../../apps/web/src/ui/AutoReport.test.tsx): intent switching, Dashboard selection, BMS/Derived evidence, missing/stale states, editable narrative, and `window.print()`.

Server report-library coverage:

- [`contracts.test.ts`](../../../../apps/api/src/reports/contracts.test.ts), [`assetDiscovery.test.ts`](../../../../apps/api/src/reports/assetDiscovery.test.ts), [`planner.test.ts`](../../../../apps/api/src/reports/planner.test.ts)
- [`evidenceExecutor.test.ts`](../../../../apps/api/src/reports/evidenceExecutor.test.ts), [`derivedMetricEvidence.test.ts`](../../../../apps/api/src/reports/derivedMetricEvidence.test.ts)
- [`analysisExecutor.test.ts`](../../../../apps/api/src/reports/analysisExecutor.test.ts), [`analysisTools.test.ts`](../../../../apps/api/src/reports/analysisTools.test.ts)
- [`reportAssembler.test.ts`](../../../../apps/api/src/reports/reportAssembler.test.ts), [`latexRenderer.test.ts`](../../../../apps/api/src/reports/latexRenderer.test.ts), [`reportArtifacts.test.ts`](../../../../apps/api/src/reports/reportArtifacts.test.ts), [`latexCompiler.test.ts`](../../../../apps/api/src/reports/latexCompiler.test.ts)

These links identify relevant coverage; they do not claim that the tests were run specifically while writing this page. See [Testing and verification](../development/testing.md) for final milestone results. Library unit tests in particular cannot substitute for the missing Reports REST, authorization, persistence, scheduling, and download integration tests.

## 10. Known limitations and related documentation

The primary limitations are: Dashboard uses a local JSON store and last-write-wins whole-spec updates; WebSocket subscriptions are not bound to Dashboard authorization and cover only raw named BMS points; there is no blank Dashboard builder; AutoReport is an ephemeral browser page and PDF means print; and the server report library has no Fastify routes, complete producer assembly, run/artifact persistence, Scheduler connection, or product download path. A server `ReportSpec.schedule`, the safe XeLaTeX compiler, and PDF bytes produced in tests must not be described as an available report service.

The older [Derived Metrics Storage And Agent Workflow](../../../bms/DERIVED_METRICS.md) is a **historical/supplemental implementation note**. Its Dashboard-binding and batch-API details remain useful, but use this developer set and [Derived Metrics and KPI](derived-metrics-kpi.md) for current status, project-isolation gaps, and report boundaries.

Related pages:

- [Web workspace](web-workspace.md)
- [BMS integration](bms-integration.md)
- [Derived Metrics and KPI](derived-metrics-kpi.md)
- [Scheduler, Realtime, and STT](scheduler-realtime-stt.md)
- [Runtime and storage topology](../architecture/runtime-storage.md)
- [Troubleshooting and known contract gaps](../development/troubleshooting.md)

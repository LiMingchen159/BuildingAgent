# Derived Metrics and KPI

[中文](../../zh-CN/features/derived-metrics-kpi.md) | [Developer documentation home](../README.md)

> Code baseline: `main@af44ff15`. Overall status: Derived Metrics are **Implemented**; KPI is **Partial**. “KPI” on this page is an operational metric concept and does not imply that the repository provides a standalone KPI service.

## 1. Status and code baseline

| Capability | Status | Current fact |
| --- | --- | --- |
| Metric definitions, instances, dependencies, samples, and latest values | Implemented | [`DerivedMetricStore`](../../../../apps/api/src/derivedMetrics.ts) persists deterministic metrics and their lineage in SQLite. |
| Agent lookup, preview, calculation, registration, sample recording, and read tools | Implemented | Tools are registered in [`genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts), with workflow guidance in [`skills.ts`](../../../../apps/api/src/agent/skills.ts). |
| Reading derived metrics in dashboards | Implemented | A dashboard binding may select `source: "derived_metric"`; Fastify latest/history batch routes adapt samples to BMS-shaped results. |
| KPI data model | Partial | `metricType` is an open string; report specs contain `kpiKeys`, while report blocks and `stat_value` widgets use KPI terminology, but there is no unified KPI registry or independent lifecycle. |
| KPI feedback | Planned | There is no standalone KPI feedback service, REST route, or persistent feedback loop. |
| Server-side report execution | Partial | [`reports/`](../../../../apps/api/src/reports) contains contracts, planning, evidence, assembly, and LaTeX components with unit tests, but [`server.ts`](../../../../apps/api/src/server.ts) registers no execution route for them. |
| AutoReport | Partial | [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx) aggregates latest/history evidence from selected dashboards in the browser and invokes printing; it is not an execution entry point for the server report library. |

## 2. Purpose and scope

A Derived Metric models a reusable calculation result for an entity within a project as four groups of facts: a definition and formula version, an entity instance, input dependencies, and time-stamped samples. Typical uses include System COP, Delta T, kW/RT, FD scores, and derived values that the business may call KPIs.

The deterministic boundary matters. The general calculation tools directly execute only two controlled formula kinds: `ratio` (left divided by right) and `difference` (left minus right), with inputs aligned at exactly equal timestamps. Writing an arbitrary expression into the `formula` field does not make it executable. A trusted caller must compute non-standard formulas and then persist the result through the registration and sample-recording tools.

KPI is not currently an independent domain service. Code can set a derived metric's `metricType` to `kpi`; a report spec can select `kpiKeys`; dashboard stat cards and AutoReport also use KPI wording. These are conceptual connection points, not one KPI API or enum.

## 3. User entry points and key source entry points

There are three main user entry points:

1. A Chat request to calculate, save, or reuse COP, Delta T, or a similar value; the Agent follows [`skill_derived_metrics`](../../../../apps/api/src/agent/skills.ts) and invokes derived-metric tools.
2. A dashboard widget binds a persisted metric by `metricInstanceId`, or by `metricKey + entityId`; the Web app reads latest and historical values through batch APIs.
3. AutoReport on the Reports tab selects existing dashboards, creates a bilingual web preview from BMS and derived-metric binding evidence, and uses browser printing to save a PDF.

Key implementation entry points are:

- Store and data model: [`apps/api/src/derivedMetrics.ts`](../../../../apps/api/src/derivedMetrics.ts)
- Agent tools: [`apps/api/src/agent/genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts)
- Fastify composition and dashboard batch adapters: [`apps/api/src/server.ts`](../../../../apps/api/src/server.ts)
- Dashboard model: [`apps/api/src/dashboards.ts`](../../../../apps/api/src/dashboards.ts)
- Web presentation: [`DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx) and [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx)
- Report kernel not yet connected to server routes: [`apps/api/src/reports/`](../../../../apps/api/src/reports)

There is no standalone REST resource such as `/api/derived-metrics` or `/api/kpis`. Agent tools currently perform derived-metric writes. Reads used by Dashboard and AutoReport reuse `/api/bms/dashboard/latest-batch` and `/api/bms/dashboard/history-batch`.

## 4. Normal data flow

The recommended flow is “reuse first, preview next, persist only after explicit approval”:

1. `derived_metric_lookup` searches for an existing instance using the current `projectId`, `metricKey`, and `entityId`.
2. On a hit, `derived_metric_read` returns latest/history and prevents duplicate calculation and registration.
3. On a miss, when the user wants a one-off value or has not clearly approved persistence, `derived_metric_preview` reads two `raw_point` or `metric` dependencies and calculates without writing a definition, sample, latest value, or Memory entry.
4. After the user explicitly asks to save and has `project:configure`, `derived_metric_calculate` can accept the preview's `persistCandidate.args`. It checks again for an existing instance, reads and aligns inputs by timestamp, calculates `ratio` or `difference`, registers the instance, and writes every sample plus latest.
5. The successful result returns a `dashboardBinding` and writes an idempotent pointer into project Memory. Memory stores only the read location, not time-series values.
6. Dashboard or AutoReport subsequently reads persisted latest/history through the batch routes. Later requests for the same metric should use lookup/read first.

`derived_metric_register` plus `derived_metric_record_sample` is the lower-level path for non-standard calculations: the first records a formula, instance, and dependencies; the second records a value already calculated by a trusted caller. Neither executes the `formula` string.

KPI has no parallel standalone write or feedback flow. Current connections consist of labeling a derived metric with a suitable `metricType`, placing its binding on a dashboard, or selecting a metric definition through `kpiKeys` in a server report spec.

## 5. Data, state, and persistence

At API startup, the general [`dataRoot`](../../../../apps/api/src/agent/knowledgeBase.ts) is passed to `DerivedMetricStore`. The default file is `data/derived_metrics.db` under the repository data root; `BUILDING_AGENT_DATA_DIR` or `DATA_DIR` can change that root. SQLite uses WAL and has these primary tables:

| Table | Responsibility and constraint |
| --- | --- |
| `metric_definitions` | Project-level definitions, unique by `(project_id, metric_key)`; holds display name, `metric_type`, and default unit. |
| `metric_versions` | Formula versions for a definition, unique by `(definition_id, version)`. |
| `metric_instances` | Metric instances on entities, unique by `(project_id, entity_id, metric_key)`; snapshots formula, version, and description so later shared-definition changes cannot erase instance lineage. |
| `metric_dependencies` | Input roles and `raw_point`/`metric` sources, deduplicated by instance, role, source type, and source ID. |
| `metric_samples` | History, idempotently updated by `(instance_id, ts, calculation_run_id)`; includes quality, status, source window, and calculation run ID. |
| `metric_latest` | One latest row per instance; only a write whose timestamp is not older than the current latest row can replace it. |

On startup, an older database receives missing instance-level formula-lineage columns and values are backfilled from the shared version record. History reads default to 720 rows and are configurable up to a store limit of 20,000; each input to `calculate`/`preview` has the same 20,000-row ceiling.

Project Memory stores only a derived-metric pointer. Existing Dashboard storage owns dashboard definitions. AutoReport selections, narrative, evidence snapshot, and output format are React page state; there is currently no server-side AutoReport record or persistence for generated PDFs.

## 6. Permissions and project isolation

Agent tools obtain `projectId` from an authenticated Chat context with a selected project. `lookup` filters by that project. `calculate`, `register`, and `record_sample` additionally require `context.canConfigure`, corresponding to `project:configure`; `preview`, `lookup`, and `read` do not themselves require configure permission. Dashboard batch routes require a valid session and selected project. Even when a request supplies `metric_instance_id`, the server checks the instance's `projectId`.

Three current paths must still be treated as security-boundary gaps:

- When the caller supplies `instanceId` directly, `derived_metric_read` uses `getInstance` without a project predicate.
- `derived_metric_record_sample` writes by `instanceId` without comparing that instance's project to the tool context again.
- When `preview`/`calculate` reads a `sourceType: "metric"` dependency, it resolves the dependency `sourceId` without checking that the source instance belongs to the current project.

Project isolation therefore still relies on upper layers not exposing or mixing instance IDs from other projects; the low-level store API is not a complete authorization layer. Before exposing or extending these entry points, add a uniform `(projectId, instanceId)` ownership check and cross-project rejection tests. The dashboard batch ownership check does not automatically protect these Agent-tool paths.

## 7. Errors, degradation, and external dependencies

- If the store is not wired, tools return `derived_metrics_unavailable`; missing instances produce `derived_metric_not_found` or the corresponding registration/recording error.
- `preview`/`calculate` require at least two dependencies, a valid `from`, and either `ratio` or `difference`. Only exact timestamp matches are used; no aligned numeric samples produces `no_aligned_samples`.
- A zero denominator, non-finite values, and unparseable non-numeric samples are skipped and counted in `skipped`. There is no interpolation, window aggregation, unit conversion, or cadence reconciliation.
- A `raw_point` dependency reads from the external BMS collector; an unavailable collector or insufficient history makes preview/calculation fail. A `metric` dependency reads local SQLite.
- When a derived metric or latest value is missing, a dashboard batch returns an error for that query item instead of fabricating a value.
- If evidence loading fails, AutoReport degrades to dashboard definitions and editable narrative, marking points as missing. It does not fabricate alarm, work-order, or CMMS state.
- The server report library contains strict contracts and safe rendering components, but no Fastify execution route. Passing unit tests must not be interpreted as an available production report service.

## 8. Extension method

For a new reusable metric, choose a stable `metricKey` unique within the project and supply an `entityId`, unit, formula version, and explicit dependency roles and sources. A safe calculation expressible as two equal-timestamp series should follow preview → user approval → calculate. Perform other calculations in tested deterministic code, then persist through register/record_sample.

To extend the general calculator, add an explicit `formulaKind` instead of evaluating arbitrary `formula` text. Define zero/null/unit/time-alignment behavior and cover non-persisting preview, idempotent writes, latest selection, and project isolation. For dashboard use, `metricInstanceId` is the most explicit binding; the same-project `metricKey + entityId` pair is also supported.

Before promoting KPI to a standalone capability, define a KPI registry, type and version model, target/threshold, evaluation period, aggregation, permissions, feedback semantics, and persistence contract, then connect REST, Agent, Dashboard, and Report. The current open `metricType` string, `kpiKeys`, and `stat_value` name are not substitutes for that design. Wiring the server report kernel also requires explicit routes, run records, artifact storage, and access control; backend availability cannot be inferred from the AutoReport component.

## 9. Corresponding tests

- [`derivedMetrics.test.ts`](../../../../apps/api/src/derivedMetrics.test.ts): store uniqueness, per-instance formula lineage, legacy migration, latest/history, Agent register/lookup/read, ratio/difference, and non-persisting preview.
- [`chat.test.ts`](../../../../apps/api/src/chat.test.ts): full tool loops for calculating and saving COP, reusing a stored metric, previewing before approval, and creating a derived-metric dashboard.
- [`dashboards.test.ts`](../../../../apps/api/src/dashboards.test.ts): derived-metric bindings and project-scoped latest/history batch reads.
- [`App.test.tsx`](../../../../apps/web/src/App.test.tsx): source-aware assembly of dashboard latest/history queries in the Web app.
- [`AutoReport.test.tsx`](../../../../apps/web/src/ui/AutoReport.test.tsx): report intent, dashboard evidence aggregation, derived-metric reads, missing/stale degradation, and browser printing.
- [`reports/derivedMetricEvidence.test.ts`](../../../../apps/api/src/reports/derivedMetricEvidence.test.ts) and [`reports/contracts.test.ts`](../../../../apps/api/src/reports/contracts.test.ts): unit coverage for derived-metric evidence, period boundaries, and KPI-key contracts in the not-yet-routed report kernel.

These links identify relevant executable coverage; they do not claim that the tests were run specifically while generating this page. See [Testing and verification](../development/testing.md) for the milestone's final results.

## 10. Known limitations and related documentation

Current limitations are: ratio/difference are the only general formulas; inputs use exact timestamp alignment; SQLite is a local file rather than a shared metric service; some instance-ID and metric-dependency paths lack cross-project checks; there is no standalone KPI REST or feedback service; the server report kernel has no execution route; and AutoReport only performs frontend evidence aggregation and printing. `metricType: "kpi"`, report `kpiKeys`, and KPI wording in the UI must all be interpreted as Partial.

Related pages:

- [BMS integration](bms-integration.md)
- [Dashboards and Reports](dashboards-reports.md)
- [Chat and Agent Runtime](chat-agent-runtime.md)
- [Tools, Skills, Memory, and Grounding](tools-skills-memory-grounding.md)
- [Runtime and storage topology](../architecture/runtime-storage.md)
- [REST, SSE, and WebSocket contracts](../architecture/api-events.md)

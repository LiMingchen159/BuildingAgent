# Runtime and materialization

[中文](../../zh-CN/fdd/runtime-materialization.md) | [Developer documentation home](../README.md) | [FDD overview](overview.md) | [Brick mapping and deployability](brick-deployability.md)

> Product code baseline: `main@af44ff15`. Overall status: **Partial**, limited to Reports consuming `fdd_rule` evidence; this baseline has no FDD Task, runtime registry, evaluator, materialization scheduler, or FDD routes. The Task and materialization implementation below comes from unmerged candidate commit `71c2cb6d2c382348e6ccc47badea611183b0912d`. It documents a verifiable candidate design only and is not a `main` API or released capability.

## 1. Status and code baseline

| Capability | Product `main@af44ff15` | M007 candidate `71c2cb6d…` |
| --- | --- | --- |
| Report-side FDD evidence consumption | **Partial**: Reports can call an injected fault evidence tool, validate its result strictly, and assemble `FaultEvent` values. | The candidate runtime is not connected to product `main`'s `FaultEvidenceTool` port. |
| FDD Task and deployment check | **Planned**: no model, store, or route. | **Candidate / unmerged**: a Task stores an algorithm snapshot, check, parameters, and project state. |
| Runtime registry and evaluator | **Planned**: no `apps/api/src/fdd/**`. | **Candidate / unmerged**: the runtime registry matches algorithm keys exactly; the fixed snapshot has 59 executable entries. |
| Periodic materialization, history, and latest | **Planned (FDD)**: the product has generic Derived Metrics but no FDD producer. | **Candidate / unmerged**: each entity evaluator becomes a derived metric with `metricType: "fdd"` and periodic samples. |
| Dashboard and attribution | Product Dashboards/Reports are consumers and do not detect faults themselves. | **Candidate / unmerged**: deployment creates a Dashboard; a separate LLM attribution endpoint exists, but attribution is not deterministic detection. |

The candidate `FddTaskStatus` defines five values, but the presence of a type does not mean every state has a complete operation contract:

| Task state | Candidate meaning and verified transitions |
| --- | --- |
| `checking` | The prior runtime authorization is withdrawn pending a new check after an algorithm snapshot change, or when startup finds that policy, freshness, project signature, algorithm version, or entity coverage is no longer valid. |
| `ready` | An evaluator is registered and the check is `can_deploy`, but executable instances have not yet been established and started successfully. |
| `running` | Deployment established derived metric instances for at least one complete entity, enabled materialization, and scheduled the first run. It does not prove that the most recent evaluation succeeded. |
| `paused` | The type includes it, but no FDD Task route in this commit transitions a Task to `paused`. Generic derived metric materialization can be paused independently; that is a different state machine. |
| `cannot_deploy` | The specification has no registered evaluator or the current check cannot authorize deployment. Read missing points, ambiguity, and history blockers from the check instead of relying only on this summary state. |

## 2. Purpose and boundary

The Runtime executes a reproducible evaluation over a **versioned algorithm snapshot, explicit entity point mappings, and a bounded time window**. Materialization stores the evaluation facts for read-only Dashboard, report, or other consumers. Neither layer may treat a catalog card, deployability decision, LLM attribution, or operator prose as a detection result.

Five objects must remain distinct:

1. `FddDeployabilityCheck` proves input readiness for one project data signature, algorithm version, and policy version; it does not run the rule.
2. `ProjectFddTask` freezes the project, source, sharing scope, algorithm snapshot, parameters, and check. It is a control-plane object, not a fault record.
3. The runtime registry decides whether an algorithm key has a tested evaluator; `deployableRuntime: true` alone cannot authorize execution.
4. The derived metric instance, materialization configuration, and samples are the candidate data-plane runtime and history records.
5. A product Reports `FaultEvent` is a detection fact in one report evidence package. A candidate derived metric sample does not automatically become that type without a future explicit, tested adapter.

Product `main` currently has only the **consumer boundary** for item 5, not an FDD producer made from the first four items. Every candidate state-machine description on this page is subject to that boundary.

## 3. User entry points and key source entry points

Product `main` has no FDD runtime user entry point, `/api/projects/:projectId/fdd-*` routes, or dedicated FDD Web workspace. Its verifiable entry points are all in Reports:

- fault definitions and the `producerKind: "fdd_rule"` contract: [evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- injected fault tool contract: [evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- result validation and `FaultEvent` assembly: [evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- detection/diagnosis boundary: [analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts)

The following entry points are pinned to an immutable candidate commit; they are not current-source links:

- Task, check, state, and parameter types: [M007 `library.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts)
- evaluator allowlist: [M007 `runtimeRegistry.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts)
- deterministic rules and window logic: [M007 `evaluator.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.ts)
- routes, deployment, materializer, Dashboard, and attribution assembly: [M007 `server.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/server.ts)
- derived metric SQLite model: [M007 `derivedMetrics.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/derivedMetrics.ts)

The candidate routes include library list/test/deploy, Task list/create/test/parameter update/deploy/delete, and derived metric read/delete/materialization toggle. These paths exist for candidate code review only; consumers must not integrate them as product `main` contracts.

## 4. Normal data flow

The candidate success path is as follows; every step is **Candidate / unmerged**:

1. Run a deployability check for a versioned algorithm. Before deployment, revalidate the `v2-observed-history` policy, check freshness, project data signature, algorithm id/version, and entity coverage; an old check cannot continue to authorize runtime.
2. The Task stores the algorithm snapshot and parameters. BuildingGPT recommendations can initialize default parameters, while operator overrides record their source, reason, update time, and user.
3. `isExecutableFddAlgorithm` requires a global builtin, `deployableRuntime`, and an evaluator with the same key in the registry. Uploaded specifications and DOCX entries without evaluators remain non-runnable.
4. Register one derived metric instance for each fully mapped entity in the check. Required-point mappings become `raw_point` dependencies; metadata stores the Task, algorithm, deployment state, parameters, and grounding references.
5. Deployment moves the Task to `running`, enables `formulaKind: "fdd_rule"` materialization for each instance, and creates a project Dashboard with status, 7-day attribution, 24-hour trends, and detection logic.
6. Candidate defaults evaluate every five minutes with a 30-day lookback and match other inputs to the most populated anchor series within a 15-minute tolerance. A scheduler loop selects due work every minute. These are candidate defaults, not field recommendations.
7. The evaluator reads Task parameters such as `window_minutes`. For rules requiring persistence, a fault is confirmed only when the current condition is present, at least two valid window samples fault, no valid sample is normal, the latest fault is recent enough, and the fault span covers the window with a small cadence grace.
8. Each sample records numeric/text value, quality, status, inputs, per-input timestamps and lag, tolerance, reason, derived values, source window, and stable calculation run id. No input is stored as `no_data / invalid / not_calculable`, not as normal.
9. The Dashboard reads latest/history through derived metric bindings. The candidate attribution endpoint may ask an LLM to explain a client-submitted evidence summary; that text cannot change evaluator samples or confirm root cause.
10. Product Reports would still need an explicit adapter to convert these results into definition/tool-provenanced `FaultEvent` values. That connection exists in neither baseline.

## 5. Data, state, and persistence

The candidate design spans two local stores and one externally authoritative data source:

| Data | Candidate location and lifecycle |
| --- | --- |
| Algorithm catalog, project Tasks, checks, and library check runs | `SeedStore` fields `fddAlgorithms`, `fddTasksByProject`, `fddChecksByProject`, and `fddLibraryCheckRunsByProject`, persisted with the project JSON store. A Task contains an algorithm snapshot instead of only a mutable catalog pointer. |
| Metric definitions, versions, instances, and dependencies | `DerivedMetricStore` SQLite tables. Each project/entity/metric key instance keeps the algorithm version and raw-point dependencies. |
| Materialization control plane | SQLite `metric_materialization`, with enabled, interval/lookback, formula kind, alignment policy, last/next run, watermark, status, and last error. |
| Detection history and latest | SQLite `metric_samples` and `metric_latest`. `(instance_id, ts, calculation_run_id)` updates idempotently, and only a sample no older than the current latest can replace latest. |
| Raw BMS time series | Authoritative external collector data. The candidate reads bounded windows and does not copy them into the FDD Task. |
| Dashboard | Candidate project JSON store. It persists bindings and layout, not detection history. |
| LLM attribution response | Returned per candidate endpoint request. The endpoint itself does not persist a diagnosis as deterministic fault fact. |

Sample metadata keeps input values and timing alignment evidence, but it is not a complete audit log: the candidate has no separate run entity recording every scheduler start/end, software build id, or external request digest. A product Reports evidence package is also not a long-term alias for these SQLite tables.

## 6. Permissions and project isolation

Product `main`'s Reports upstream must authenticate and select a project. The evidence executor additionally rejects tool output whose project, equipment, definition, or time window differs from the request. This is a fact-consistency defense, not a replacement for route authorization.

Candidate routes require a valid session, project membership, and the currently selected project. Library/Task/derived metric reads and attribution use `chat:read`; checks, deployment, create/delete, parameter updates, and materialization toggles use `chat:write`. Instance-id reads and mutations also compare `instance.projectId`. Tasks and checks carry `projectId`, and Dashboard broadcasts are scoped to a project.

These guards exist only in an unmerged candidate and are not product guarantees. Productization should separate permissions for catalog reads, check configuration, runtime deploy/pause, parameter changes, fault-fact reads, and LLM diagnosis instead of permanently reusing broad Chat permissions. Background scheduling must also revalidate instance, data-source, and owner-project identity before reading each dependency.

## 7. Errors, degradation, and external dependencies

- A catalog-only specification with no registry/evaluator returns candidate error `fdd_runtime_not_supported`; it must not create a fake running Task that only emits `no_data`.
- Deployment fails with 422 when the check is not `can_deploy` or no complete entity mapping exists. `uncertain` must not default to runnable.
- An old policy version, expired check, changed project data signature, or changed algorithm version triggers a new check. Startup auditing moves an old `running`/`ready` Task back to `checking` and disables its prior materialization with `authorization_required`.
- With no BMS configuration or input history, the materializer records `no_data / invalid / not_calculable`. Missing input, an inactive gate, and numeric normal `0` are distinct semantics.
- An unknown evaluator, missing dependencies, or a materializer exception is not repaired by an LLM. The periodic scheduler marks materialization `error`, retains `lastError`, and schedules another attempt.
- A first-run background failure is logged as a warning. The periodic materializer is an in-process timer, so it stops with the process and has no distributed lease or cross-instance exclusion.
- Dashboard or LLM provider failure must not mutate materialized samples. When candidate attribution returns unavailable/invalid output, consumers should retain detection facts and show diagnosis as unavailable.
- The product Reports fault tool can still return `complete / no_data / error` and rejects mismatched evidence strictly; the candidate runtime does not implement that tool adapter.

External dependencies are the project BMS collector and its point/time-series quality, plus an optional LLM provider for attribution. SQLite, the project JSON store, and WebSocket broadcasts are candidate process-local responsibilities.

## 8. Extension method

A new executable rule must deliver, in one reviewed change: a versioned algorithm definition; required points, units, and parameters; an evaluator matching the algorithm key; runtime registry registration; window/missing-data/boundary tests; Task deployment tests; sample provenance; and an explicit product `FaultEvidenceTool` adapter. Adding only a catalog row, formula text, or `deployableRuntime: true` is insufficient.

Materializer extensions should keep evaluators pure and deterministic and leave I/O in the materializer. Define anchor selection, alignment tolerance, cadence grace, lookback, timezone, idempotency key, recomputation policy, and parameter version explicitly. Preserve input timestamps, source window, and evaluator/build lineage for every recomputation so historical results are not silently overwritten.

Before productizing the Task control plane, add explicit pause/resume transitions and specify how Task state summarizes per-entity materialization states. In the candidate, `paused` Task exists only in the type while the derived metric toggle can pause a materialization independently, allowing `Task=running / materialization=paused` divergence.

Attribution should remain read-only post-detection analysis. Its input must cite materialized fault timestamps, actual input history, and parameters used, and its output must express uncertainty. Natural-language attribution must never write the fault bit, alter Task parameters, or replace field confirmation.

## 9. Corresponding tests

The product baseline tests only the report consumer boundary:

- fault tool outcomes, strict validation, no-data/error, and evidence packages: [evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- detection/diagnosis boundary, citations, and failure degradation: [analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- fault types, report assembly, and rendering: [contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts), [reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts)

Candidate tests must run in a clean worktree containing the corresponding immutable commit:

- every registry key has a non-fallback evaluator, plus concrete rule outputs: [M007 `evaluator.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts)
- catalog/runtime consistency, spec-only degradation, and old Task migration: [M007 `fddLibrary.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts)
- routes, check policy, deployment authorization, restart invalidation, and project BMS isolation: [M007 `bms.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/bms.test.ts)
- SQLite samples/materialization and Dashboard FDD bindings/attribution: [M007 `derivedMetrics.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/derivedMetrics.test.ts), [M007 `dashboards.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/dashboards.test.ts)

These are test entry points. They do not claim that candidate tests were rerun while writing this page, and the candidate's historical 52-test result cannot be recorded against `main@af44ff15`. See [Testing and verification](../development/testing.md) for final milestone regression results.

## 10. Known limitations and related documentation

- Product `main` has no FDD Task, evaluator, runtime, materializer, FDD routes, or candidate Dashboard; it has only the report-side evidence consumer.
- Candidate runtime and routes are concentrated in a large `server.ts` and depend on an in-process timer, local JSON/SQLite, and an external collector; this is not a released distributed task service.
- Only the 59 entries aligned with the candidate registry are executable. Other catalog entries cannot run merely because a check succeeds.
- `FddTaskStatus.paused` has no candidate Task operation path, so Task and materialization can diverge.
- Candidate defaults of 15-minute nearest-point alignment, 30-day lookback, and five-minute interval require validation against each site's sample rate and rule; they are not general engineering guarantees.
- Candidate derived metrics are not connected to the product Reports `FaultEvidenceTool`; a Dashboard binding is not a report provenance adapter.
- LLM attribution is degradable diagnostic prose, not a detector, confirmed root cause, or control instruction.

Continue with [FDD overview](overview.md), [Rule model and sources](rule-model-sources.md), [Brick mapping and deployability](brick-deployability.md), and [Verification and sample provenance](verification-provenance.md). See [Runtime and storage topology](../architecture/runtime-storage.md) for storage boundaries, [Derived Metrics and KPI](../features/derived-metrics-kpi.md) for the generic metric store, and [Dashboards and Reports](../features/dashboards-reports.md) for the report consumer.

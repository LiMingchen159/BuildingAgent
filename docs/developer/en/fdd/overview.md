# FDD overview

[中文](../../zh-CN/fdd/overview.md) | [Developer documentation home](../README.md) | [Rule model and sources](rule-model-sources.md) | [Runtime and materialization](runtime-materialization.md)

> Product code baseline: `main@af44ff15`. Status: **Partial**, limited to the `fdd_rule` evidence-consumer contract in Reports. This baseline has no `apps/api/src/fdd/**`, FDD algorithm catalog, evaluator, or FDD routes. M007 material linked below comes from unmerged candidate commits and must not be treated as a `main` API, released capability, or product guarantee.

## 1. Status and code baseline

FDD documentation must preserve two separate baselines. Screenshots, counts, and types from a candidate branch must never be projected onto product `main`.

| Baseline | Status | Claims supported by this baseline | Claims not supported by this baseline |
| --- | --- | --- | --- |
| Product `main@af44ff15` | **Partial** | Reports can register a fault evidence definition with `producerKind: "fdd_rule"`, call an injected fault evidence tool, validate its result, and create report-scoped `FaultEvent` values. Report analysis strictly separates detection from diagnosis. | The repository contains an FDD detector, algorithm library, deployment checks, project FDD Tasks, an FDD REST API, or an FDD Web workspace. |
| M007 candidate commits | **Candidate / unmerged** | `d8eeb1fb…` introduces project-scoped algorithm models and an evaluator; `71c2cb6d…` expands the classified catalog, DOCX provenance, and runtime registry; later M007 commits explore equipment evidence and homogeneous-fleet deployment. | Those interfaces are released on `main`, counts are stable, site deployment is validated, or the candidate branch is compatible with current product storage and APIs. |

The following counts describe the catalog snapshot at candidate commit `71c2cb6d…`. “Executable” means only that an algorithm key is both registered in the candidate runtime registry and backed by an evaluator. It does not mean the code is merged, connected to site data, or validated for diagnostic accuracy.

| Equipment type | Candidate catalog entries | Candidate executable runtime | DOCX-imported, specification only |
| --- | ---: | ---: | ---: |
| AHU | 72 | 0 | 44 |
| Chiller | 56 | 56 | 0 |
| Cooling tower | 12 | 0 | 12 |
| FCU | 20 | 0 | 20 |
| Pump | 18 | 0 | 18 |
| Sensor | 3 | 3 | 0 |
| VAV | 17 | 0 | 17 |
| **Total** | **198** | **59** | **111** |

The candidate's 198 entries therefore do not mean 198 runnable detectors: only 56 chiller rules and three sensor rules enter its runtime registry. The 111 DOCX imports form a non-executable specification catalog; another 28 AHU built-ins also lack a candidate runtime, for 139 non-executable entries in that snapshot. The number 111 is not another way to write `198 - 59`.

## 2. Purpose and boundary

FDD commonly expands to “fault detection and diagnostics,” but code responsibilities must remain separate:

- **Detection**: a deterministic rule or auditable model uses only a versioned definition, mapped points, and data from a bounded period to produce fault facts. The detector owns the fault code, interval, status, and evidence references.
- **Diagnosis**: B-Agent may only offer an explicitly uncertain interpretation or investigation hypothesis over supplied fault facts. It must not add detections, change fault codes, calculate facts, or confirm a root cause.

Four frequently conflated layers must also remain distinct:

1. A **catalog / specification** describes algorithm identity, applicable equipment, required points, parameters, formula, version, and provenance. An algorithm card does not imply executable code.
2. **Deployability** checks whether a project has trustworthy equipment and point mappings, units, history coverage, and fleet evidence. `can_deploy` expresses input readiness only; it proves neither correctness nor that a task is running.
3. A **runtime** is an evaluator registered for an exact algorithm key. A rule with metadata but no registered evaluator must remain non-executable.
4. **Materialization** converts deterministic execution output into a project result, derived metric, or report `FaultEvent` while retaining definition version and input evidence. It must not re-detect or invent missing facts.

The product baseline implements only a portion of the fourth layer: a report consumes facts from an external fault tool. It is not a general FDD runtime. The candidate M007 work is where the first three layers and project-task materialization are proposed together.

## 3. User entry and key source entry

Product `main` has no FDD-specific user entry or `/api/fdd/**` routes. Every verifiable current entry is inside the Reports responsibility domain:

- Fault definitions and the `fdd_rule` producer contract: [evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- Injected fault evidence tool input/output boundary: [evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- Fault-fact validation and report `FaultEvent` creation: [evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- `FaultEvent`, evidence package, and report-block types: [contracts.ts](../../../../apps/api/src/reports/contracts.ts)
- Detection/diagnosis boundary and grounded-analysis validation: [analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts), [analysisPrompt.ts](../../../../apps/api/src/reports/analysisPrompt.ts)

The following links are pinned to immutable candidate commits for design study. They are not links to `main` source:

- Project algorithms, Tasks, and deployability model: [M007 `library.ts` at `d8eeb1fb…`](https://github.com/LiMingchen159/BuildingAgent/blob/d8eeb1fb5541f08267e66c492e4a8b39bacf8de2/apps/api/src/fdd/library.ts)
- Deterministic evaluator: [M007 `evaluator.ts` at `d8eeb1fb…`](https://github.com/LiMingchen159/BuildingAgent/blob/d8eeb1fb5541f08267e66c492e4a8b39bacf8de2/apps/api/src/fdd/evaluator.ts)
- The 111-entry import catalog and conversion: [M007 catalog](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentCatalog.ts), [M007 library adapter](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts)
- Evaluator allowlist: [M007 `runtimeRegistry.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts)
- Equipment-inventory evidence exploration: [M007 `equipmentEvidence.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.ts)
- Homogeneous-fleet constraints: [M007 `fddHomogeneousFleet.test.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts)

## 4. Normal data flow

### 4.1 Actual product-`main` report consumer flow

1. The report definition registry declares a versioned fault definition for an equipment type. Every fault code binds a severity, detector id, and detector version.
2. The report executor supplies project, equipment, period, planned request, and definition to an injected `FaultEvidenceTool`. This interface is a **consumer port**; `main` provides no in-repository FDD adapter that implements the detector.
3. The tool returns a `complete`, `no_data`, or `error` outcome. A complete outcome still must match project, equipment, period, definition, registered fault code, valid time interval, and typed evidence.
4. Valid facts are deterministically converted into stable `FaultEvent` values and added to the evidence package. No-data and error executions cannot own fault events.
5. Only these detected events may enter report analysis. The analysis executor constrains “diagnosis” to an uncertain hypothesis over supplied fault evidence and rejects prose that crosses the detection/diagnosis boundary.

This flow demonstrates that a report can safely consume an external FDD producer. It does not demonstrate that the product contains that producer.

### 4.2 M007 candidate flow

The candidate design extends the flow to: versioned catalog → project/equipment evidence → point candidates and deployability check → project Task snapshot → registry-aligned evaluator → result materialization. Later homogeneous-fleet exploration requires evidence for the equipment set and template applicability before bulk deployment; a mapping that works for one example device cannot establish fleet-wide readiness.

This candidate flow explains design direction only. A merged implementation would have to realign with current `main` permissions, storage, report tool adapters, and API contracts. Candidate `server.ts` routes must not be copied into current API documentation.

## 5. Data, state, and persistence

| Data/state | Product `main@af44ff15` | M007 candidate |
| --- | --- | --- |
| Fault definition | A versioned registry supplied as a report execution dependency; not a persistent FDD algorithm catalog. | Candidate global builtin/community cards contain formula, points, parameters, version, and provenance. |
| Raw timeseries and equipment semantics | Read by the injected tool; the report contract receives only the outcome and typed evidence. | Candidate deployability/evaluator code expects project BMS, semantic, and history evidence. |
| FDD Task / check run | No corresponding product model or store field exists. | Candidate `SeedStore` adds project Tasks, check results, algorithm snapshots, and related state. |
| Detection result | A report-scoped `FaultEvent` lives in the evidence package and is consumed with definition/tool provenance. | Candidate evaluator output may be further materialized as a project result or derived metric; the exact semantics evolve across candidate commits. |
| DOCX source | The product does not store the M011 attachment and does not contain the 111-entry catalog. | Candidate code records source filename, SHA-256, original formula/Brick classes, and review classification in a generated catalog. |

A report `FaultEvent` is a typed fact in one report evidence package; it is not a durable FDD alarm database. Conversely, a candidate Task snapshot must not be described as a product `apps/data/store.json` schema before merge. Real BMS history and site equipment remain externally authoritative.

## 6. Permissions and project isolation

The product baseline has no separately authorized FDD REST surface. Report entry points perform upstream authentication and project selection; the evidence executor additionally requires the tool result's `projectId`, equipment, period, and definition to match the active report context. That is a data-consistency defense, not a replacement for route-level membership and permission checks.

The candidate model binds Tasks, check runs, and point mappings to a `projectId`, and candidate routes use the selected project as a boundary. Those unmerged guards are not a product permission guarantee. Productizing the candidate would require separate permissions for catalog reads, project deployment configuration, run/pause, result reads, and cross-project sharing. Every id lookup must resolve the owner project before membership checks, and BMS credentials, private points, or another project's evidence must never be exposed to the Agent.

## 7. Errors, degradation, and external dependencies

- The product fault tool can explicitly return `no_data` or `error`. Reports preserve execution state and data quality; they never degrade missing data into “no fault detected.”
- A mismatch in project, definition, equipment, period, fault code, RFC3339 time, or typed evidence causes the product executor to reject the result. It does not ask an LLM to repair facts.
- Report diagnosis does not run without a detected fault event. Incomplete evidence coverage is rendered as a coverage warning, not a normal conclusion.
- In the candidate, a catalog specification marked `implementation_ready` is still non-executable without a runtime registry entry and evaluator. Missing points, incompatible units, insufficient history, or inconsistent fleet evidence must also block or degrade deployment.
- BMS/collector services, site semantics, an external detector, and an LLM provider can all be unavailable. Only the detector produces detection facts; an LLM failure cannot change deterministic results.
- Candidate counts and tests describe fixed commits, not future catalog size, accuracy, coverage, or site energy-impact guarantees.

## 8. Extension method

To add FDD capability on product `main`, first implement a deterministic, read-only adapter satisfying `FaultEvidenceTool`. Pin detector id/version, input evidence, and no-data/error semantics for every definition. Only then decide whether to introduce the candidate catalog and project Task model. Do not call unmerged M007 routes directly from the Web, and do not assign detection to free-form Agent text.

A new rule requires at least: a traceable specification; normalized required points and units; explicit parameters and default provenance; a reproducible evaluator; one-to-one runtime-registry alignment; project/equipment/period isolation; positive, negative, boundary, missing-data, and error tests; result provenance; and a report adapter. Adding catalog JSON or setting `deployableRuntime` to true is insufficient.

If candidate code is reused, port it layer by layer from a new issue branch based on latest `main` and revalidate it. Do not merge a long-lived candidate branch wholesale. Any new REST, SSE, WebSocket, storage, or TypeScript contract is outside the M011 documentation milestone and requires separate design and authorization.

## 9. Corresponding tests

The repeatable product-baseline FDD gate is the Reports consumer-contract suite, not an `apps/api/src/fdd` suite that does not exist:

- Fault-tool outcomes, strict validation, no-data/error behavior, and evidence package: [evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- Detection/diagnosis boundary, reference restrictions, and analysis failure: [analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- Fault types, report assembly, and rendering: [contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts), [reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts), [latexRenderer.test.ts](../../../../apps/api/src/reports/latexRenderer.test.ts)

Candidate tests must run in a clean worktree containing the corresponding commit. On `main@af44ff15`, a missing test file cannot be interpreted as a successful skip. Fixed candidate references are [M007 `fddLibrary.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts) and [M007 `evaluator.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts). A targeted result previously obtained in a candidate worktree is evidence for that candidate snapshot only; it must not be rewritten as a product-`main` FDD pass count.

## 10. Known limitations and related documentation

- Product `main` currently has no FDD catalog, evaluator, deployability, Task, materialization API, or dedicated Web surface; it has only a report evidence-consumer contract.
- Candidate `198 / 59 / 111` values are facts about snapshot `71c2cb6d…`, not current product API output or a release commitment.
- Candidate DOCX states `implementation_ready / requires_configuration / requires_review` classify specification preparation. They differ from deployability `can_deploy / uncertain / cannot_deploy` and from Task runtime states.
- “Executable runtime” means a candidate evaluator exists. It does not establish Brick mapping, project data readiness, site commissioning, accuracy, or safety approval.
- A validation ratio in the documentation sample is source-case evidence only, not a BuildingAgent product guarantee; the attachment is not copied into this repository.

Continue with [Rule model and sources](rule-model-sources.md), [Brick mapping and deployability](brick-deployability.md), [Runtime and materialization](runtime-materialization.md), and [Verification and sample provenance](verification-provenance.md). See [Dashboards and Reports](../features/dashboards-reports.md) for the report-side contract and [BMS integration](../features/bms-integration.md) for the external data boundary.

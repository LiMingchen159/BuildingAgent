# Verification and sample provenance

[中文](../../zh-CN/fdd/verification-provenance.md) | [Developer documentation home](../README.md) | [FDD overview](overview.md) | [Runtime and materialization](runtime-materialization.md)

> Product code baseline: `main@af44ff15`. Status: **Partial**, limited to Reports consuming and validating facts from an external `fdd_rule` producer. This baseline has no FDD producer, algorithm catalog, deployability workflow, Task model, or dedicated FDD test directory. Every M007 link is pinned to an unmerged candidate commit and proves only that candidate snapshot. The attachments are **external sources**: they are not copied into the repository and are not product acceptance certificates.

## 1. Status and code baseline

An FDD “pass” must identify the subject, commit, data, and acceptance rule. The following layers cannot substitute for one another with a single pass marker:

| Verification subject | Baseline and status on this page | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Product Reports consumer contract | `main@af44ff15`, **Partial** | External fault-tool results are checked against project, equipment, period, definition, fault code, time, and typed evidence; detection remains separate from LLM diagnosis. | An FDD evaluator exists in the product or site detection is accurate. |
| M007 catalog / registry | `71c2cb6d…`, **Candidate / unmerged** | Catalog uniqueness, provenance fields, and alignment between `deployableRuntime` and the evaluator registry in one snapshot. | A catalog entry is deployable on a project or the candidate API is released. |
| M007 deployability / fleet | `6c7936e…` and `bef810af…`, **Candidate / unmerged** | Equipment-inventory, point, unit, history, and homogeneous-fleet constraints under fixed fixtures. | An arbitrary site's Brick model and point quality satisfy those constraints, or its whole fleet is ready. |
| Historical replay | Candidate tests or the attachment case | How a rule triggers for a fixed version, mapping, parameters, and period. | A trigger is the physical root cause, the rule has no false positives, or future data will behave the same way. |
| FDD sample DOCX | **External case** | One roughly 31-page source contains 51 chiller rules, Brick mappings, parameters, WKGO historical validation, and 24 references. | BuildingAgent capability, accuracy, coverage, energy savings, or an SLA. |

Catalog consistency, evaluator correctness, deployment readiness, historical replay, and site commissioning are five different kinds of evidence. A review can interpret “validated” only when the record states which layers were completed.

## 2. Purpose and boundary

This page defines an auditable verification chain: source integrity → catalog/registry consistency → evaluator determinism → project deployability → materialization and historical replay → report consumption. It does not use a single test count or case-study percentage to endorse the whole FDD capability.

Candidate verification should have at least these layers:

1. **Specification and provenance**: algorithm key, version, required points, parameters, formula, Brick classes, and source summary are traceable, with no silent field loss in generated catalogs.
2. **Catalog / registry consistency**: ids and keys are unique; only keys backed by a deterministic evaluator can claim candidate runtime support; specification-only entries remain non-executable.
3. **Rule unit verification**: positive, negative, threshold-boundary, persistence-window, recovery, missing-data, invalid-unit, and time-order cases produce deterministic outcomes.
4. **Deployment evidence**: complete inventory, point parentage, semantics, engineering units, history coverage, and ambiguous candidates enter the decision. One example device cannot stand in for fleet evidence.
5. **Historical materialization**: a frozen input interval is replayed with a fixed version, preserving mapping, parameters, sampling/alignment policy, watermark, latch, and output provenance. Repeated execution must be explainable and as idempotent as possible.
6. **Attribution and reporting**: a materialized result can reference its input evidence, but a “rule trigger” attributes only that the rule condition held. Physical root cause still needs site inspection; an LLM may provide only an explicitly uncertain diagnostic hypothesis.

The attachment classifies its 51 rules under WKGO conditions as `Unsupported`, `Deployable + No trigger`, and `Deployable + Triggered`. These are case-specific conceptual combinations of data availability and observed execution. They are **not** an enum in the candidate API and do not map one-to-one to candidate definition states, `can_deploy / uncertain / cannot_deploy`, or Task states. A migration must preserve “can run” and “triggered during the observation period” separately rather than coercing both into one status field.

## 3. User entry and key source entry

Product `main` has no FDD verification page or `/api/fdd/**` route. Its current verifiable entries are Reports consumer boundaries:

- Fault definitions and the `fdd_rule` producer description: [evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- External fault-tool input, outcomes, and descriptor: [evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- Strict outcome validation, execution records, and `FaultEvent` assembly: [evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- Detection/diagnosis separation and grounded-analysis validation: [analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts)

Candidate source and tests must use immutable links. The following files are not claimed to exist on product `main`:

| Candidate concern | Pinned source / test |
| --- | --- |
| Catalog, deployability types, and policy | [`library.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts), [`fddLibrary.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts) |
| Evaluator / registry alignment | [`runtimeRegistry.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts), [`evaluator.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts) |
| English source, symbol, and Brick fidelity | [`importedEquipmentEnglish.test.ts` at `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/importedEquipmentEnglish.test.ts) |
| Equipment inventory, units, and evidence signature | [`equipmentEvidence.ts` at `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.ts), [`equipmentEvidence.test.ts` at `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.test.ts) |
| Homogeneous fleet, atomic deployment, and historical state | [`fddHomogeneousFleet.test.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts) |

## 4. Normal data flow

A reviewable verification run should preserve evidence in this order rather than infer rule correctness from a final dashboard screenshot:

1. Pin the full commit SHA, lockfile, runtime, algorithm-definition version, and input-fixture hashes. Verify SHA-256 for an attachment or human transcription first; a hash establishes byte identity, not correctness.
2. Run catalog checks for counts, id/key uniqueness, provenance fields, required points and Brick classes, parameter-resolution state, and exact set equality between `deployableRuntime` and the runtime registry.
3. Run positive, negative, and boundary samples for every registered evaluator. Verify ordering, windows, units, missing values, recovery, and determinism. A specification-only definition without an evaluator cannot enter this stage.
4. Evaluate deployability with target-project evidence. Distinguish an authoritative complete inventory from a partial export, and preserve every candidate, rejection reason, unit/history issue, evidence signature, and policy version. Fleet deployment requires a complete, homogeneous counterpart for every target entity.
5. Materialize a frozen historical interval. Record source revision, time zone, sampling cadence, alignment tolerance, parameters, mapping, watermark/latch, and evidence references for each result. A rerun must not silently rewrite old outcomes.
6. Pass detected facts to the current Reports consumer contract. Product `main` rejects mismatched project, equipment, period, definition, fault code, or typed evidence. `no_data` and `error` cannot masquerade as “no fault.”
7. Perform human/expert review and diagnosis last. Trigger count, duration, and ratio are observations; every root-cause or repair proposal must retain uncertainty and an explicit site-check step.

## 5. Data, state, and persistence

A verification record should independently answer “what was evaluated, with what inputs, when, and with what result.” At minimum, preserve these immutable or versioned fields:

| Category | Record | Interpretation boundary |
| --- | --- | --- |
| Code and definition | Full commit SHA, algorithm key/version, registry/policy version, parameters, and their provenance | A branch name or `latest` is not reproducible; a definition state is not a deployment state. |
| Input evidence | Project/equipment, point mappings, Brick classes, units, source revision, time range/time zone, sampling/coverage, and fixture hash | Raw BMS and semantic models remain authoritative in external systems. |
| Execution state | Check id, candidates/rejections, missing/ambiguous/history issues, Task snapshot, watermark/latch | Candidate fields are not a product-`main` schema. |
| Output | Normal/fault/no-data/error, interval, count, duration, typed evidence, and result hash | A trigger is rule output, not a confirmed root cause. |
| Review | Command, tool versions, pass/fail/skip, log location, reviewer, timestamp, and known deviations | Reporting only “52 passed” cannot reproduce a run. |

### External attachment register

| Source | SHA-256 | Summary used here | Repository policy |
| --- | --- | --- | --- |
| `FDD样本(1).docx` | `f9f5854e1c8270d19ed4e61d15aec65ffba8614bfc38865e8b41d5a46eb1ec35` | Roughly 31 pages; 51 chiller rules; Brick mappings and parameters; WKGO deployment/historical validation; 24 references. | Do not copy the attachment, the 51 full rule texts, or the full bibliography. Retain only this summary and hash. |
| Hand-drawn target architecture | `89f2be1d159a11406c93ed11b4b49b808210b4f33ff6d1ba234c416fcb2a0781` | Source for the four-layer target relationship; it does not directly substantiate rule verification. | Do not copy the original image. See the editable redraw in [Target architecture](../architecture/target-architecture.md). |

The attachment reports that 25 of 51 rules were deployable under the data conditions then present at WKGO, while 26 lacked required inputs: `25 / 51 = 49.02%`. The number belongs only to that project, period, and decision method. It is not a general BuildingAgent coverage rate, an acceptance threshold, or a product guarantee. The presence of 24 references in the attachment also does not mean M011 individually verified or licensed those works for republication.

## 6. Permissions and project isolation

- Historical BMS data, point names, equipment relationships, alarms, and maintenance conclusions may all be sensitive project data. A verifier must read them only within an authorized project context and bind outputs to that same `projectId`; fixtures from different tenants must not be merged for comparison.
- Product Reports project/equipment/period matching is an additional consistency check, not a replacement for route authentication, membership, and operation permissions. Candidate routes and test tokens are not product authorization evidence.
- For external attachments, record only the display name, summary, and SHA-256. Do not commit the original, temporary extraction, local attachment path, author metadata, or embedded credentials. Share originals only through the project's approved document channel.
- Minimize and de-identify site history before replay, and define a retention period. Logs must not contain Bearer tokens, BMS passwords, private collector addresses, or full raw time series; failing fixtures follow the same rule.
- Human labels and Ground Truth must record source, reviewer role, date, and conflict handling. LLM-generated judgments are not unreviewed Ground Truth and must not enter another project's memory or report.

## 7. Errors, degradation, and external dependencies

- If a source hash differs, a commit is unavailable, the lockfile changes, or a fixture is incomplete, mark the result non-reproducible instead of carrying forward an old “pass.”
- Without explicit evidence that an equipment inventory is complete, “device/point not found” is not authoritative absence. Unknown or non-convertible units, unverified history coverage, or close candidates must block deployment or degrade it to uncertain.
- Catalog/registry mismatches fail closed. A runtime flag without an evaluator cannot fall back to a generic formula or an LLM; an evaluator without a traceable catalog definition is not publishable either.
- Historical-source outages, timestamp/time-zone faults, sampling changes, duplicates, and late data can alter windows, latches, and rates. Preserve `no_data`/error and coverage; never fill them with a normal zero.
- A materialization failure must not leave half a fleet marked successful. A retry must use the recorded watermark and version to decide whether it is safe. Candidate tests characterize one implementation and are not a product transaction guarantee.
- Expert review, Brick/BMS, collectors, and the external fault producer are dependencies. Static catalog checks may still run when they are unavailable, but deployability, historical behavior, and site validation cannot be claimed complete.

## 8. Extension method

Before implementing a new rule or equipment library, create its verification matrix. Each specification row should cover source/hash, required-point and Brick checks, registry decision, evaluator positive/negative/boundary samples, missing-data/unit/history cases, single-device and fleet evidence, materialization lineage, report consumption, and human review. Keep fixtures small and de-identified, and label them synthetic, public, or site-derived.

Reproduction and review checklist:

- Create a detached, clean worktree from a full SHA. Confirm `git status --short` is empty, and do not combine source or tests from different M007 commits.
- Record Node, npm, Vitest, operating system, time zone, and lockfile hash. Install from the lockfile and list exact test files and every non-secret environment switch.
- Verify attachment/fixture hashes. Record input period, sampling rules, units, mappings, parameters, policy/registry version, and external-service stubs. Inject real credentials only through secret management and keep them out of logs.
- Preserve passes, failures, skips, and warnings. Rerun deterministic tests and compare structured output or hashes rather than unstable screenshots.
- Trace a sample of historical triggers back to raw evidence. Separate data quality, operating conditions, threshold sensitivity, and possible equipment faults, and record expert disagreement.
- Confirm there are no cross-project references, no attachment entered Git, and no report promoted diagnosis prose into a detection fact. Have an independent reviewer sign the applicable scope and unverified items.

Any productization of candidate capability should port layers independently onto latest `main` and rerun this matrix. New APIs, schemas, CI, or runtime are outside the M011 documentation milestone.

## 9. Corresponding tests

Product `main@af44ff15` has no dedicated FDD catalog/evaluator/deployability/Task test file. What it does have is a suite for consuming external fault evidence in Reports:

- Outcomes, strict field validation, `no_data`/`error`, execution provenance, and evidence packages: [evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- Detection/diagnosis separation, citation constraints, prompt-injection data boundaries, and analysis failure: [analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- Type, assembly, and rendering regression: [contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts), [reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts), [latexRenderer.test.ts](../../../../apps/api/src/reports/latexRenderer.test.ts)

The M011 preliminary analysis previously ran six FDD-targeted test files on a candidate working line, with **all 52 tests passing**. This is a historical candidate gate, not a test result for `main@af44ff15`, and the count alone is not reproducible. Pinned candidate test evidence includes:

- Catalog, provenance, states, and registry consistency: [`fddLibrary.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts)
- Rule evaluators: [`evaluator.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts)
- Equipment/unit evidence: [`equipmentEvidence.test.ts` at `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.test.ts)
- English-source fidelity: [`importedEquipmentEnglish.test.ts` at `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/importedEquipmentEnglish.test.ts)
- Homogeneous fleet, materialization state, and atomicity: [`fddHomogeneousFleet.test.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts)

A rerun must select a **single full SHA** that contains every required file and report the tests actually collected and passed for that snapshot. Do not splice the files above from different commits into an invented 52-test suite. See [Testing and verification](../development/testing.md) for final product-regression commands and environment rules.

## 10. Known limitations and related documentation

- Product `main` only validates and consumes external fault facts. It has no in-repository FDD producer and no site accuracy, precision/recall, false-positive/false-negative, or commissioning evidence.
- Candidate unit and integration fixtures establish code contracts, not that every Brick model, BMS unit, historical-data set, and homogeneous fleet satisfies the assumptions.
- The 52-test result is one historical candidate execution. Without a full SHA, command, environment, and logs, it cannot be promoted into a reproducible release gate.
- The attachment's 51 rules, 24 references, three-state classification, and WKGO `25/51 = 49.02%` are source-case facts. The three states are not an API enum, and the ratio is not a product guarantee.
- SHA-256 establishes unchanged attachment bytes, not author identity, reference validity, rule correctness, usage rights, or generality of site conclusions.
- Historical triggering establishes only that a rule condition held for given inputs and parameters. A dashboard “attribution” view and report diagnosis cannot replace root-cause confirmation.

Continue with [Rule model and sources](rule-model-sources.md), [Brick mapping and deployability](brick-deployability.md), [Runtime and materialization](runtime-materialization.md), [BMS integration](../features/bms-integration.md), and [Dashboards and Reports](../features/dashboards-reports.md).

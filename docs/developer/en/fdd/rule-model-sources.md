# Rule model and sources

[中文](../../zh-CN/fdd/rule-model-sources.md) | [Developer documentation home](../README.md) | [FDD overview](overview.md)

> Product baseline: <code>main@af44ff15</code>. Rule-model and count evidence baseline: [candidate snapshot@71c2cb6d](https://github.com/LiMingchen159/BuildingAgent/commit/71c2cb6d2c382348e6ccc47badea611183b0912d). Status: product <code>main</code> does not yet contain the candidate FDD catalog; the candidate snapshot implements a rule catalog, source-preserving provenance, and 59 evaluator registrations, so the overall capability is documented as **Partial**.

## 1. Status and code baseline

This page keeps two baselines separate. The product baseline, <code>main@af44ff15</code>, has no <code>apps/api/src/fdd/**</code>. Therefore, 198, 59, and 111 below are not released API counts for that <code>main</code>; they are an auditable inventory of the fixed <code>71c2cb6d…</code> candidate snapshot. The candidate’s unified structures are in [FddAlgorithm, FddRequiredPoint, parameter, and source definitions](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L5-L113), and its runtime allowlist is in [runtimeRegistry.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts#L1-L79).

| Equipment type | Candidate catalog entries | Entries with evaluators | Main source |
| --- | ---: | ---: | --- |
| AHU | 72 | 0 | 28 research-oriented DBN seeds plus 44 DOCX-imported definitions |
| Chiller | 56 | 56 | 51 CH-01…CH-51 rules, four rule examples, and one low-COP indicator |
| FCU | 20 | 0 | DOCX-imported definitions |
| Pump | 18 | 0 | DOCX-imported definitions |
| Cooling tower | 12 | 0 | DOCX-imported definitions |
| VAV | 17 | 0 | DOCX-imported definitions |
| Sensor | 3 | 3 | Chilled-water supply/return temperature and flow flatline rules |
| **Total** | **198** | **59** | 56 chiller evaluators and three sensor evaluators |

All 111 DOCX-imported entries are **spec-only**: 44 AHU, 20 FCU, 18 Pump, 12 Cooling tower, and 17 VAV. Candidate tests fix their equipment counts, source hashes, and definition-status distribution; project points and UI filtering do not alter those catalog facts.

## 2. Purpose and boundary

The rule model represents “what inputs a fault definition needs, how it is computed, which parameters are tunable, and where it came from” as a traceable catalog object. Point mapping, site deployability checks, and an evaluator consume that definition later. The model solves definition and provenance problems; it does not prove that a project has acceptable points or that a reported alarm is a correct diagnosis.

Candidate <code>FddAlgorithm</code> is the aggregate root for a catalog card. It combines identity and version, equipment and fault classifications, method, <code>requiredPoints</code>, outputs, parameters, formula, logic summary, provenance, <code>deployableRuntime</code>, and optional definition-review metadata. “Algorithm” can mean an executable rule or a specification-only definition here. A name or formula string never proves execution support; the runtime registry must also be checked.

The candidate has no single interface literally named <code>FddParameter</code>. “Parameter” is deliberately split into three layers:

- <code>FddParameterSpec</code> is the algorithm’s typed/default/bounds/editable contract.
- <code>FddDefinitionParameter</code> preserves a source-document threshold symbol, raw default, and its <code>source_default / source_expression / site_required</code> resolution.
- <code>FddTaskParameterValue</code> is the actual value on a deployment task, including source, reason, confidence, and update time.

These layers are not interchangeable. In particular, “the source document contains a threshold” does not mean “the site approved that threshold.”

## 3. User entry and key source entry

Enter the product <code>main</code> boundary through [Current implementation architecture](../architecture/current-architecture.md) and [BMS integration](../features/bms-integration.md). Candidate FDD cannot be promised through a stable entry in that product baseline.

Candidate evidence is pinned to these immutable links:

- Core types, catalog seeds, and store reconciliation: [library.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L5-L113)
- Generated DOCX catalog, including each source filename and SHA-256: [importedEquipmentCatalog.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentCatalog.ts#L1-L397)
- Normalization of source symbols, Brick classes, units, and one-of inputs: [importedEquipmentLibrary.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts#L300-L342)
- Definition status, issue text, and specification-object assembly: [importedEquipmentLibrary.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts#L353-L461)
- The 51 chiller definitions and candidate builtin assembly: [library.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L791-L1031)
- Evaluator allowlist and three-part executable check: [runtimeRegistry.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts#L1-L79)

The header of <code>importedEquipmentCatalog.ts</code> explicitly marks it as generated. It is candidate source evidence, not the recommended place to hand-maintain 111 business rules.

## 4. Normal data flow

The candidate’s main path for a DOCX-imported definition is:

1. The generated catalog records equipment type, filename, SHA-256, and a symbol dictionary for each source. Each rule preserves its id, category, raw required points, diagnostic expression, raw tunable parameters, persistence window, raw Brick mapping, and source hash.
2. The importer splits input groups on commas and retains a source <code>or</code> group as one required slot. It derives searchable semantics from variable descriptions or Brick classes while preserving <code>sourceSymbols</code> and <code>sourceBrickClasses</code> instead of overwriting the source.
3. The importer infers quantity kind and acceptable units, then converts source persistence into <code>historyRequirement</code>. When a DOCX provides no canonical engineering unit, <code>unitRoleDescription</code> explicitly requires confirmation before deployment.
4. Raw parameters become definition parameters. Missing site values, source expressions, and semantic conflicts feed configuration/review metadata; the classifier produces <code>definitionStatus</code> and <code>definitionIssues</code>.
5. The importer assembles <code>FddAlgorithm</code>, places the first eight source-hash characters in the version, and preserves the full hash in both <code>sourcePaperId</code> and <code>sourceDefinition</code>. All 111 entries set <code>deployableRuntime: false</code>.
6. <code>seedFddAlgorithms()</code> combines candidate builtins with the imported catalog. Only an object with <code>global_builtin</code> scope, <code>deployableRuntime: true</code>, and a key in the evaluator registry may enter the executable path.

The attachment is traced to candidate structures only through this summary; the 51 rule bodies are not migrated:

| Sample concept | Candidate representation | Fact boundary |
| --- | --- | --- |
| CH-01…CH-51 rules and detection logic | <code>algorithmKey</code>, <code>formula</code>, and <code>logicSummary</code> | The candidate has 51 corresponding chiller entries; this page does not reproduce the full ruleset. |
| Required variables and Brick mapping | <code>FddRequiredPoint</code> plus source symbol/Brick class | Matching hints and source evidence, not a verified site point id |
| Tunable parameters | <code>FddParameterSpec</code> plus definition/task parameter layers | Defaults still require approval against design or a historical baseline |
| WKGO deployment and historical execution classes | A conceptual combination of deployability check and evaluator output | Not the same API enum as <code>FddDefinitionStatus</code> or <code>FddDeployabilityStatus</code> |

## 5. Data, state, and persistence

### 5.1 Rule objects

| Object/field | Role | What it does not mean |
| --- | --- | --- |
| <code>FddAlgorithm.id / algorithmKey / version</code> | Stable identity, logic key, and version; a DOCX import version includes a source-hash prefix | A deployed instance |
| <code>FddRequiredPoint</code> | Stable slot, label, semantics, quantity kind, unit role, aliases, and history requirement | A confirmed BMS point or verified measurement quality |
| <code>sourceSymbols / sourceBrickClasses</code> | Positionally preserve source formula symbols and Brick classes | A complete Brick RDF graph or an executed point binding |
| <code>FddParameterSpec</code> | Runtime/UI-readable type, default, range, and editability | The final site value |
| <code>FddSourceDefinition</code> | Preserves rule id, source file, full SHA-256, and three raw text fields | Proof of authorship, correctness, or applicability |
| <code>deployableRuntime</code> | Expresses candidate catalog intent to run; scope and evaluator registry must also pass | Project-level <code>can_deploy</code> |
| <code>definitionStatus</code> | Says whether a specification is clear, lacks site values, or needs engineering review | Whether an alarm triggered |

Candidate seeding writes builtin and community catalog entries into <code>SeedStore.fddAlgorithms</code> and downgrades legacy community/task snapshots without an evaluator to spec-only; see [seed and reconciliation logic](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L1029-L1075). This is a candidate-line data contract and must not be presented as an existing <code>apps/data/store.json</code> schema in product <code>main</code>.

### 5.2 External attachment provenance

The analyzed <code>FDD样本(1).docx</code> is about 31 pages and combines a chiller product manual with a WKGO deployment-validation report. It covers 51 chiller rules, Brick mappings, parameter guidance, historical validation, and 24 references. The file is not copied into the repository; only its byte-level digest is recorded:

- SHA-256: <code>f9f5854e1c8270d19ed4e61d15aec65ffba8614bfc38865e8b41d5a46eb1ec35</code>
- In WKGO, 25 of 51 rules had the required data, producing 49.02% coverage. This is a result for that project under that data and expert review, **not a product coverage or performance guarantee**.

This hash is also not the source hash of any of the five DOCX files behind the 111-entry imported catalog. The generated catalog records those five sources separately. The 51 chiller candidate seeds preserve only <code>sourcePaperId: fdd-library-chiller-final</code> and do not put this attachment hash in <code>FddSourceDefinition</code> at the fixed snapshot, so the two must not be presented as API-equivalent provenance.

The hand-drawn framework image is likewise not copied into the repository. Its SHA-256 is <code>89f2be1d159a11406c93ed11b4b49b808210b4f33ff6d1ba234c416fcb2a0781</code>; see [Target architecture](../architecture/target-architecture.md) for its redrawn structure and boundaries.

## 6. Permissions and project isolation

Candidate <code>global_builtin</code> rules are global catalog metadata and must not contain customer point names, credentials, or project-private thresholds. <code>global_community</code> expresses sharing scope, but candidate reconciliation disables runtime for community algorithms. Sharing a definition does not grant cross-project access to BMS, knowledge-base, or historical data.

Actual point mappings, deployability checks, task snapshots, and parameter overrides must belong to a project id and be used only after server-side authorization. A rule card’s <code>sourceSymbols</code>, Brick class, or default threshold cannot bypass project membership and is not authority for an LLM to read site data. If a source attachment contains site information, an importer should retain only the necessary definition and digest while treating the original as a controlled document, not a public fixture.

## 7. Errors, degradation, and external dependencies

The 111 spec-only entries use three definition states with this fixed distribution:

| Status | Count | Meaning |
| --- | ---: | --- |
| <code>implementation_ready</code> | 43 | The definition is clear enough to begin evaluator implementation; it **still has no evaluator** |
| <code>requires_configuration</code> | 46 | At least one threshold, mode encoding, or site parameter must be configured |
| <code>requires_review</code> | 22 | The source predicate, grouping, symbol, or Brick mapping is ambiguous/contradictory and requires engineering review |

Parsing deliberately degrades rather than guessing. Examples include mixed AND/OR without parentheses, absent thresholds, and direction mismatches between a symbol and its Brick class; these become <code>definitionIssues</code>. SHA-256 confirms only whether input bytes match, not whether a source is trustworthy or a formula is correct. Brick classes and source symbols are candidate hints; deployment must still verify point identity, units, history coverage, and equipment ownership.

The sample report’s three states classify historical execution results; they are not aliases of a candidate enum:

| Sample state | Closest candidate concept | Why it is not the same enum |
| --- | --- | --- |
| Unsupported | A site check tending toward <code>cannot_deploy</code> | The sample uses WKGO ground truth; the candidate also has <code>uncertain</code>, while definition-review state is separate |
| Deployable + No trigger | <code>can_deploy</code> plus no sustained evaluator trigger in that history window | No single field encodes both deployability and no trigger |
| Deployable + Triggered | <code>can_deploy</code> plus a true fault output | Triggering is a runtime result, not <code>definitionStatus</code> |

## 8. Extension method

Add or update a source through a repeatable catalog-generation flow; do not hand-edit an individual row in the generated file. The output must preserve the full source hash, raw required points, raw parameters, raw Brick mapping, rule id, and diagnostic expression. The normalizer can then produce stable slots, quantity kinds, unit candidates, and positionally matched source-symbol/Brick-class evidence.

Status changes must satisfy these gates:

1. A rule can move forward from <code>requires_review</code> only after formula/mapping ambiguity is resolved.
2. Configuration is complete only after each <code>site_required</code> parameter has a design value or approved baseline.
3. <code>implementation_ready</code> allows evaluator work to begin. Runtime may be set only after implementing the evaluator, registering it, adding positive/negative/boundary tests, and keeping catalog metadata exactly aligned with the registry.
4. Project deployment still runs point and history evidence checks; catalog status must never directly produce <code>can_deploy</code>.

Changed source bytes require a new hash/version; never silently reuse the old version. Strong provenance for the 51-rule chiller attachment should explicitly store its hash or a controlled-document id in a future candidate rather than infer identity from a similar filename.

## 9. Corresponding tests

The candidate snapshot’s [FDD library test](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts#L15-L171) verifies:

- all 51 chiller-document entries have runtime metadata, and 28 non-DOCX AHU definitions exist;
- all 111 DOCX entries are spec-only, have unique ids/keys, and include category, required points, and a persistence window;
- the equipment distribution is 44/20/18/12/17 and definition-state distribution is 43/46/22;
- the full source hash enters <code>sourceDefinition</code>, with its prefix in the version;
- all 262 source symbols preserve a corresponding Brick class;
- runtime metadata exactly matches the evaluator registry.

The M011 preliminary analysis ran six FDD-targeted test files on the candidate working line, with all 52 tests passing. That is a candidate gate, not a product test result for <code>main@af44ff15</code>. See [Testing and verification](../development/testing.md) for final commands, environment rules, and full-repository regression policy.

## 10. Known limitations and related documentation

- Product <code>main@af44ff15</code> has no candidate FDD catalog; every “Implemented” statement must carry its candidate-baseline qualifier.
- 198 counts catalog entries, not executable entries; 59 counts evaluator registrations, not what a project can deploy; 111 counts sourced spec-only definitions, not runnable tasks.
- <code>implementation_ready</code> is easy to misread as runtime ready; this page explicitly prohibits that equivalence.
- The generated catalog preserves DOCX raw fields and hashes, but the 51 chiller seeds lack a complete <code>FddSourceDefinition</code> at this snapshot. The attachment hash is recorded only as developer-documentation provenance.
- This page does not reproduce the attachment’s 51 rule bodies or 24 references and does not present WKGO’s 49.02% as a product commitment.

Continue with [Brick mapping and deployability](brick-deployability.md), [Runtime and materialization](runtime-materialization.md), [Verification and sample provenance](verification-provenance.md), [BMS integration](../features/bms-integration.md), and [Target architecture](../architecture/target-architecture.md).

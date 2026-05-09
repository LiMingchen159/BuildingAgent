---
id: T01
parent: S05
milestone: M001
key_files:
  - README.md
  - docs/HERMES_REPLICATION_STRATEGY.md
  - docs/PRODUCT_REQUIREMENTS.md
  - docs/PRODUCT_ARCHITECTURE.md
  - docs/ENTRYPOINTS_SPEC.md
  - docs/AUTH_ACCESS_CONTROL_SPEC.md
  - docs/PROJECT_MODEL_SPEC.md
  - docs/RUNTIME_SPEC.md
  - docs/MEMORY_SPEC.md
  - docs/TOOL_SYSTEM_SPEC.md
  - docs/SKILL_SYSTEM_SPEC.md
  - docs/MODEL_CONFIGURATION_SPEC.md
  - docs/MODEL_CONFIGURATION_SPEC.md
  - docs/WEB_UI_PLAN.md
  - docs/CLI_SPEC.md
  - docs/EMAIL_GATEWAY_SPEC.md
  - docs/WHATSAPP_GATEWAY_SPEC.md
  - docs/DEVELOPMENT_PLAN.md
  - docs/LICENSE_ATTRIBUTION_PLAN.md
  - buildingagent/tools/building/bim_ifc_tools.py
  - buildingagent/tools/building/brick_rdf_sparql_tools.py
  - buildingagent/tools/building/timeseries_tools.py
  - buildingagent/tools/building/cross_source_linking_tools.py
  - buildingagent/tools/building/visualization_tools.py
  - skills/building/bim_object_exploration.md
  - skills/building/brick_sparql_query.md
  - skills/building/timeseries_trend_analysis.md
  - skills/building/cross_source_equipment_analysis.md
  - skills/building/hhw_reset_analysis.md
key_decisions:
  - M001 remains documentation/scaffold-only; M002 owns functional authenticated Web/CLI/runtime skeleton implementation.
  - Next.js is recommended as the Web app foundation; assistant-ui should be evaluated for the chat workspace after runtime event contracts are clearer.
  - Email and WhatsApp are active only as verified identity/context-resolution specs and placeholder adapter structure; real provider integrations are deferred.
  - Building-domain tools and skills remain placeholders only in M001 with no heavy imports or functional logic.
duration: 
verification_result: passed
completed_at: 2026-05-09T10:14:05.451Z
blocker_discovered: false
---

# T01: Hermes-first BuildingAgent architecture docs, scaffold folders, and building-domain placeholders

**Hermes-first BuildingAgent architecture docs, scaffold folders, and building-domain placeholders**

## What Happened

Created the Hermes-first BuildingAgent planning scaffold after requirements confirmation. Requirements were recorded via GSD requirement tools, including active M001 planning/scaffold requirements, M002/M003 foundation requirements, deferred provider/building-domain capabilities, and explicit out-of-scope anti-features. The repository now has the requested monorepo folder structure, documentation set, building-domain Python placeholder tools, and building-domain skill placeholder markdown files. Verification confirmed all requested docs exist, placeholders exist, heavy domain imports are absent, and placeholder Python modules define no functions or classes. Git status/add/commit/push completed successfully with commit 1451799 on main.

## Verification

Ran scaffold verification via gsd_exec: docs count was 17, no required docs were missing, all building placeholder files and skill placeholder files existed, forbidden heavy imports were absent, and no def/class implementation patterns existed in building placeholder Python files. Ran git status, git add ., git commit -m "Add Hermes-first BuildingAgent architecture plan", and git push successfully; commit 1451799 pushed to origin/main.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `gsd_exec scaffold verification: count docs, check required docs, list placeholders, grep for forbidden imports and def/class patterns` | 0 | ✅ pass | 208ms |
| 2 | `git status; git add .; git commit -m "Add Hermes-first BuildingAgent architecture plan"; git push` | 0 | ✅ pass | 8777ms |

## Deviations

The user requested direct M001 execution after requirements confirmation; because no slice/task plan existed yet, I created the M001 roadmap and an S05/T01 catch-up plan after producing the scaffold so GSD state can track the work. Also corrected an accidental duplicate anti-feature by repurposing R053 to HHW reset analysis out-of-scope for M001.

## Known Issues

The committed repository excludes .gsd artifacts due .gitignore, so PROJECT/REQUIREMENTS and GSD tracking remain local harness state rather than pushed git content. This matches existing repository ignore behavior, but downstream agents should read .gsd locally.

## Files Created/Modified

- `README.md`
- `docs/HERMES_REPLICATION_STRATEGY.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_ARCHITECTURE.md`
- `docs/ENTRYPOINTS_SPEC.md`
- `docs/AUTH_ACCESS_CONTROL_SPEC.md`
- `docs/PROJECT_MODEL_SPEC.md`
- `docs/RUNTIME_SPEC.md`
- `docs/MEMORY_SPEC.md`
- `docs/TOOL_SYSTEM_SPEC.md`
- `docs/SKILL_SYSTEM_SPEC.md`
- `docs/MODEL_CONFIGURATION_SPEC.md`
- `docs/MODEL_CONFIGURATION_SPEC.md`
- `docs/WEB_UI_PLAN.md`
- `docs/CLI_SPEC.md`
- `docs/EMAIL_GATEWAY_SPEC.md`
- `docs/WHATSAPP_GATEWAY_SPEC.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/LICENSE_ATTRIBUTION_PLAN.md`
- `buildingagent/tools/building/bim_ifc_tools.py`
- `buildingagent/tools/building/brick_rdf_sparql_tools.py`
- `buildingagent/tools/building/timeseries_tools.py`
- `buildingagent/tools/building/cross_source_linking_tools.py`
- `buildingagent/tools/building/visualization_tools.py`
- `skills/building/bim_object_exploration.md`
- `skills/building/brick_sparql_query.md`
- `skills/building/timeseries_trend_analysis.md`
- `skills/building/cross_source_equipment_analysis.md`
- `skills/building/hhw_reset_analysis.md`

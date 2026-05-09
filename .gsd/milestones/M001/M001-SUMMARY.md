---
id: M001
title: "Hermes-first BuildingAgent architecture plan"
status: complete
completed_at: 2026-05-09T10:15:40.562Z
key_decisions:
  - BuildingAgent starts with a Hermes-like authenticated, permission-aware multi-project foundation before building-domain logic.
  - M001 is documentation/scaffold-only; M002 owns functional authenticated Web/CLI/runtime skeleton implementation.
  - Hermes reference at /mnt/d/Git_project/references/hermes-agent is read-only and must not be modified or vendored wholesale.
  - Future Hermes code reuse must be small, understood, attributed, and documented.
  - Building-domain tools and skills remain placeholders only in M001.
  - Email and WhatsApp are specified as verified identity/context-resolution adapters in M001; real provider integrations are deferred.
  - Next.js is recommended for the Web foundation; assistant-ui can be evaluated later for chat workspace once runtime event contracts are clearer.
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
lessons_learned:
  - GSD gate state may require exact confirmation phrasing even after a clear plain-chat confirmation.
  - For greenfield planning/scaffold work, it is useful to record requirements before committing docs so downstream milestones have stable IDs.
  - M001 docs should stay practical and avoid implying implementation exists.
---

# M001: Hermes-first BuildingAgent architecture plan

**Hermes-first BuildingAgent architecture plan, repository scaffold, and placeholder domain files**

## What Happened

M001 established the Hermes-first BuildingAgent architecture plan. It recorded the project requirements, created the requested monorepo folder structure, wrote the full documentation set, added building-domain tool and skill placeholders, verified that placeholders remain non-functional, and committed/pushed the scaffold to origin/main. No functional code, heavy dependencies, real provider integrations, building-domain logic, customer data, secrets, or Hermes vendoring were introduced.

## Success Criteria Results

- Documentation set: pass.
- Folder structure: pass.
- Building-domain placeholders: pass.
- Requirements persistence: pass.
- No forbidden implementation/dependency/provider/secret work: pass.
- Git commit and push: pass.

## Definition of Done Results

- All requested documentation files exist under docs/ and cover the requested topics: met.
- Requested monorepo folders exist with placeholder tracking files where needed: met.
- Building-domain Python tool placeholders contain only docstrings/TODO notes, no functional implementation and no heavy imports: met by grep verification.
- Building-domain skill placeholders contain only title, purpose, TODO status, expected future inputs/outputs, and implementation notes placeholder: met.
- Requirements are recorded through GSD and include active, deferred, and out-of-scope entries: met.
- M001 changes are verified with file/constraint checks, committed, and pushed: met, commit 1451799 pushed to origin/main.

## Requirement Outcomes

- Advanced R001-R019 and R027 through documentation/scaffold outputs.
- Left R020-R026 active for M002/M003 implementation.
- Preserved R028-R037 as deferred.
- Preserved R038-R053 as out-of-scope/anti-features.
- No requirements were validated as product behavior because M001 is planning/scaffold-only.

## Deviations

The user requested immediate M001 execution before a full milestone/slice plan existed, so the GSD roadmap and S05/T01 plan were created retroactively to track the completed scaffold. The logical S01-S04 documentation outputs were delivered in the same scaffold commit and then marked skipped to reflect that S05/T01 already covered them.

## Follow-ups

Plan M002: authenticated foundation skeleton. Decide concrete backend framework, frontend starter, database/session approach, and auth/provider-secret strategy. Implement skeleton only: authenticated Web UI, authenticated CLI, backend auth/project model, Hermes-like runtime, memory, tool registry, skill registry, and model configuration.

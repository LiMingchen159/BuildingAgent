# BuildingAgent

BuildingAgent is a building-domain autonomous agent platform. It starts by replicating and adapting the architecture of NousResearch Hermes Agent, then extends that foundation toward authenticated multi-project building workflows.

This repository is currently in the Hermes-first planning/scaffolding stage. Functional runtime, Web UI, CLI, gateway integrations, and building-domain tools are intentionally deferred to later milestones.

## Current focus

- Define the product requirements and architecture.
- Create the monorepo folder structure.
- Document Web, CLI, Email, WhatsApp, runtime, memory, tool, skill, model, and access-control specifications.
- Reserve placeholder files for future building-domain tools and skills.
- Preserve a clear license attribution path for any future Hermes-derived code.

## Key constraints

- The local Hermes reference repository is read-only: `/mnt/d/Git_project/references/hermes-agent`.
- Do not vendor the full Hermes repository into BuildingAgent.
- Do not use Streamlit for the Web UI.
- Do not commit secrets, credentials, or real customer/private building data.
- Do not implement BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, or HHW analysis logic in the initial scaffold.

## Documentation index

Start with:

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_ARCHITECTURE.md`
- `docs/HERMES_REPLICATION_STRATEGY.md`
- `docs/DEVELOPMENT_PLAN.md`

Supporting specs:

- `docs/ENTRYPOINTS_SPEC.md`
- `docs/AUTH_ACCESS_CONTROL_SPEC.md`
- `docs/PROJECT_MODEL_SPEC.md`
- `docs/RUNTIME_SPEC.md`
- `docs/MEMORY_SPEC.md`
- `docs/TOOL_SYSTEM_SPEC.md`
- `docs/SKILL_SYSTEM_SPEC.md`
- `docs/MODEL_CONFIGURATION_SPEC.md`
- `docs/WEB_UI_PLAN.md`
- `docs/CLI_SPEC.md`
- `docs/EMAIL_GATEWAY_SPEC.md`
- `docs/WHATSAPP_GATEWAY_SPEC.md`
- `docs/LICENSE_ATTRIBUTION_PLAN.md`

# M001: Hermes-first BuildingAgent architecture plan

**Vision:** Create the Hermes-first BuildingAgent architecture plan and repository scaffold without functional implementation, preserving a clean path to authenticated, permission-aware, multi-project platform implementation.

## Success Criteria

- Documentation covers Hermes replication strategy, product requirements, product architecture, entrypoints, auth/access control, project model, runtime, memory, tools, skills, model configuration, Web UI, CLI, Email, WhatsApp, development plan, and license attribution.
- Folder structure requested by the user exists.
- Building-domain tool and skill placeholders exist and remain non-functional.
- Requirements are persisted in `.gsd/REQUIREMENTS.md` through GSD requirement tooling.
- No real building-domain logic, provider integration, heavy dependencies, secrets, or Hermes vendoring are introduced.

## Slices

- [x] **S01: Hermes replication and product requirements docs** `risk:medium` `depends:[]`
  > After this: After this: a reader can see how BuildingAgent will use Hermes as a read-only architecture reference and what is in/out of the first scaffold.

- [x] **S02: Repository scaffold and placeholders** `risk:low` `depends:[S01]`
  > After this: After this: the repository has the requested monorepo folders plus placeholder building-domain tool and skill files with no real implementation.

- [x] **S03: Entrypoint specifications** `risk:medium` `depends:[S02]`
  > After this: After this: Web, CLI, Email, and WhatsApp each have practical specs that share one authentication/context-resolution model.

- [x] **S04: Backend runtime and governance specs** `risk:medium` `depends:[S03]`
  > After this: After this: backend architecture specs define auth, project model, runtime, memory, tools, skills, and model configuration around permissions and project isolation.

- [x] **S05: S05** `risk:low` `depends:[]`
  > After this: After this: M001 has a development plan, discoverable README, verified scaffold, and committed/pushed planning artifacts.

## Boundary Map

## Boundary Map

### S01 → S02
Produces:
  docs/HERMES_REPLICATION_STRATEGY.md → Hermes concepts to replicate/adapt/defer/replace, read-only reference policy
  docs/PRODUCT_REQUIREMENTS.md → product scope and M001/MVP boundaries
  docs/LICENSE_ATTRIBUTION_PLAN.md → attribution process for future Hermes-derived code

Consumes: PROJECT.md and REQUIREMENTS.md

### S02 → S03
Produces:
  repository directories → apps, buildingagent package areas, skills, tests, scripts, docs, third_party_licenses
  placeholder files → building-domain tool and skill placeholders
  docs/PRODUCT_ARCHITECTURE.md → shared architecture diagram

Consumes from S01:
  docs/HERMES_REPLICATION_STRATEGY.md → replication boundaries
  docs/PRODUCT_REQUIREMENTS.md → out-of-scope constraints

### S03 → S04
Produces:
  docs/ENTRYPOINTS_SPEC.md → shared entrypoint context rules
  docs/WEB_UI_PLAN.md → authenticated Web UI plan and frontend stack recommendation
  docs/CLI_SPEC.md → authenticated CLI command contract
  docs/EMAIL_GATEWAY_SPEC.md → verified email adapter design
  docs/WHATSAPP_GATEWAY_SPEC.md → verified phone adapter design

Consumes from S02:
  docs/PRODUCT_ARCHITECTURE.md → shared backend/runtime architecture

### S04 → S05
Produces:
  docs/AUTH_ACCESS_CONTROL_SPEC.md → RBAC/future ABAC, code-vs-data permission distinction, audit logging
  docs/PROJECT_MODEL_SPEC.md → workspace/project/membership/resource isolation model
  docs/RUNTIME_SPEC.md → Hermes-like runtime contract
  docs/MEMORY_SPEC.md → memory types and project isolation
  docs/TOOL_SYSTEM_SPEC.md → tool risk levels and dispatcher contract
  docs/SKILL_SYSTEM_SPEC.md → skill format/registry/enablement/injection contract
  docs/MODEL_CONFIGURATION_SPEC.md → model/provider configuration contract

Consumes from S03:
  docs/ENTRYPOINTS_SPEC.md → context resolution requirements

### S05 → downstream milestones
Produces:
  docs/DEVELOPMENT_PLAN.md → M002-M005 implementation sequence
  README.md → documentation index and constraints
  verified M001 scaffold → committed and pushed planning artifacts

Consumes from S01-S04:
  all M001 planning docs and placeholder files

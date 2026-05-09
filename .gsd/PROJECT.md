# BuildingAgent

## What This Is

BuildingAgent is a greenfield building-domain autonomous agent platform. It should first replicate and adapt the architecture of NousResearch Hermes Agent, using the local read-only reference repository at `/mnt/d/Git_project/references/hermes-agent`, then extend that foundation into building-domain autonomous agent capabilities.

GSD2 is only the development harness. BuildingAgent is the final product.

The first stage was planning, repository structure, documentation, and replication strategy only. The current implementation stage is M002, which is adding a thin authenticated foundation skeleton while keeping production identity providers, real model execution, persistence, and building-domain tool execution out of scope. The Hermes reference repository must remain read-only. If MIT-licensed Hermes code is copied into BuildingAgent later, attribution and license notices must be preserved.

## Core Value

BuildingAgent must first provide a Hermes-like authenticated agent foundation with multi-project and permission-aware structure. If everything else is cut, the foundation should still include authenticated Web UI direction, authenticated CLI direction, runtime skeleton, memory skeleton, tool registry, skill registry, model configuration, project model, and access control model.

## Project Shape

- **Complexity:** complex
- **Why:** BuildingAgent is a multi-user, multi-project agent platform with authenticated Web/CLI/Email/WhatsApp entry points, permission-aware runtime/tool execution, persistent memory, provider configuration, future building-domain tools, and commercial deployment constraints.

## Current State

BuildingAgent has completed the M001 planning/scaffold phase and is executing M002: Authenticated foundation skeleton.

The Hermes Agent repository has been cloned locally at `/mnt/d/Git_project/references/hermes-agent` and should be studied as a read-only architecture and code reference. BuildingAgent should prefer reusing, adapting, and porting Hermes architecture and code where appropriate, but should not vendor the full Hermes repository.

The first real user group for the MVP is the project owner's own development/research workflow, followed by an internal building-engineering/research team. External customer/project teams are important later, but not the first MVP target. The first MVP should prove the platform architecture and development workflow before real customer deployment.

M002/S01 has delivered the first real authenticated backend contract: a FastAPI composition root, public `/health`, request-id middleware, canonical structured errors, provider-shaped local/dev bearer auth, seeded users/workspaces/projects/memberships, reusable request-context services, `POST /auth/dev-login`, `GET /auth/me`, bounded `GET /projects`, and `GET /projects/{project_id}/context`. These surfaces are verified by in-process pytest/TestClient coverage and documented in `docs/API_CONTRACT.md` for downstream runtime, CLI, and Web slices.

## Architecture / Key Patterns

BuildingAgent should use a monorepo structure with:

- Python backend / agent runtime
- Next.js Web UI
- CLI
- Authenticated Email gateway specification/adapter
- Authenticated WhatsApp gateway specification/adapter
- Skills
- Tests
- Documentation
- License attribution tracking

The Web UI is the first product interface. It must not use Streamlit. It should investigate modern React/Next.js AI frontend stacks such as assistant-ui, CopilotKit, AG-UI, or a custom Next.js AI UI.

The platform foundation should replicate Hermes-like concepts:

- agent loop
- prompt builder
- runtime provider abstraction
- model/provider resolver
- tool registry
- tool dispatcher
- session manager
- permission-aware execution
- callback/event stream for Web UI
- persistent memory
- skill system
- gateway architecture
- configuration system
- future scheduler, subagent, and trajectory/context-compression support

All entry points must authenticate and resolve:

- `user_id`
- `workspace_id`
- `project_id`
- role
- permission scopes

M002/S01 established the backend/API version of that context contract through frozen dataclasses, seeded stores, `RequestContext.to_public_dict()`, and FastAPI dependencies. Future CLI/Web/runtime slices should consume the same stable fields and error codes rather than inventing parallel context shapes.

Every API response should carry `X-Request-ID`. Structured API errors should use the centralized shape from `buildingagent.core.errors`: `error.code`, `error.message`, `error.details`, and `error.requestId`, without bearer tokens, stack traces, or file paths.

Every tool call must go through the backend tool dispatcher and permission layer. Sensitive tool calls and sensitive memory/data access should be audit logged. Project memory and project data must be isolated by `project_id`.

MVP access control should use RBAC first while allowing future ABAC. Code/platform permissions and project/data permissions must remain separate. The MVP should optimize for fast researcher/operator iteration, with governance designed in from the beginning rather than overbuilt for enterprise deployment immediately.

Building-domain BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, and visualization capabilities are future work. At the first planning/scaffolding stage, they should exist only as placeholder files and documentation, with no functional implementation and no heavy dependencies.

## Local Verification Notes

This environment does not provide a base `python`, `pip`, or system `pytest`. Use the project virtualenv or uv-managed commands for Python verification, for example:

```bash
.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py
```

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Hermes-first platform planning scaffold — create the repository structure, documentation, placeholder building-domain tool/skill files, and replication strategy without functional implementation.
- [ ] M002: Authenticated foundation skeleton — implement authenticated Web UI skeleton, authenticated CLI skeleton, backend auth/project model skeleton, Hermes-like runtime skeleton, memory skeleton, tool registry skeleton, skill registry skeleton, and model configuration skeleton.
  - [x] S01: Authenticated API and project context contract — FastAPI local/dev auth, seeded project model, structured errors, request IDs, and documented `/auth/me`, `/projects`, and project context endpoints.
- [ ] M003: Permission-aware runtime integration — wire request scoping, RBAC checks, dispatcher authorization, audit log surfaces, and project-scoped memory behavior across Web UI and CLI.
- [ ] M004: Gateway adapter specifications and stubs — add authenticated Email and WhatsApp gateway adapter skeletons that resolve verified identity and project context without implementing full provider integrations.
- [ ] M005: Building-domain expansion planning — turn BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, and visualization placeholders into scoped implementation milestones.

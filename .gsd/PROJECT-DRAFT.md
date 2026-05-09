# BuildingAgent

## What This Is

BuildingAgent is a new building-domain autonomous agent platform, starting from scratch. It should first replicate and adapt the architecture of the locally cloned NousResearch Hermes Agent reference at `/mnt/d/Git_project/references/hermes-agent`, then extend that foundation toward building-domain work. GSD2 is only the development harness; BuildingAgent is the final product.

The first stage is not functional implementation. It is planning, repository structure, documentation, and a Hermes-first replication strategy. The Hermes reference repository is read-only and must not be modified. If MIT-licensed Hermes code is copied later, attribution and license notices must be preserved.

## Core Value

BuildingAgent must first provide a Hermes-like authenticated agent foundation with a multi-project, permission-aware structure. If everything else is cut, the foundation should still include authenticated Web UI direction, authenticated CLI direction, runtime skeleton, memory skeleton, tool registry, skill registry, model configuration, project model, and access control model.

## Project Shape

- **Complexity:** complex
- **Why:** BuildingAgent is a multi-user, multi-project agent platform with authenticated Web/CLI/Email/WhatsApp entry points, permission-aware runtime/tool execution, persistent memory, provider configuration, future building-domain tools, and commercial deployment constraints.

## Current State

The BuildingAgent repository is effectively greenfield. The current repository contains only initial project files and GSD state. The Hermes Agent reference repository has been cloned locally at `/mnt/d/Git_project/references/hermes-agent` and should be studied as a read-only architecture/code reference.

The first real user group is the project owner’s own development/research workflow, followed by an internal building-engineering/research team. External customer/project teams matter later but are not the first MVP target.

## Architecture / Key Patterns

BuildingAgent should use a monorepo structure with a Python backend/agent runtime, Next.js Web UI, CLI, gateways, skills, tests, docs, and license attribution. It should not use Streamlit. It should investigate modern React/Next.js AI frontend stacks such as assistant-ui, CopilotKit, AG-UI, or a custom Next.js AI UI.

The platform foundation should replicate Hermes-like concepts: agent loop, prompt builder, provider abstraction, model/provider resolver, tool registry, tool dispatcher, session manager, permission-aware execution, callback/event stream, persistent memory, tools, skills, gateways, and configuration. Building-domain BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, and visualization tools are placeholders only at this stage.

All entry points must authenticate and resolve `user_id`, `workspace_id`, `project_id`, role, and permission scopes. Every tool call must go through the backend dispatcher and permission layer. Project memory/data must be isolated by `project_id`. Sensitive access and sensitive tools should be audit logged.

MVP governance should optimize for fast researcher/operator iteration while keeping the architecture ready for future enterprise auditability, project isolation, RBAC/ABAC, tool permissions, data permissions, and audit logs.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Hermes-first platform planning scaffold — create the repository structure, documentation, placeholder building-domain tool/skill files, and replication strategy without functional implementation.
- [ ] M002: Authenticated foundation skeleton — implement authenticated Web UI skeleton, authenticated CLI skeleton, backend auth/project model skeleton, Hermes-like runtime skeleton, memory skeleton, tool registry skeleton, skill registry skeleton, and model configuration skeleton.
- [ ] M003: Permission-aware runtime integration — wire request scoping, RBAC checks, dispatcher authorization, audit log surfaces, and project-scoped memory behavior across Web UI and CLI.
- [ ] M004: Gateway adapter specifications and stubs — add authenticated Email and WhatsApp gateway adapter skeletons that resolve verified identity and project context without implementing full provider integrations.
- [ ] M005: Building-domain expansion planning — turn BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, and visualization placeholders into scoped implementation milestones.

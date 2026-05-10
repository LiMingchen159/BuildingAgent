# BuildingAgent

## What This Is

BuildingAgent is a building-domain autonomous agent platform inspired by NousResearch Hermes Agent. Hermes is the general autonomous agent platform reference; BuildingAgent is the building-operations assistant platform built on a Hermes-inspired general agent foundation.

BuildingAgent should eventually support building data, BIM, semantic models, time-series data, and building operations workflows. The first version focuses on a local working platform foundation skeleton, not building-domain analytics.

## Core Value

The one thing that must work even if everything else is cut is a clean, authenticated, project-isolated Hermes-like platform foundation where the login → project selection → chat workspace flow works and future runtime, memory, tools, skills, model providers, permissions, and building-domain capabilities have clear boundaries.

## Project Shape

- **Complexity:** complex
- **Why:** BuildingAgent is a multi-entry platform with Web UI, CLI, backend API, auth, RBAC, project isolation, runtime/tool/skill/memory/provider skeletons, external-channel placeholders, and a Hermes-derived architecture baseline.

## Current State

The BuildingAgent repository is effectively greenfield, with only a minimal README present. No backend, Web UI, CLI, auth model, runtime, registries, memory layer, or building-domain placeholders have been implemented yet.

Hermes Agent is available locally as a read-only architectural and engineering reference at `/mnt/d/Git_project/references/hermes-agent`. Do not modify that repository. Do not blindly vendor the full Hermes codebase. Selected Hermes components may be reused, copied, and adapted when doing so materially speeds up development and preserves BuildingAgent’s own project structure, naming, permission model, and building-domain roadmap. Preserve license notices and attribution for any Hermes-derived code.

## Architecture / Key Patterns

BuildingAgent should use Hermes Agent as the engineering baseline/reference for the general agent platform layer, including:

- agent reasoning/runtime architecture
- planning and execution loop patterns
- tool registry and dispatcher patterns
- skill registry and execution patterns
- memory architecture
- model/provider abstraction
- runtime/session structure
- CLI interaction patterns
- Web UI structure where useful
- permission, approval, audit, and safety patterns
- tests and smoke-check patterns

The first working version should establish a practical Hermes-like platform skeleton before later milestones specialize it for BIM, Brick/RDF/SPARQL, time-series, HHW, and building-operations workflows.

The Web UI should use a modern React/Next.js-style product interface, not Streamlit. The first user flow is login → project selection → chat workspace. The UI should also include coherent navigable placeholder pages for project dashboard, model/provider settings, skills manager, tools manager, data source settings, user and permission settings, and audit logs.

The CLI should require authentication and provide a minimal working skeleton for login, project list, project use, chat, model list, skill list, and tool list.

Authentication in v1 should be pragmatic local auth with seeded users and tokens. It must include clear backend-side auth checks and project-scoped permissions, but it does not need SSO, invite flow, password reset, enterprise identity, or production-grade deployment.

Project data and project memory must be isolated by project. Tool calls must go through backend-side permission checks. Code/platform permissions and project/data permissions should remain conceptually separate.

Email and WhatsApp gateways should exist only as authenticated placeholders. They must not allow anonymous interaction.

Building-domain tools should only be placeholders in v1:

- BIM/IFC tools
- Brick/RDF/SPARQL tools
- time-series tools
- cross-source linking tools
- visualization tools

Building-domain skills should only be placeholders in v1:

- BIM object exploration
- Brick SPARQL query
- time-series trend analysis
- cross-source equipment analysis
- HHW reset analysis

Do not add real building data to the repository. Real BIM, Brick, time-series, and mapping data should later be configured as project-scoped external data sources.

Development style:

- prioritize a working vertical slice over excessive documentation
- keep documentation concise and implementation-oriented
- make practical assumptions instead of asking minor questions
- let GSD decide the milestone/slice/task structure
- use GitHub Issues when appropriate
- do not use custom GitHub labels unless they already exist
- commit and push after meaningful completed work when explicitly confirmed for outward-facing actions
- do not commit secrets, API keys, private data, generated runtime files, or customer building data
- avoid over-engineering or rewriting from zero when Hermes already has a good pattern
- use Hermes to accelerate the foundation while keeping BuildingAgent’s own product identity and boundaries

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Local Hermes-Like Foundation Skeleton — Build the smallest authenticated local platform where backend, Web UI, CLI, login, project selection, chat workspace, runtime/memory/tool/skill/provider skeletons, placeholder gateways, placeholder building tools and skills, smoke checks, and README all work coherently.
- [ ] M002: Building-Domain Data Source Stubs — Add project-scoped external data source configuration surfaces and safe placeholder contracts for BIM, Brick/RDF/SPARQL, time-series, and mapping sources without storing real building data in the repository.
- [ ] M003: Building Operations Workflow Prototypes — Introduce first non-placeholder building-operations workflows, likely around equipment exploration, semantic query scaffolding, trend inspection, and HHW reset analysis once the foundation boundaries are proven.

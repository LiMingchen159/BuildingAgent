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

M001 is in progress. S01 is complete: the repository now contains a local npm workspace with a Fastify API and React/Vite Web UI that prove seeded local authentication, project membership, selected-project state, permission checks, and project-scoped chat. A seeded user can log into the Web UI, list authorized projects, select a project, and send chat messages scoped to that project; backend tests verify unauthorized/forbidden access and project isolation failure modes.

Remaining M001 work is still substantial: S02 must add authenticated runtime/provider/tool/skill/gateway/building-domain placeholder registry surfaces, and S03 must add the authenticated CLI plus full local smoke checks and final README verification.

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

S01 established these concrete foundation patterns:

- npm workspaces at the root compose `apps/api` and `apps/web`.
- The API is Fastify/TypeScript with an in-memory seeded development store.
- Protected API handlers authenticate bearer tokens and enforce project membership, selected-project state, and per-project permissions before returning project data or accepting chat messages.
- API failures use canonical machine-readable errors with request ids: missing/invalid auth, forbidden project, missing selected project, permission denial, invalid chat payload, and internal error.
- The Web UI is React/Vite, not Streamlit, and calls the real local API through a typed client for login, session rehydration, project listing/selection, and chat.
- Browser session state is intentionally minimal for local development: seeded bearer token plus minimal user/project identifiers, with guarded rehydration through `/api/session` and `/api/projects`.
- Workspace-aware test forwarding is handled by `scripts/run-tests.cjs` so root verification commands can target API or Web test files.

The S01 auth model is local-development only. Seeded credentials/tokens are public fixtures, the API defaults to loopback (`127.0.0.1`), and this must not be treated as production authentication. Before any shared demo or non-loopback run, add a guard that refuses seeded auth outside an explicit local/dev mode and restrict CORS to known local Web origins.

The first working version should establish a practical Hermes-like platform skeleton before later milestones specialize it for BIM, Brick/RDF/SPARQL, time-series, HHW, and building-operations workflows. M001 should prioritize a working vertical slice over broad placeholder coverage: preserve the authenticated backend, real-provider-first chat path with mock fallback, login → project selection → chat workspace, CLI authenticated chat/project commands, project isolation and backend-side permission checks, Hermes-inspired runtime/tool/skill/model-provider skeleton, smoke checks, and README before expanding placeholder breadth.

Chat/model behavior in M001 should prefer a real configured LLM provider/API from day one. Chat should flow through the real runtime → model/provider path when credentials are available, with mock responses only as fallback for smoke tests, CI, or local development without credentials. Provider credentials must be configured through environment variables or ignored local config files and must never be committed.

The Web UI should use a modern React/Next.js-style product interface, not Streamlit. The first user flow is login → project selection → chat workspace. The UI should also include coherent navigable placeholder pages for project dashboard, model/provider settings, skills manager, tools manager, data source settings, user and permission settings, and audit logs.

The CLI should require authentication and provide a minimal working skeleton for login, project list, project use, chat, model list, skill list, and tool list.

Authentication in v1 should be pragmatic local auth with seeded username/password login returning bearer/session tokens for Web UI and CLI. The CLI should support login, store/use the returned local token, and require authentication for all commands that access projects, chat, tools, skills, or models. Roles, users, and project memberships can be local seed data. It must include clear backend-side auth checks and project-scoped permissions, but it does not need SSO, invite flow, password reset, enterprise identity, API-key-style auth as the primary path, or production-grade deployment.

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

Do not add real building data to the repository. Real BIM, Brick, time-series, and mapping data should later be configured as project-scoped external data sources. Small fake/sample Brick-like and time-series data is acceptable in M001 only when clearly marked as synthetic/demo data and used to test agent workflows, tool/skill placeholders, permissions, and project isolation. Real BIM/IFC, Brick/RDF/SPARQL, time-series analytics, visualization, and HHW logic remain out of scope for M001.

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

- [ ] M001: Local Hermes-Like Foundation Skeleton — Build the smallest authenticated local platform where backend, Web UI, CLI, login, project selection, chat workspace, runtime/memory/tool/skill/provider skeletons, placeholder gateways, placeholder building tools and skills, smoke checks, and README all work coherently. S01 is complete; S02 and S03 remain.
- [ ] M002: Building-Domain Data Source Stubs — Add project-scoped external data source configuration surfaces and safe placeholder contracts for BIM, Brick/RDF/SPARQL, time-series, and mapping sources without storing real building data in the repository.
- [ ] M003: Building Operations Workflow Prototypes — Introduce first non-placeholder building-operations workflows, likely around equipment exploration, semantic query scaffolding, trend inspection, and HHW reset analysis once the foundation boundaries are proven.

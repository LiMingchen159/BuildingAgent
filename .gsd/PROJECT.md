# BuildingAgent

## What This Is

BuildingAgent is a building-domain autonomous agent platform inspired by NousResearch Hermes Agent. Hermes is the general autonomous agent platform reference; BuildingAgent is the building-operations assistant platform built on a Hermes-inspired general agent foundation.

BuildingAgent should eventually support building data, BIM, semantic models, time-series data, and building operations workflows. The first version focuses on a local working platform foundation skeleton, not building-domain analytics.

## Core Value

The one thing that must work even if everything else is cut is a clean, authenticated, project-isolated Hermes-like platform foundation where the login → project selection → chat workspace flow works and future runtime, memory, tools, skills, model providers, permissions, and building-domain capabilities have clear boundaries.

## Project Shape

- **Complexity:** complex
- **Why:** BuildingAgent is a multi-entry platform with Web UI, CLI, backend API, auth, RBAC, project isolation, runtime/tool/skill/memory/provider skeletons, external-channel placeholders, provider-backed chat fallback behavior, and a Hermes-derived architecture baseline.

## Current State

M001 is complete. The repository now contains a verified local Hermes-like foundation skeleton across API, Web, CLI, provider-backed chat fallback, placeholder registry/management surfaces, smoke checks, README guidance, and reconciled requirement coverage.

S01 delivered the local authenticated foundation: an npm workspace with a Fastify API and React/Vite Web UI that prove seeded local authentication, project membership, selected-project state, permission checks, and project-scoped chat. A seeded user can log into the Web UI, list authorized projects, select a project, and send chat messages scoped to that project; backend tests verify unauthorized/forbidden access and project isolation failure modes.

S02 extended that foundation with authenticated placeholder registry and management surfaces. The API exposes read-only synthetic listings for runtime providers, tools, skills, gateway placeholders, and building-domain capabilities. Platform registry inspection requires bearer auth; project management inspection additionally requires project membership, matching selected-project state, and `chat:read`. The Web workspace preserves S01 chat while adding tabs for Platform Registry, Gateways, and Building Domain, with placeholder-only labels, request-id diagnostics, empty states, and strict malformed-payload handling.

S03 added the authenticated CLI shell and local smoke path. The `@building-agent/cli` workspace can log in against the seeded API, persist a redaction-safe local config in an isolated CLI home, reuse saved auth and selected-project state across fresh invocations, inspect session/projects/chat plus the S02 registry and management placeholders, and preserve backend error codes/request ids on denial paths. The root `npm run smoke` command builds the workspaces, starts or probes API/Web services, runs the built CLI through login → project selection → registry/management/chat, emits agent-readable stage markers and child process exit codes, and cleans up temporary CLI state without printing bearer tokens.

S04 remediated chat provider behavior. Authenticated project-scoped chat has an explicit provider port, an OpenAI-compatible real-provider adapter selected when `BUILDING_AGENT_LLM_*` configuration is present, and deterministic mock fallback for no-secret local/CI smoke runs or explicitly allowed fallback conditions. API chat responses store and return assistant messages with bounded history and redaction-safe provider diagnostics (`requestId`, provider id/mode/model, `fallbackUsed`, reason/status). Web chat renders assistant replies and provider/fallback notices; CLI chat JSON exposes assistant/provider metadata without secrets; smoke asserts deterministic default fallback. README documents provider configuration, fallback policy, and verification commands.

S05 reconciled M001 requirement coverage. R001 and R005-R007 are validated at the correct local-skeleton proof level: Web, CLI, registry/management, provider-backed chat, and smoke paths require authentication; runtime/tool/skill coverage is explicitly skeleton/contract coverage rather than full autonomous runtime, real tool dispatch, or real skill invocation. Gateway, building-domain, enterprise identity, production deployment, real integration, Streamlit, anonymous access, customer-data, blind Hermes vendoring, and v1 analytics boundaries remain placeholder/deferred/out of scope as documented in the requirements contract.

Final M001 validation passed. The closure record is `.gsd/milestones/M001/M001-SUMMARY.md`, with validation evidence in `.gsd/milestones/M001/M001-VALIDATION.md` and structured learnings in `.gsd/milestones/M001/M001-LEARNINGS.md`.

Hermes Agent is available locally as a read-only architectural and engineering reference at `/mnt/d/Git_project/references/hermes-agent`. Do not modify that repository. Do not blindly vendor the full Hermes codebase. Selected Hermes components may be reused, copied, and adapted when doing so materially speeds up development and preserves BuildingAgent’s own project structure, naming, permission model, and building-domain roadmap. Preserve license notices and attribution for any Hermes-derived code.

## Architecture / Key Patterns

BuildingAgent should use Hermes Agent as the engineering baseline/reference for the general agent platform layer, including agent reasoning/runtime architecture, planning and execution loop patterns, tool registry and dispatcher patterns, skill registry and execution patterns, memory architecture, model/provider abstraction, runtime/session structure, CLI interaction patterns, Web UI structure where useful, permission/approval/audit/safety patterns, and tests/smoke-check patterns.

M001 established these concrete foundation patterns:

- npm workspaces at the root compose `apps/api`, `apps/web`, and `apps/cli`.
- The API is Fastify/TypeScript with an in-memory seeded development store.
- Protected API handlers authenticate bearer tokens and enforce project membership, selected-project state, and per-project permissions before returning project data, registry/management project data, or accepting provider-backed chat messages.
- API failures use canonical machine-readable errors with request ids: missing/invalid auth, forbidden project, missing selected project, permission denial, invalid payloads, malformed API responses, provider errors, and internal errors.
- The Web UI is React/Vite, not Streamlit, and calls the real local API through a typed client for login, session rehydration, project listing/selection, chat, registry, gateway, and building-domain placeholder tabs.
- Browser session state is intentionally minimal for local development: seeded bearer token plus minimal user/project identifiers, with guarded rehydration through `/api/session` and `/api/projects`.
- Workspace-aware test forwarding is handled by `scripts/run-tests.cjs` so root verification commands can target API, Web, or CLI test files.
- Global platform registry listings are authenticated but not project-selected: `GET /api/registry` returns bounded synthetic runtime provider, tool, skill, gateway, and building-capability fixtures.
- Project management listings are selected-project scoped: `GET /api/projects/:projectId/management` requires bearer auth, project membership, matching selected project, and `chat:read` before returning synthetic gateways, capabilities, and tools.
- Successful registry/management responses include `limit`, `placeholderOnly`, and `requestId`; failures reuse the canonical error envelope.
- Web and CLI clients strictly parse placeholder payloads before rendering and fail closed with `api_malformed` when placeholder metadata or item shapes are unexpected.
- `apps/cli` is a strict TypeScript workspace that shares root test/typecheck routing with API and Web.
- CLI config persistence is isolated through `BUILDING_AGENT_CLI_HOME` or explicit home-dir options, stores `.building-agent/config.json`, and redacts bearer tokens in diagnostics and rendered session output.
- CLI API failures preserve canonical backend error codes and request ids; `building-agent session` persists last command/error/request-id diagnostics so auth, project-selection, chat-validation, and startup failures can be localized later.
- `npm run smoke` is the authoritative local coherence check: it builds workspaces, starts/probes API and Web, invokes the built CLI against the live API, prints `[smoke]` stage markers plus request ids and child process exit codes, asserts default provider fallback metadata, and cleans up child processes and temporary CLI home.
- Backend chat uses a provider seam (`apps/api/src/providers.ts`) and must run auth, selected-project, project-membership, and chat-permission guards before provider invocation.
- Provider selection is real-provider-first: OpenAI-compatible mode is selected only when non-secret provider configuration is present; mock mode remains deterministic for no-secret local development, CI, and smoke.
- Provider diagnostics are intentionally redaction-safe across API, Web, CLI, smoke, and docs: request id, provider id/mode/model, fallback flag, reason/status are allowed; API keys, bearer tokens, seeded passwords, raw env, stack traces, and raw upstream bodies are not.

Known hardening follow-ups before real integrations: add Web validation that project-management payload `projectId` exactly matches the requested project id, add API regression tests proving non-GET registry/management methods do not expose placeholder data or execution paths, consider making management-surface fetch failures non-blocking after chat/project selection succeeds, fix CLI package/bin emission so the declared package bin and emitted build path align for future packaging, and add live-provider/manual acceptance evidence before claiming production LLM integration readiness.

The M001 auth model is local-development only. Seeded credentials/tokens are public fixtures, the API defaults to loopback (`127.0.0.1`), and this must not be treated as production authentication. Before any shared demo or non-loopback run, add a guard that refuses seeded auth outside an explicit local/dev mode, restrict CORS to known local Web origins, and replace localStorage bearer-token persistence with a safer non-local browser session approach.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Local Hermes-Like Foundation Skeleton — Completed. Built and validated the smallest authenticated local platform where backend, Web UI, CLI, login, project selection, chat workspace, runtime/tool/skill/provider skeletons, placeholder gateways, placeholder building tools and skills, smoke checks, README, validation matrix, and learnings all work coherently.
- [ ] M002: Building-Domain Data Source Stubs — Add project-scoped external data source configuration surfaces and safe placeholder contracts for BIM, Brick/RDF/SPARQL, time-series, and mapping sources without storing real building data in the repository.
- [ ] M003: Building Operations Workflow Prototypes — Introduce first non-placeholder building-operations workflows, likely around equipment exploration, semantic query scaffolding, trend inspection, and HHW reset analysis once the foundation boundaries are proven.

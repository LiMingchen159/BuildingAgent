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

M001 implementation is nearly complete and ready for final requirement coverage reconciliation/validation. S01, S02, S03, and S04 are complete; S05 remains to reconcile and document requirement coverage before milestone closure.

S01 delivered the local authenticated foundation: the repository contains an npm workspace with a Fastify API and React/Vite Web UI that prove seeded local authentication, project membership, selected-project state, permission checks, and project-scoped chat. A seeded user can log into the Web UI, list authorized projects, select a project, and send chat messages scoped to that project; backend tests verify unauthorized/forbidden access and project isolation failure modes.

S02 extended that foundation with authenticated placeholder registry and management surfaces. The API now exposes read-only synthetic listings for runtime providers, tools, skills, gateway placeholders, and building-domain capabilities. Platform registry inspection requires bearer auth; project management inspection additionally requires project membership, matching selected-project state, and `chat:read`. The Web workspace now preserves S01 chat while adding tabs for Platform Registry, Gateways, and Building Domain, with placeholder-only labels, request-id diagnostics, empty states, and strict malformed-payload handling.

S03 added the authenticated CLI shell and local smoke path. The `@building-agent/cli` workspace can log in against the seeded API, persist a redaction-safe local config in an isolated CLI home, reuse saved auth and selected-project state across fresh invocations, inspect session/projects/chat plus the S02 registry and management placeholders, and preserve backend error codes/request ids on denial paths. The root `npm run smoke` command now builds the workspaces, starts or probes API/Web services, runs the built CLI through login → project selection → registry/management/chat, emits agent-readable stage markers and child process exit codes, and cleans up temporary CLI state without printing bearer tokens.

S04 remediated chat provider behavior. Authenticated project-scoped chat now has an explicit provider port, an OpenAI-compatible real-provider adapter selected when `BUILDING_AGENT_LLM_*` configuration is present, and deterministic mock fallback for no-secret local/CI smoke runs or explicitly allowed fallback conditions. API chat responses store and return assistant messages with bounded history and redaction-safe provider diagnostics (`requestId`, provider id/mode/model, `fallbackUsed`, reason/status). Web chat renders assistant replies and provider/fallback notices; CLI chat JSON exposes assistant/provider metadata without secrets; smoke asserts deterministic default fallback. README documents provider configuration, fallback policy, and verification commands.

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

S02 established these additional placeholder-surface patterns:

- Global platform registry listings are authenticated but not project-selected: `GET /api/registry` returns bounded synthetic runtime provider, tool, skill, gateway, and building-capability fixtures.
- Project management listings are selected-project scoped: `GET /api/projects/:projectId/management` requires bearer auth, project membership, matching selected project, and `chat:read` before returning synthetic gateways, capabilities, and tools.
- Successful registry/management responses include `limit`, `placeholderOnly`, and `requestId`; failures reuse the S01 canonical error envelope.
- Web management tabs consume these contracts through `apps/web/src/api.ts` and fail closed with `api_malformed` when placeholder metadata or item shapes are unexpected.
- All S02 data is synthetic/demo metadata. No live provider keys, gateway connection strings, bearer tokens, private customer building data, or execution/mutation integrations were introduced.

S03 established these CLI and smoke patterns:

- `apps/cli` is a strict TypeScript workspace that shares root test/typecheck routing with API and Web.
- CLI config persistence is isolated through `BUILDING_AGENT_CLI_HOME` or explicit home-dir options, stores `.building-agent/config.json`, and redacts bearer tokens in diagnostics and rendered session output.
- CLI API failures preserve canonical backend error codes and request ids; `building-agent session` persists last command/error/request-id diagnostics so auth, project-selection, chat-validation, and startup failures can be localized later.
- CLI registry and management commands strictly parse placeholder payloads before rendering JSON and fail closed with `api_malformed` on malformed responses.
- `npm run smoke` is the authoritative local coherence check: it builds workspaces, starts/probes API and Web, invokes the built CLI against the live API, prints `[smoke]` stage markers plus request ids and child process exit codes, and cleans up child processes and temporary CLI home.

S04 established these provider-backed chat patterns:

- Backend chat uses a provider seam (`apps/api/src/providers.ts`) and must run S01 auth, selected-project, project-membership, and chat-permission guards before provider invocation.
- Provider selection is real-provider-first: OpenAI-compatible mode is selected only when non-secret provider configuration is present; mock mode remains deterministic for no-secret local development, CI, and smoke.
- Provider failures are explicit: fallback metadata identifies whether fallback was used and why; when fallback is not allowed, the API returns canonical request-id-bearing provider errors instead of silently masking outages.
- Chat responses normalize untrusted provider output before storage/rendering and return both user and assistant messages in bounded project history.
- Provider diagnostics are intentionally redaction-safe across API, Web, CLI, smoke, and docs: request id, provider id/mode/model, fallback flag, reason/status are allowed; API keys, bearer tokens, seeded passwords, raw env, stack traces, and raw upstream bodies are not.
- Web and CLI consumers parse assistant/provider metadata as part of the chat contract instead of assuming user-only message history.

Known hardening follow-ups before real integrations: add Web validation that project-management payload `projectId` exactly matches the requested project id, add API regression tests proving non-GET registry/management methods do not expose placeholder data or execution paths, consider making management-surface fetch failures non-blocking after chat/project selection succeeds, fix CLI package/bin emission so the declared package bin and emitted build path align for future packaging, and add live-provider/manual acceptance evidence before claiming production LLM integration readiness.

The S01/S02/S03/S04 auth model is local-development only. Seeded credentials/tokens are public fixtures, the API defaults to loopback (`127.0.0.1`), and this must not be treated as production authentication. Before any shared demo or non-loopback run, add a guard that refuses seeded auth outside an explicit local/dev mode and restrict CORS to known local Web origins. S02 security review also noted that localStorage bearer-token persistence is acceptable only for this local skeleton; use HttpOnly/Secure/SameSite cookies or in-memory tokens before any non-local browser deployment.

The first working version should establish a practical Hermes-like platform skeleton before later milestones specialize it for BIM, Brick/RDF/SPARQL, time-series, HHW, and building-operations workflows. M001 prioritizes a working vertical slice over broad placeholder coverage: authenticated backend, login → project selection → chat workspace, CLI authenticated chat/project/registry/management commands, project isolation and backend-side permission checks, Hermes-inspired runtime/tool/skill/model-provider placeholders, real-provider-first chat with mock fallback, smoke checks, and README are now present.

Chat/model behavior in M001 now prefers a configured OpenAI-compatible provider when `BUILDING_AGENT_LLM_*` environment variables are provided and falls back to deterministic mock behavior for local no-secret runs when fallback is allowed. Provider credentials must be configured through environment variables or ignored local config files and must never be committed.

The Web UI should use a modern React/Next.js-style product interface, not Streamlit. The first user flow is login → project selection → chat workspace. The UI now includes coherent navigable placeholder tabs for platform registry, gateway placeholders, and building-domain capabilities; later slices/milestones can expand those into project dashboard, model/provider settings, skills manager, tools manager, data source settings, user and permission settings, and audit logs.

The CLI requires authentication and provides a minimal working skeleton for login, session inspection, project list/use, chat send/list, registry inspection, and project management inspection. It reuses the S01/S02/S04 API contracts rather than introducing separate CLI-only auth, registry, management, or provider paths.

Authentication in v1 is pragmatic local auth with seeded username/password login returning bearer/session tokens for Web UI and CLI. The CLI supports login, stores/uses the returned local token, and requires authentication for commands that access projects, chat, tools, skills, models, registry, management placeholders, or provider-backed chat. Roles, users, and project memberships are local seed data. It includes clear backend-side auth checks and project-scoped permissions, but it does not include SSO, invite flow, password reset, enterprise identity, API-key-style auth as the primary path, or production-grade deployment.

Project data and project memory must be isolated by project. Tool calls must go through backend-side permission checks. Code/platform permissions and project/data permissions should remain conceptually separate.

Email and WhatsApp gateways exist only as authenticated placeholders. They must not allow anonymous interaction.

Building-domain tools are placeholders in v1:

- BIM/IFC tools
- Brick/RDF/SPARQL tools
- time-series tools
- cross-source linking tools
- visualization tools

Building-domain skills are placeholders in v1:

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

- [ ] M001: Local Hermes-Like Foundation Skeleton — Build the smallest authenticated local platform where backend, Web UI, CLI, login, project selection, chat workspace, runtime/memory/tool/skill/provider skeletons, placeholder gateways, placeholder building tools and skills, smoke checks, and README all work coherently. Implementation is complete across S01/S02/S03/S04; S05 remains for requirement coverage reconciliation before final milestone validation.
- [ ] M002: Building-Domain Data Source Stubs — Add project-scoped external data source configuration surfaces and safe placeholder contracts for BIM, Brick/RDF/SPARQL, time-series, and mapping sources without storing real building data in the repository.
- [ ] M003: Building Operations Workflow Prototypes — Introduce first non-placeholder building-operations workflows, likely around equipment exploration, semantic query scaffolding, trend inspection, and HHW reset analysis once the foundation boundaries are proven.

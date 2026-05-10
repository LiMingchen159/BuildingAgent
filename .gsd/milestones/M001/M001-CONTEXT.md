# M001: Local Hermes-Like Foundation Skeleton

**Gathered:** 2026-05-10
**Status:** Ready for planning

## Project Description

BuildingAgent is a building-domain autonomous agent platform inspired by NousResearch Hermes Agent. M001 establishes the smallest practical local foundation: a Hermes-inspired authenticated backend, Web UI, and CLI that prove the login → project selection → chat workspace flow, with project isolation, backend-side permission checks, runtime/memory/tool/skill/model-provider skeletons, placeholder gateways, placeholder building-domain tools and skills, smoke checks, and a concise README.

## Why This Milestone

The project is effectively greenfield. M001 exists to prove the platform boundaries before any real building-domain analytics, data-source integrations, or workflow prototypes are introduced. The foundation must be usable locally, authenticated, project-scoped, and extensible enough to carry later BIM, Brick/RDF/SPARQL, time-series, HHW, and other building-operations work.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Log in with seeded local credentials, select a project, and enter a project-scoped chat workspace in the Web UI.
- Log in from the CLI, store and reuse a local token, and run authenticated project/chat/model/skill/tool commands.

### Entry point / environment

- Entry point: local Web UI, local CLI, and local backend API
- Environment: local dev
- Live dependencies involved: local backend API, model/provider API when configured, otherwise mock fallback for smoke tests and CI

## Completion Class

- Contract complete means: auth, project selection, chat/runtime skeleton, registry skeletons, and smoke checks can be proven locally with tests/fixtures/artifacts.
- Integration complete means: Web UI, CLI, backend auth, project isolation, backend permission checks, and real-provider-first chat path work together across real subsystems when credentials are available.
- Operational complete means: the local foundation starts, runs, and is explainable through the README; no production-grade deployment is required.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A seeded user can authenticate in the Web UI, choose a project, and reach a working chat workspace.
- A seeded user can authenticate in the CLI, reuse the stored token, and run authenticated project/chat/model/skill/tool commands.
- The chat path prefers a real configured provider when credentials exist, while mock fallback remains available for CI, smoke tests, and no-credential local runs.

## Architectural Decisions

### Hermes as baseline/reference

**Decision:** Use Hermes Agent as the engineering baseline/reference for the general agent platform layer, selectively reusing and adapting MIT-licensed components and patterns when useful while preserving BuildingAgent-specific structure and attribution.

**Rationale:** The user wants BuildingAgent to avoid unnecessary from-zero rebuilding and to accelerate the foundation using Hermes patterns, without modifying the reference repo or blindly vendoring the whole codebase.

**Alternatives Considered:**
- Clean-room implementation — too slow and unnecessary given the reference baseline.
- Full vendoring of Hermes — would weaken BuildingAgent’s own structure and boundaries.

### M001 scope and priority order

**Decision:** Keep M001 focused on a Hermes-inspired general agent foundation plus local authenticated Web UI/CLI/backend skeleton, with building-domain capabilities represented as placeholders only, while preserving the working vertical slice first if scope pressure appears.

**Rationale:** The user wants the first version to prove platform boundaries and local workflow before adding real BIM, Brick, time-series, HHW, or building operations analytics. The highest-value runnable path is authenticated backend, real-provider-first chat, Web/CLI entry flow, project isolation, backend checks, skeleton registries, smoke checks, and README.

**Alternatives Considered:**
- Broad placeholder coverage first — would dilute the core runnable slice.
- Real building analytics in M001 — explicitly out of scope.

### Local auth model

**Decision:** Use seeded username/password login returning bearer/session tokens for Web UI and CLI; the CLI stores and reuses the returned local token and all project/chat/tool/skill/model commands require authentication.

**Rationale:** Seeded local users, roles, and project memberships are sufficient to prove authenticated entry points, RBAC, and project isolation in the local foundation without introducing enterprise account lifecycle complexity.

**Alternatives Considered:**
- API-key-first auth — not required as the primary M001 path.
- SSO / invite / reset flows — deferred.

### Real-provider-first chat path

**Decision:** Prefer a real configured LLM provider/API from day one for M001 chat, with mock responses only as fallback for smoke tests, CI, or local development without credentials.

**Rationale:** BuildingAgent’s value depends heavily on model performance and agent behavior, so the foundation must prove the real runtime → model/provider path early while retaining a safe fallback for environments without credentials.

**Alternatives Considered:**
- Mock-only chat — would undercut the core platform value.
- Hard-coding one provider — would make the abstraction too rigid.

### Synthetic demo data policy

**Decision:** Allow clearly marked synthetic/demo Brick-like and time-series sample data for local testing and demo workflows, while real building data and real analytics remain out of scope for M001.

**Rationale:** Small fake data helps test agent workflows, placeholders, permissions, and project isolation without committing private/customer building data or prematurely implementing real BIM, Brick, time-series, visualization, or HHW logic.

**Alternatives Considered:**
- No sample data at all — would make local workflow verification harder.
- Real building data — explicitly disallowed.

## Error Handling Strategy

The local foundation should fail explicitly and early on authentication, project scope, provider configuration, and permission errors. UI and CLI should return clear authenticated/unauthenticated states, project-access denial messages, and provider fallback notices. Real-provider failures should fall back to mock behavior only where explicitly allowed by the smoke-test/local-dev path, not silently in the primary user path. No secret material should appear in logs, errors, or generated artifacts.

## Risks and Unknowns

- Hermes reuse may need adaptation work — useful patterns should be copied only where they fit BuildingAgent’s own boundaries and naming.
- Real-provider configuration may vary by environment — the abstraction must stay extensible and not lock the project into one vendor.
- Gateway and placeholder breadth can expand scope — keep them minimal so the working vertical slice is preserved.

## Existing Codebase / Prior Art

- `README.md` — only present top-level project file; the rest of the repo is effectively greenfield.
- `.gsd/DECISIONS.md` / `.gsd/REQUIREMENTS.md` — capture the current architecture, scope, auth, provider, and data-policy decisions.
- Hermes Agent reference at `/mnt/d/Git_project/references/hermes-agent` — engineering baseline for runtime, tool/skill registry, memory, provider, CLI, and safety patterns.

## Relevant Requirements

- R001 — all user-facing entry points require authentication.
- R002 — signed-in user can select a project and enter a project-scoped chat workspace.
- R003 — backend enforces authentication, RBAC, and project-scoped permission checks.
- R004 — project data and project memory are isolated by project boundary.
- R005 — Hermes-inspired runtime skeleton for sessions, planning/execution, and agent interaction.
- R006 — permission-checked tool registry and dispatcher skeleton.
- R007 — skill registry skeleton for listing and invoking placeholder skills.
- R008 — extensible model/provider configuration skeleton with real-provider-first chat behavior.
- R009 — modern React/Next.js-style Web UI shell for login, project selection, chat, and placeholder pages.
- R010 — authenticated CLI commands for login, project list/use, chat, model list, skill list, and tool list.
- R011 — authenticated placeholder Email and WhatsApp gateways only.
- R012 — placeholder building-domain tools and skills, kept minimal if needed to preserve the vertical slice.
- R013 — local backend, Web UI, CLI, and smoke checks prove the foundation works.
- R014 — README explains how to run the backend, Web UI, CLI, auth flow, provider config, and smoke checks.

## Scope

### In Scope

- Authenticated local backend, Web UI, and CLI skeletons.
- Login → project selection → chat workspace flow.
- Real-provider-first chat path with mock fallback.
- Hermes-inspired runtime, memory, tool, skill, and provider skeletons.
- Backend-side auth and project-scoped permission checks.
- Placeholder gateways and placeholder building-domain tools/skills, kept minimal if needed.
- Smoke checks and concise README.
- Synthetic/demo sample data only when clearly marked and only for local testing.

### Out of Scope / Non-Goals

- Real BIM/IFC, Brick/RDF/SPARQL, time-series analytics, visualization, or HHW logic.
- Real customer or building operational data in the repository.
- Enterprise identity, SSO, invite flow, password reset, or production deployment.
- Broad placeholder coverage if it displaces the working vertical slice.

## Technical Constraints

- Do not commit secrets, API keys, tokens, private configs, or private building data.
- Keep the provider abstraction extensible and avoid hard-coding a single vendor too deeply.
- Preserve BuildingAgent’s own structure, naming, and permission model even when reusing Hermes-derived code.
- Prefer a working vertical slice over wide placeholder breadth.

## Integration Points

- Hermes reference repo — source of patterns and reusable MIT-licensed components.
- Local model/provider API — used when credentials are configured; otherwise mock fallback is allowed for smoke tests and CI.
- Local backend API — auth, project isolation, permissions, runtime, registry, and chat orchestration.
- Web UI and CLI — local authenticated entry points into the same backend contract.

## Testing Requirements

- Unit tests for auth/session handling, project scoping, permission checks, and provider selection/fallback.
- Integration tests or smoke checks for login, project selection, chat entry, CLI token reuse, and authenticated registry access.
- A local smoke path that proves the real-provider branch when configured and the mock fallback when credentials are absent.
- Verification that no secrets or private data are required for the fallback path.

## Acceptance Criteria

- A seeded user can authenticate in the Web UI, choose a project, and reach a chat workspace.
- A seeded user can authenticate in the CLI, reuse the stored token, and access authenticated project/chat/model/skill/tool commands.
- Project isolation and backend-side permission checks are enforced before protected operations run.
- Chat prefers the real configured provider when credentials exist, and mock fallback remains available for smoke tests and local no-credential runs.
- README concisely explains how to run the local backend, Web UI, CLI, seeded auth flow, provider config, and smoke checks.
- Placeholder gateways and demo data remain minimal and never become a substitute for the working vertical slice.

## Open Questions

- None at this stage; the remaining work is implementation and planning.

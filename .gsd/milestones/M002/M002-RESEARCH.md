# M002 — Research

**Date:** 2026-05-09

## Summary

BuildingAgent is currently a planning scaffold, not an implementation codebase. The repository contains M001 documentation and placeholder directories (`apps/web`, `apps/api`, `buildingagent/*`, `tests`) but no `pyproject.toml`, `package.json`, backend application, CLI entry point, Next.js app, or executable tests. M002 therefore needs to bootstrap both implementation stacks and establish contracts before adding user-visible skeleton screens/commands.

The most important implementation risk is not UI styling or model execution; it is preserving the authenticated request-context boundary from the start. Every entry point should resolve a common `RequestContext` containing `user_id`, `workspace_id`, `project_id`, role, and scopes, then pass that context into runtime, memory, tool, skill, and model configuration skeletons. The M002 implementation can use a simple local/dev auth provider and local in-memory or file-backed stores, but it should shape interfaces so M003 can add real RBAC enforcement, audit logging, and project-scoped memory behavior without rewriting Web/CLI entry points.

Hermes is a useful architecture reference but should not be copied wholesale. The relevant Hermes concepts are spread across `environments/agent_loop.py`, `agent/prompt_builder.py`, `agent/memory_manager.py`, `agent/models_dev.py`, `agent/skill_utils.py`, `agent/skill_preprocessing.py`, `agent/tool_guardrails.py`, `gateway/platforms/api_server.py`, and `acp_adapter/session.py`. BuildingAgent should reimplement a smaller, typed skeleton inspired by those boundaries, while avoiding heavy Hermes UI/TUI complexity and avoiding building-domain dependencies in M002.

## Recommendation

Build M002 as a thin, testable authenticated foundation with explicit contracts and stubbed behavior:

1. Add repository manifests and tooling first: Python package metadata, backend test/lint tooling, Web package metadata, and minimal scripts.
2. Implement Python domain contracts before entry points: auth/project models, `RequestContext`, provider/model config objects, runtime/session interfaces, memory interfaces, tool registry/dispatcher interfaces, skill registry interfaces, and a FastAPI app that exposes these as authenticated skeleton endpoints.
3. Add a Typer CLI that authenticates against the backend contract or a compatible local auth adapter, stores only non-secret local session/project state, and proves the same context resolution path as the Web UI.
4. Add a Next.js App Router Web skeleton with login/project selection/chat/config pages that call backend skeleton endpoints. Keep UI simple but semantically complete: login, project selector, chat workspace, model/provider settings, skill/tool pages, permission/user page, and audit-log placeholder.
5. Keep runtime execution deliberately non-functional in M002: chat/tool/model calls may return structured stub responses, but every response should include observable context IDs and registry metadata so M003 can test authorization and audit behavior.

Do not introduce a production external auth provider in M002 unless the user explicitly chooses one. A local token/dev-login skeleton is sufficient for proving request scoping, but the auth interfaces should be provider-shaped so Clerk/Auth0/Auth.js/enterprise SSO can be evaluated later. FastAPI security dependencies and Typer command groups are good fits for the Python side; Next.js App Router is the right Web shell because M001 explicitly rejected Streamlit and named authenticated Web UI as the first product interface.

## Implementation Landscape

### Key Files

- `pyproject.toml` — missing. Should define the Python package, dependencies, console script, test config, and formatting/lint defaults. Likely dependencies: `fastapi`, `uvicorn`, `pydantic`, `typer`, `rich`, `httpx`, `pytest`, `pytest-asyncio`.
- `package.json` — missing. Should define Web workspace scripts or root orchestration scripts. Keep dependency decisions narrow for M002.
- `apps/api/` — currently only `.gitkeep`. Recommended location for FastAPI app wiring (`main.py`, routers, dependency providers) if the API is kept as an app wrapper around the `buildingagent` package.
- `apps/web/` — currently only `.gitkeep`. Should become a Next.js App Router app, not Streamlit and not Hermes' Vite UI clone.
- `buildingagent/auth/` — currently only `.gitkeep`. Should contain `models.py`, `providers.py`, `dependencies.py`, and token/session helpers for resolving users and scopes.
- `buildingagent/projects/` — currently only `.gitkeep`. Should contain workspace/project/membership models and a repository abstraction with seeded dev data.
- `buildingagent/core/` — currently only `.gitkeep`. Should contain `RequestContext`, runtime/session skeletons, event/callback contracts, and stub agent-loop response types.
- `buildingagent/config/` — currently only `.gitkeep`. Should contain model/provider configuration schemas and a local settings store abstraction.
- `buildingagent/memory/` — currently only `.gitkeep`. Should contain memory item/query interfaces scoped by `project_id`, with stubbed store implementation.
- `buildingagent/tools/` — currently contains only future building-domain placeholder modules. Add a general tool registry/dispatcher skeleton without activating building-domain tools.
- `buildingagent/skills/` — currently only `.gitkeep`. Should contain skill metadata/registry/loading interfaces. The existing markdown skills under `skills/building/` can be discovered as placeholders but not executed.
- `buildingagent/cli/` — currently only `.gitkeep`. Should become the Typer CLI package with `login`, `logout`, `project list`, `project use`, `chat`, `model`, `provider`, `skill`, `tool`, and `admin/debug` command groups.
- `tests/` — currently only `.gitkeep`. Should add contract tests for context resolution, endpoint auth failures, CLI command discovery, registry metadata, and stub runtime behavior.
- `docs/*_SPEC.md` — M001 specs are present and should be treated as contracts. M002 should update only where implementation reveals necessary refinements.
- `/mnt/d/Git_project/references/hermes-agent/environments/agent_loop.py` — reference for `HermesAgentLoop`, `AgentResult`, and tool-error/result patterns. Use as inspiration, not copied code.
- `/mnt/d/Git_project/references/hermes-agent/agent/prompt_builder.py` — reference for skill/context prompt assembly and context-file loading. M002 should only create placeholders/contracts.
- `/mnt/d/Git_project/references/hermes-agent/agent/memory_manager.py` — reference for memory context injection and sanitization. M002 should define scoped interfaces, not full memory retrieval.
- `/mnt/d/Git_project/references/hermes-agent/agent/models_dev.py` — reference for provider/model metadata and capability lookup. M002 can define local provider/model config schemas.
- `/mnt/d/Git_project/references/hermes-agent/agent/skill_utils.py` and `agent/skill_preprocessing.py` — reference for skill discovery/frontmatter/template handling. M002 should implement minimal skill metadata discovery only.
- `/mnt/d/Git_project/references/hermes-agent/agent/tool_guardrails.py` — reference for guardrail decision objects and tool-call failure classification. M002 should leave policy decisions to M003 but reserve dispatcher hooks.
- `/mnt/d/Git_project/references/hermes-agent/gateway/platforms/api_server.py` — reference for API adapter shape, response store, idempotency, and chat-session derivation. M002 should keep the BuildingAgent API much smaller.
- `/mnt/d/Git_project/references/hermes-agent/acp_adapter/session.py` and `acp_adapter/permissions.py` — reference for session manager and approval-callback shape. Useful for future permission-aware runtime integration.

### Build Order

1. **Bootstrap manifests and test harness.** Nothing executable exists yet. This unblocks every later slice and prevents Web/CLI/backend work from inventing incompatible scripts.
2. **Define shared Python contracts.** Create Pydantic models and repository/provider interfaces for users, workspaces, projects, memberships, request context, model config, runtime sessions, memory items, tools, skills, and audit events. This should be the foundation imported by both API and CLI.
3. **Implement backend authenticated skeleton.** Add FastAPI app, auth dependencies, seeded dev data, and endpoints such as `/health`, `/auth/me`, `/projects`, `/projects/{id}/context`, `/runtime/chat`, `/models`, `/skills`, `/tools`, and `/audit-log`. The endpoints can return stubs but must require authentication where appropriate.
4. **Implement runtime/registry skeletons.** Register example safe tools/skills/model configs and a stub runtime response. Ensure the dispatcher path exists even if it refuses or stubs execution.
5. **Implement CLI skeleton.** Use Typer command groups and a local session/project selection file. Validate command discovery and that CLI commands resolve the same context shape.
6. **Implement Web skeleton.** Add Next.js App Router pages/components that show authenticated session state, project selector, chat stub, and configuration placeholders. Use backend API routes or direct backend calls consistently.
7. **Add end-to-end smoke verification.** Run backend tests, CLI help/login/project/chat smoke tests, Web build/lint, and a local browser smoke path if practical.

### Verification Approach

- `python -m pytest` should cover auth dependency behavior, project context resolution, registry metadata, memory scoping stubs, and runtime stub responses.
- `python -m buildingagent.cli --help` and command-specific help should prove the CLI exposes required command groups.
- CLI smoke tests should prove login/logout, project list/use, model list/set, skill/tool list or enable/disable stubs, and debug/admin stubs are wired.
- FastAPI tests should prove unauthenticated requests fail, authenticated dev-token requests succeed, and responses carry `user_id`, `workspace_id`, `project_id`, role, and scopes where applicable.
- Web verification should include `npm run build` (or equivalent), basic route rendering, and browser assertions for login/project selector/chat/config placeholders if a dev server can be started.
- The milestone has R027: after implementation slices, run `git status`, `git add`, `git commit`, and `git push` as part of completion workflow. Research only does not perform the implementation commit.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Python HTTP auth dependencies | FastAPI `Depends` / `Security` with bearer-token dependencies and scopes | Gives standard request auth flow, OpenAPI security docs, and reusable dependency chains for M003 RBAC. |
| Python CLI command structure | Typer command groups | Matches type-hinted Python models, provides command help/completion, and keeps CLI skeleton small. |
| Web application shell | Next.js App Router | Aligns with M001 Web UI direction, supports server/client components, route handlers, server actions, and production deployment patterns. |
| Production identity provider | Auth.js, Clerk, Auth0, WorkOS, or similar later | M002 can use local/dev auth, but real deployment should not permanently rely on custom password/session security. |
| Hermes-like reference implementation | Local Hermes reference repository | Reuse architectural patterns and possibly small MIT-licensed snippets only when attribution is preserved; avoid vendoring the full repo. |

## Constraints

- The Hermes reference repository at `/mnt/d/Git_project/references/hermes-agent` is read-only and must not be modified.
- BuildingAgent should not vendor the full Hermes repository; copied MIT code requires attribution under `third_party_licenses/`.
- The Web UI must not use Streamlit.
- Building-domain BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, and visualization capabilities are out of scope for functional M002 implementation; keep them as placeholders and do not add heavy dependencies.
- All entry points must resolve `user_id`, `workspace_id`, `project_id`, role, and permission scopes.
- Tool execution must be routed through backend dispatcher boundaries, even if M002 only stubs execution.
- Project memory/data isolation by `project_id` is a table-stakes contract even if real memory retrieval waits until M003+.
- Repository currently has no executable manifests, so early slices must avoid assuming existing Python or Node setup.

## Common Pitfalls

- **Building UI before context contracts** — a nice login page without a shared `RequestContext` would force rewrites in M003. Define contracts first.
- **Letting CLI bypass backend authorization boundaries** — CLI can use local adapters for development, but it should exercise the same context/dispatcher abstractions as the API.
- **Implementing real model/tool execution too early** — M002 only needs skeletons. Real execution without RBAC/audit from M003 would create unsafe patterns.
- **Choosing a production auth vendor prematurely** — use provider-shaped interfaces now; defer vendor lock-in unless explicitly required.
- **Copying Hermes internals wholesale** — Hermes is broad and includes TUI, ACP, gateway, scheduling, plugins, and many model transports. M002 should adapt the concepts, not import complexity.
- **Adding building-domain dependencies** — the building modules are placeholders. Heavy IFC/RDF/time-series libraries would violate the M002 foundation-skeleton scope.

## Open Risks

- **Auth depth ambiguity:** “Authenticated skeleton” could mean local dev login, JWT bearer auth, or full SaaS auth. Recommendation is local/dev bearer-token skeleton now, with provider interface for later.
- **Frontend-backend integration topology:** M002 must decide whether Next.js talks directly to FastAPI, proxies via Next route handlers, or runs as a single deployment unit. Direct FastAPI API calls are simplest for the skeleton; proxying can be added for deployment hardening.
- **State persistence level:** In-memory seeded data is fastest, but CLI project selection and repeatable tests may benefit from local JSON state. Avoid committing to a production DB in M002 unless planning requires it.
- **Monorepo tooling choice:** There is no existing package manager lockfile. A planner should decide whether to use npm, pnpm, or another workspace tool and keep M002 lean.

## Candidate Requirements / Scope Notes

- Candidate launchability requirement: define the local development commands for backend, CLI, and Web (`make`/scripts or documented commands) once manifests exist.
- Candidate failure-visibility requirement: skeleton auth failures, denied dispatcher calls, and stub runtime errors should return structured error shapes even before full audit logging.
- Candidate continuity requirement: CLI session/project selection should persist locally across commands but never store provider secrets in plaintext.
- Candidate security requirement: production auth provider selection is intentionally deferred; before external users, require a decision on identity provider and secret storage.
- Existing R020–R023 are table stakes for M002. Existing R027 applies to implementation milestone completion, not this research artifact.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| React / Next.js | `react-best-practices` | installed; relevant for Web skeleton implementation and review |
| API design / FastAPI HTTP surface | `api-design` | installed; relevant for endpoint/error-shape review |
| Observability / audit surfaces | `observability` | installed; relevant when adding audit-log and failure-state skeletons |
| Test-driven development | `tdd` / `test` | installed; useful for contract-first backend and CLI tests |
| FastAPI | external skill search via `npx skills find "FastAPI"` | no promising result returned in this environment |
| Typer | external skill search via `npx skills find "Typer Python CLI"` | no promising result returned in this environment |

## Sources

- FastAPI supports reusable security dependencies and OAuth2 scopes through `Depends`/`Security`, and JWT bearer examples validate the `sub` claim plus scopes before returning the current user (source: Context7 `/fastapi/fastapi`, queried 2026-05-09).
- Typer supports command groups, options, command help, and shell completion from type-hinted Python functions (source: Context7 `/fastapi/typer`, queried 2026-05-09).
- Next.js App Router supports authenticated Server Actions and forms with server-side auth checks before mutation; client components can call server actions and redirect after handling form data (source: Context7 `/vercel/next.js`, queried 2026-05-09).
- Hermes reference repository structure and symbols were inspected locally under `/mnt/d/Git_project/references/hermes-agent` for runtime, prompt, memory, skill, model, tool-guardrail, API-server, and session-manager patterns.

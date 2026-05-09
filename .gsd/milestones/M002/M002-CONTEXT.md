# M002: Authenticated foundation skeleton

**Gathered:** 2026-05-09
**Status:** Ready for planning

## Project Description

BuildingAgent is a greenfield building-domain autonomous agent platform. It should first replicate and adapt the architecture of NousResearch Hermes Agent from the local read-only reference repository at `/mnt/d/Git_project/references/hermes-agent`, then extend that foundation into building-domain autonomous agent capabilities.

M002 is the first implementation milestone after the M001 planning scaffold. It should produce a working authenticated skeleton, not only documentation. The smallest real path is FastAPI backend + SQLite seed data + login/project selection/chat API, then Web UI login/project/chat shell, then CLI authenticated skeleton, then broader stub pages and issue tracking workflow.

## Why This Milestone

M001 established the scaffold and specs. M002 must prove the first usable authenticated product path so later permission-aware runtime integration, gateway adapters, and building-domain expansion have real entry points to build on.

This milestone solves the gap between a documented architecture and an executable local prototype. It creates the authenticated foundation that later multi-user, multi-workspace, multi-project behavior can expand from without rewriting the core request context model.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Start the local FastAPI backend and authenticate with a seeded local user backed by persisted SQLite data.
- Use a browser to follow `login → project selection → authenticated chat workspace` against the backend API.
- Use the CLI to log in, list projects, select a project, and send a placeholder authenticated chat message.
- Navigate the authenticated Web UI shell to project dashboard, model/provider settings, skills manager, tools manager, data source settings, user/permission settings, and audit logs.

### Entry point / environment

- Entry point: FastAPI API, Next.js Web UI, and `buildingagent` CLI commands.
- Environment: local dev.
- Live dependencies involved: SQLite database; no external identity provider, no external LLM provider, no real building-domain provider integrations.

## Completion Class

- Contract complete means: API and CLI contract tests prove login, session/token handling, project listing/selection, request-context resolution, and authenticated placeholder chat behavior; Web UI routes/components exist for the required shell.
- Integration complete means: the Next.js Web UI and CLI can both use the backend API for the smallest authenticated path: login, project selection, and chat.
- Operational complete means: local startup, seed-data creation, database initialization, and git/issue workflow are documented and repeatable without secrets or private data.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A fresh local SQLite database can be initialized with one default local user, one default workspace, one default project, membership, and role, while the schema supports multiple users, workspaces, projects, memberships, and roles.
- A browser user can log in, choose the seeded project, reach an authenticated chat workspace, send a message, and receive a placeholder Hermes-like response from the backend.
- The CLI can run `buildingagent login`, `buildingagent project list`, `buildingagent project use <project_id>`, and `buildingagent chat` against the same backend API.
- The milestone is not truly done if authentication, project selection, and chat are only simulated in frontend state; the backend authenticated request flow must actually work.

## Architectural Decisions

### Persisted Local Auth and Project Model

**Decision:** M002 uses a lightweight but real persisted SQLite auth/project model for the local prototype, seeded with one default local user, one default workspace, one default project, and a membership role. The schema must support multiple users, workspaces, projects, memberships, and roles from the beginning.

**Rationale:** A purely dev-only bearer token flow would be too shallow for a platform whose core safety model depends on authenticated user, workspace, project, role, and permission context. SQLite keeps the local prototype simple while proving the data model and expansion path.

**Alternatives Considered:**
- Pure dev bearer token — rejected because it would not prove persisted identity, membership, or project context behavior.
- Production identity provider in M002 — rejected because SSO, invitations, password reset, and production-grade auth are explicitly out of scope for this milestone.

---

### Smallest Working Product Path First

**Decision:** Implement the smallest working path first: FastAPI backend + SQLite seed data + login/project selection/chat API, then Web UI login/project/chat shell, then CLI authenticated skeleton, then broader stub pages and issue tracking workflow.

**Rationale:** The highest-risk boundary is shared authenticated request context. Proving it through a real backend flow first prevents the Web UI and CLI from becoming disconnected mocks.

**Alternatives Considered:**
- Build broad Web UI stubs before backend flow — rejected because visual structure without a working authenticated API path would not validate the milestone.
- Implement runtime/tool/model execution before auth context — rejected because M003 owns deeper permission-aware runtime integration and unsafe execution patterns should not precede authorization seams.

---

### FastAPI Backend Boundary

**Decision:** Use FastAPI for the backend skeleton with reusable `buildingagent` Python modules for auth, project context, runtime stubs, memory stubs, registry stubs, and model configuration stubs.

**Rationale:** FastAPI is a good fit for typed API contracts, local testability, and future Web/CLI shared access. Keeping domain and context logic in reusable modules avoids coupling the CLI to HTTP handler internals.

**Alternatives Considered:**
- Implement all logic directly in route handlers — rejected because CLI and tests need stable shared contracts.
- Delay API implementation until the Web UI is designed — rejected because the backend context contract should drive both Web and CLI behavior.

---

### Web UI Foundation

**Decision:** Use Next.js + React for the Web UI. Do not use Streamlit. Build a clean, modern AI-product-style layout with login, project selection, authenticated chat workspace, and navigable stub pages.

**Rationale:** The Web UI is the first product interface. Next.js provides the right product-app foundation for authenticated pages, project dashboards, and settings shells without locking into a temporary prototype stack.

**Alternatives Considered:**
- Streamlit — rejected by explicit project constraint.
- Heavy AI frontend framework lock-in in M002 — rejected because runtime event contracts are not mature enough yet; assistant-ui or AG-UI can be evaluated later once the API/event surface is clearer.

---

### GitHub Issue Tracking Workflow

**Decision:** From M002 onward, every meaningful enhancement, bug fix, or implementation step should create or reference a GitHub Issue. If GitHub CLI is available and authenticated, use `gh issue create`; otherwise maintain `docs/ISSUE_BACKLOG.md` with issue titles, scope, acceptance criteria, and milestone.

**Rationale:** Implementation work should leave traceable intent and recovery points. The user explicitly authorized issue creation and git push for this repository only.

**Alternatives Considered:**
- Block development when GitHub CLI is unavailable — rejected because local implementation should continue.
- Skip issue tracking until later — rejected because M002 begins actual feature development and commit references should start now.

---

> See `.gsd/DECISIONS.md` for the full append-only register of all project decisions.

## Error Handling Strategy

Backend API errors should return structured JSON with stable machine-readable error codes and human-readable messages. Authentication failures should clearly distinguish missing credentials from invalid credentials without leaking secrets. Project-context failures should identify whether no project was selected, the project does not exist, or the authenticated user lacks membership.

SQLite initialization and seed-data creation should fail loudly with contextual messages. Runtime, model, memory, skill, and tool behavior in M002 can remain placeholder/stubbed, but those stubs should route through explicit boundaries and return observable placeholder responses rather than silent no-ops.

The Web UI should show user-facing login, project selection, and chat errors without exposing tokens or stack traces. The CLI should print actionable error messages and keep local session files free of secrets beyond the local prototype token/session value.

No retry policy is required for M002 beyond normal user retry of login/API requests. External provider fallback is out of scope because there are no external providers in this milestone.

## Risks and Unknowns

- Authentication depth creep — production-grade SSO, invitations, password reset, and deployment security are out of scope, but the local model must not paint the project into a corner.
- Frontend/backend contract drift — the Web UI and CLI must use the same API shapes, not parallel mock behavior.
- Permission boundary ambiguity — M002 creates roles and context but M003 owns deeper permission enforcement; code should keep the boundary explicit so placeholder execution does not imply unsafe authorization is complete.
- Dependency and repo setup churn — the repository is currently scaffold-only, so introducing Python and Next.js package configuration should be minimal, repeatable, and documented.
- GitHub issue workflow availability — if `gh` is unavailable or unauthenticated, development continues with `docs/ISSUE_BACKLOG.md`.

## Existing Codebase / Prior Art

- `.gsd/PROJECT.md` — defines BuildingAgent as a Hermes-like, authenticated, multi-project agent foundation with Web UI first and CLI required from the beginning.
- `.gsd/REQUIREMENTS.md` — R020 through R027 define M002 implementation obligations; R038 through R052 constrain what must not be done.
- `docs/WEB_UI_PLAN.md` — names required Web UI pages and recommends Next.js while avoiding heavy early frontend lock-in.
- `docs/CLI_SPEC.md` — names the required authenticated CLI command skeleton and shared runtime context expectations.
- `docs/HERMES_REPLICATION_STRATEGY.md` — defines Hermes-like concepts to replicate, adapt, defer, and avoid copying blindly.
- `buildingagent/tools/building/*.py` and `skills/building/*.md` — placeholder building-domain files that must remain non-functional in M002.
- `/mnt/d/Git_project/references/hermes-agent` — read-only Hermes reference repository; do not modify and do not vendor wholesale.

## Relevant Requirements

- R007 — M002 advances the Web UI capability from specification toward implementation.
- R008 — M002 creates real routes/pages/components for the required Web UI configuration surfaces as stubs.
- R009 — M002 advances the CLI capability from specification toward implementation.
- R010 — M002 implements the authenticated CLI skeleton commands.
- R015 — M002 adds a skill registry skeleton and skill-listing surface.
- R016 — M002 adds a model/provider configuration skeleton and model-listing surface.
- R020 — M002 implements the authenticated Web UI skeleton.
- R021 — M002 implements the authenticated CLI skeleton.
- R022 — M002 implements the backend auth and project model skeleton.
- R023 — M002 implements Hermes-like runtime, memory, tool, skill, and model configuration skeletons.
- R027 — M002 follows git status/add/commit/push hygiene at each meaningful implementation step.
- R038 — M002 must not use Streamlit for the Web UI.
- R043 — M002 must not commit secrets or credentials.
- R045 — M002 must not rely on frontend-only permission enforcement.
- R047 — M002 must preserve the backend dispatcher/permission boundary shape.
- R048 — M002 must not allow project memory or data leakage across projects.
- R051 — M002 must avoid heavy dependency lock-in before architecture confirmation.
- R052 — M002 must not blindly copy Hermes code.

## Scope

### In Scope

- FastAPI backend skeleton.
- SQLite-backed local auth/project persistence.
- Seeded default local user, workspace, project, membership, and role.
- Login/session/token handling suitable for local prototype use.
- Workspace/project context resolution.
- Project listing and project selection API.
- Authenticated placeholder chat API endpoint with Hermes-like response shape.
- Next.js + React Web UI with login, project selection, chat workspace, sidebar/navigation, and authenticated shell.
- Real Web UI stub routes/pages for project dashboard, model/provider settings, skills manager, tools manager, data source settings, user/permission settings, and audit logs.
- Authenticated CLI skeleton commands: `buildingagent login`, `buildingagent logout`, `buildingagent project list`, `buildingagent project use <project_id>`, `buildingagent chat`, `buildingagent model list`, `buildingagent skills list`, and `buildingagent tools list`.
- Issue tracking via GitHub Issues when possible or `docs/ISSUE_BACKLOG.md` fallback.
- Git commit and push after each meaningful step, scoped only to this repository.

### Out of Scope / Non-Goals

- SSO.
- Organization invitation flow.
- Password reset flow.
- Production-grade deployment security.
- Real BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, or HHW logic.
- Real LLM provider calls.
- Full permission-aware dispatcher enforcement; M003 deepens enforcement.
- Email and WhatsApp provider integrations.
- Vendoring the full Hermes repository.
- Modifying the Hermes reference repository.
- Committing secrets, API keys, tokens, private data, or generated runtime files.
- Remote actions outside this BuildingAgent repository.

## Technical Constraints

- Use FastAPI for the backend skeleton.
- Use SQLite for M002 local persistence unless a later blocker forces a different local store.
- Use Next.js + React for the Web UI.
- Do not use Streamlit.
- Keep building-domain tools and skills placeholders only.
- Keep Hermes reference read-only.
- Preserve attribution if any Hermes code is copied; prefer reimplementation or small, understood adaptations.
- Avoid heavy frontend/backend dependency lock-in before architecture is confirmed.
- Do not commit secrets, runtime tokens, generated SQLite databases, or private building data.

## Integration Points

- SQLite — stores local users, workspaces, projects, memberships, roles, sessions/tokens, and selected project context as needed.
- FastAPI backend — owns authentication, project context resolution, project selection, placeholder chat, and registry/listing APIs.
- Next.js Web UI — consumes FastAPI APIs for login, project selection, and chat; hosts authenticated shell and stub routes.
- CLI — consumes the same backend API where practical and stores local session/project selection state safely for the local prototype.
- GitHub Issues or `docs/ISSUE_BACKLOG.md` — tracks implementation work with clear scope, acceptance criteria, and milestone.
- Hermes reference repository — informs architecture only; remains read-only.

## Testing Requirements

Backend tests should cover database initialization/seed behavior, login success/failure, token/session-required behavior, project listing, project selection, project-context resolution, and authenticated placeholder chat. Tests should prove that endpoints reject missing authentication and reject invalid or unauthorized project context.

CLI tests should cover command parsing and API interaction boundaries where practical. At minimum, CLI commands should be runnable locally against the backend and handle unauthenticated/missing-project errors clearly.

Web UI verification should cover the real browser path: login, project selection, chat workspace, and navigation to stub pages. The Web UI must not fake successful authentication without backend confirmation.

Integration verification should start the local backend and Web UI, then prove browser and CLI both hit the backend API successfully. Generated runtime files and databases should remain out of Git.

## Acceptance Criteria

- Backend initializes a SQLite database and seed data repeatably without committing generated runtime files.
- Backend login returns a usable local prototype token/session for the seeded user.
- Backend project API lists the seeded project for the authenticated user and supports project selection/context.
- Backend chat API requires authentication and project context and returns a placeholder Hermes-like response.
- Web UI login page authenticates through the backend.
- Web UI project selection page lists/selects the seeded project through the backend.
- Web UI chat workspace sends a message to the backend and renders the placeholder response.
- Web UI authenticated shell includes navigable real routes/pages/components for project dashboard, model/provider settings, skills manager, tools manager, data source settings, user/permission settings, and audit logs.
- CLI supports `buildingagent login`, `buildingagent logout`, `buildingagent project list`, `buildingagent project use <project_id>`, `buildingagent chat`, `buildingagent model list`, `buildingagent skills list`, and `buildingagent tools list`.
- Meaningful implementation steps are tracked via GitHub Issues when available or `docs/ISSUE_BACKLOG.md` fallback.
- Commits reference issue numbers with `refs #N` for partial work or `closes #N` for completed issue work.
- Git status/add/commit/push is performed after each meaningful implementation step, scoped only to this repository.

## Open Questions

- Exact package manager and frontend styling stack — current thinking is to choose the lightest project-local setup that supports Next.js + React cleanly without premature UI framework lock-in.
- Exact token/session storage mechanics — current thinking is local prototype token/session handling with persisted server-side data and safe `.gitignore` coverage for generated runtime state.
- GitHub CLI availability and authentication — current thinking is to try local `gh` discovery and fall back to `docs/ISSUE_BACKLOG.md` if unavailable or unauthenticated.

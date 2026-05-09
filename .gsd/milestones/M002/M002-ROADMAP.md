# M002: Authenticated foundation skeleton

**Vision:** M002 turns the M001 Hermes-first plan into a thin, testable, authenticated product skeleton. The milestone should leave BuildingAgent with real API, CLI, and Web entry points that all resolve the same user/workspace/project context and expose safe stubbed runtime, memory, tool, skill, and model boundaries for M003 permission-aware integration.

## Success Criteria

- Authenticated backend skeleton resolves request context and exposes project/context endpoints with structured errors.
- Runtime, memory, tool, skill, and model/provider skeletons are accessible through authenticated boundaries and remain explicitly stubbed.
- Authenticated CLI can login, select project, inspect skeleton registries, and run stub chat using the shared context shape.
- Authenticated Next.js Web UI can login, select project, view chat/config/registry/audit placeholders, and run stub chat against the backend skeleton.
- Local developer commands and tests verify the full API/CLI/Web foundation without external services or secrets.
- No out-of-scope production auth, real model execution, heavy building dependencies, or Hermes vendoring is introduced.

## Slices

- [x] **S01: S01** `risk:High` `depends:[]`
  > After this: A developer can start or test the FastAPI app, authenticate with the seeded local/dev token flow, call `/auth/me`, `/projects`, and a project context endpoint, and see unauthenticated requests fail with structured 401 errors.

- [x] **S02: Runtime, registry, memory, and model skeleton APIs** `risk:High` `depends:[S00]`
  > After this: An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

- [ ] **S03: Authenticated CLI primary loop** `risk:Medium` `depends:[S01,S02]`
  > After this: From the terminal, a developer can run `buildingagent login`, choose/list/use a project, inspect model/tool/skill metadata, and send a stub chat command that prints the same context IDs returned by the backend contract.

- [ ] **S04: Authenticated Web UI skeleton** `risk:Medium` `depends:[S01,S02]`
  > After this: In the browser, a user can open the Next.js app, perform the local/dev login flow, select a seeded project, view chat/config/tool/skill/permission/audit placeholder pages, and submit a chat prompt that renders the backend stub response with context IDs.

- [ ] **S05: Integrated launchability and diagnostics** `risk:Medium` `depends:[S03,S04]`
  > After this: A developer can run the documented local verification sequence for API, CLI, and Web; inspect health/debug/audit placeholder surfaces; and complete the milestone with a clean git status, commit, and push workflow.

- [ ] **S00: Implementation-readiness reconciliation** `risk:Low` `depends:[S01]`
  > After this: Repository structure, plan artifacts, and upcoming file references are reconciled so M002 feature work can continue without stale or missing path references.

## Boundary Map

## Boundary Map

| Area | In M002 | Out of M002 |
| --- | --- | --- |
| Auth | Local/dev bearer-token login, reusable provider interface, authenticated dependencies, standard error shapes | Production identity provider selection, SSO/OAuth vendor integration, password recovery, external user onboarding |
| Project context | Seeded users/workspaces/projects, membership role/scopes, `RequestContext` resolved at API/CLI/Web boundaries | Production database migrations, tenant billing, external customer lifecycle |
| Runtime | Hermes-inspired typed session/runtime contracts and structured stub chat responses routed through dispatcher boundaries | Real model invocation, long-running agent loop, subagents, scheduler, trajectory compression |
| Memory | Project-scoped memory interfaces and stub/local store behavior proving `project_id` isolation | Real retrieval/ranking/vector storage, cross-project memory sharing |
| Tools/skills/models | Metadata registries and dispatcher/config hooks visible via API/CLI/Web | Executing building-domain tools, loading untrusted skill code, provider-secret management |
| Web | Next.js App Router skeleton for login, project selection, chat, config, tools/skills, permissions, audit placeholders | Streamlit, polished production design system, assistant-ui integration, real-time streaming |
| CLI | Typer skeleton with login/logout, project, chat, model/provider, skill/tool, admin/debug commands | Shell completion packaging, remote auth flows, secret storage beyond non-secret local session state |
| Observability | Health/debug endpoints, request IDs, structured error responses, audit-log placeholder surfaces | Full audit retention, alerting, metrics backend, SIEM integration |

## Horizontal Checklist Considered

- Requirements re-read: Active M002 requirements R020-R027 are mapped below; deferred and anti-feature requirements remain outside this milestone.
- Decisions re-evaluated: FastAPI, Typer, Next.js App Router, local/dev auth, and stubbed runtime remain aligned with M001/M002 research.
- Graceful shutdown: dev servers should stop cleanly; no long-running workers are introduced in M002.
- Revenue paths: no billing/subscription surface is introduced; multi-workspace/project boundaries preserve future commercial shape.
- Auth boundary: every non-health API, CLI command requiring project state, and Web data view resolves `RequestContext`.
- Shared resources: no production DB or external provider secrets; seeded/local stores avoid hidden infrastructure coupling.
- Reconnection/resume: CLI stores non-secret session/project selection locally; Web can recover session state from local/dev token flow.

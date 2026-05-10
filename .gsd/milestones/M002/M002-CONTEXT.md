# M002: BuildingAgent UI Redesign and Project-Scoped Workspace

**Gathered:** 2026-05-10
**Status:** Ready for planning

## Project Description

BuildingAgent is a building-domain autonomous agent platform inspired by NousResearch Hermes Agent. M001 established the local authenticated platform foundation: Fastify API, React/Vite Web app, CLI, login, project selection, project-scoped chat, provider fallback, registry/management placeholders, and smoke checks.

M002 changes direction from a narrow “Building-Domain Data Source Stubs” milestone into a UI-first product milestone. The goal is to turn the current skeleton Web app into a polished ChatGPT/Hermes-style project workspace that demonstrates where project-scoped Knowledge Base, Repository, scheduled tasks, Skills, Tools, Markdown chat output, and mock visual artifacts will live.

## Why This Milestone

The platform has working local contracts, but the Web UI still reads like a foundation skeleton. Before adding real building integrations or workflow execution, the product needs a coherent project workspace that users can understand and evaluate. This milestone proves the information architecture and UX boundaries while staying safe: all building-domain, repository, tool, skill, task, schedule, and control behavior remains mock/stub-only.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Open the local Web app and see an immediate app shell, loading state, or skeleton instead of a long blank screen.
- Log in through a polished BuildingAgent-branded page.
- Select an authorized project from a polished project selection screen.
- Enter a three-column project workspace with left navigation, central chat, and right contextual panel.
- See assistant Markdown rendered as proper HTML, including headings, lists, links, code blocks, and tables.
- See mock image outputs in chat as inline previews/cards and enlarge them in a modal or preview view.
- Navigate project-scoped Knowledge Base and Repository mock surfaces.
- See right-panel sections in the fixed order: Scheduled & Rule-based Tasks, Skills, Tools.
- Understand from the UI that all task, skill, tool, repository, and building-control examples are mock/stub-only.

### Entry point / environment

- Entry point: local Web app (`apps/web`, normally Vite on loopback) backed by the existing local API.
- Environment: local development browser.
- Live dependencies involved: existing local API only. No real RAG, MCP service, scheduler, repository mutation service, BMS, chiller control, external building source, or cost-producing provider call is introduced by M002.

## Completion Class

- Contract complete means: React component tests and typecheck prove the UI contracts, section ordering, Markdown rendering, image preview behavior, project-scope labels, and mock-only labels.
- Integration complete means: the existing login → project selection → project workspace path works against the local API while new UI surfaces compose correctly.
- Operational complete means: the local dev app shows a visible shell/loading/skeleton quickly; if dev server cold start contributes to delay, it is documented but not used as an excuse for a blank UI after the app bundle loads.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A seeded local user can log in, select a project, enter the redesigned workspace, send/view chat, and see project-scoped mock surfaces.
- Assistant Markdown renders correctly and mock image previews open/close in the browser.
- Knowledge Base, Repository, Scheduled Tasks, Skills, and Tools are visibly project-scoped or account-scoped where appropriate, and all operational examples are labeled mock/stub-only.
- The right panel appears in the exact order Scheduled & Rule-based Tasks → Skills → Tools.
- The app shows shell/loading/skeleton feedback quickly on first load.
- No real RAG, MCP calls, backend scheduling, repository writes/deletes, BMS control, chiller shutdown, external operations, or unapproved cost-producing API calls are reachable.

## Architectural Decisions

### UI-First Mock Boundary

**Decision:** M002 will build the product-facing workspace and mock/stub surfaces first, not real building integrations or operational execution.

**Rationale:** The current risk is product shape and boundary clarity, not data integration mechanics. A polished workspace can prove the future information architecture without introducing unsafe controls, secrets, real customer data, or external costs.

**Alternatives Considered:**
- Build real data-source configuration APIs first — rejected because it would make M002 backend-heavy and delay the user-visible workspace.
- Implement real RAG or MCP tools now — rejected because the user explicitly constrained M002 to mock/stub-only.

### Project Scope vs Account Scope

**Decision:** LLM connection settings such as API key, base URL, and model may appear as account/user settings in the UI, while project content remains project-scoped.

**Rationale:** Model connection settings belong to the user/account context, but conversations, Knowledge Base, Repository, tasks, Skills, Tools, and building-domain data must not cross project boundaries.

**Alternatives Considered:**
- Store all settings per project — rejected because provider credentials and defaults are user/account-level in this product direction.
- Treat all workspace surfaces as global — rejected because it conflicts with the project-isolation foundation.

### Markdown and Image Chat as First-Class UI Contracts

**Decision:** Assistant messages must render Markdown and mock images as structured UI, not raw text.

**Rationale:** Chat is the center of the workspace. Markdown tables, code blocks, links, and generated image previews are central to how a building assistant will explain analyses and outputs later.

**Alternatives Considered:**
- Leave chat as plain text until real agents exist — rejected because it makes the UI feel broken and hides important product requirements.

## Error Handling Strategy

M002 should keep the existing request-id-aware API error behavior for real local API calls. UI-only mock surfaces should fail closed: if mock payload shapes are malformed or unavailable, show bounded empty/error states that identify the affected surface without implying a real integration failed. No secrets should be logged or rendered. Any account-level LLM settings UI must be non-operational unless explicitly wired in a later milestone.

## Risks and Unknowns

- First-load blank screen may be partly dev-server cold start — this matters because the milestone can improve app-shell behavior after bundle load, but cannot remove Vite cold-start network latency entirely.
- Markdown rendering dependency choice affects bundle size and security posture — this matters because chat content may eventually come from providers, so safe rendering and link handling should be established now.
- UI polish can sprawl — this matters because M002 must remain a vertical product slice, not a design-system rewrite.
- Mock surfaces may accidentally imply real operational capability — this matters because building controls and chiller examples are safety-sensitive.

## Existing Codebase / Prior Art

- `apps/web/src/App.tsx` — current React/Vite app contains login, project selection, chat workspace, tabs, registry/management placeholder surfaces, and raw chat message rendering.
- `apps/web/src/api.ts` — typed Web client for the existing local API; should remain the boundary for real API calls.
- `apps/web/src/styles.css` — current global UI styling; M002 will evolve it into a stronger visual system.
- `apps/web/src/App.test.tsx` — existing Web tests for login/project/chat and placeholder surfaces; M002 should extend rather than discard them.
- `apps/api/src/server.ts` and related API tests — existing auth/project/chat/registry/management contracts remain the backend guardrails.
- `.gsd/milestones/M001/M001-CONTEXT.md` and `.gsd/milestones/M001/M001-SUMMARY.md` — foundation context and verified boundaries.

## Relevant Requirements

- R015 — advances project-scoped workspace and future data-source boundary surfaces.
- R028 — establishes polished login, project selection, and workspace product shell.
- R029 — establishes Markdown chat rendering.
- R030 — establishes mock chat image previews.
- R031 — establishes project-scoped mock Knowledge Base surface.
- R032 — establishes project-scoped mock Repository surface.
- R033 — fixes right-panel order.
- R034 — improves first-load perceived performance.
- R035 — keeps M002 mock/stub-only across agent/skill/tool/task/repository/building behavior.
- R036 — separates account-level LLM settings from project-scoped content.
- R037 — explicitly excludes real RAG, MCP calls, scheduling backend, repository mutation, BMS control, chiller shutdown, external operations, and unapproved cost-producing API calls.

## Scope

### In Scope

- Polished login page.
- Polished project selection page.
- Three-column project workspace shell.
- Left navigation with project switcher, chat history/shortcuts, KB/Repository shortcuts, and account settings affordance.
- Center chat with Markdown rendering and mock image previews.
- Project-scoped Knowledge Base mock UI.
- Project-scoped Repository mock UI.
- Right panel ordered Scheduled & Rule-based Tasks, Skills, Tools.
- First-load shell/loading/skeleton improvements.
- Mock data, labels, and tests that enforce mock/stub-only boundaries.
- Documentation notes for loading behavior and mock-only scope where relevant.

### Out of Scope / Non-Goals

- Real RAG, vector indexing, embedding jobs, document parsing, or retrieval.
- Real MCP tool calls or tool dispatcher execution.
- Real backend scheduler or recurring job engine.
- Real repository file writes, deletes, or generated artifact persistence.
- Real BIM, Brick/RDF/SPARQL, time-series, mapping, or building analytics integrations.
- Real BMS control, chiller shutdown, equipment command, or external operation.
- Production auth, SSO, invitations, password reset, or non-local deployment hardening.
- Unapproved cost-producing API calls.

## Technical Constraints

- Keep M002 UI-first and avoid backend-heavy changes unless needed to preserve existing contracts.
- Use existing backend contracts where useful.
- Use mock front-end data for project workspace surfaces where needed.
- Preserve local authentication and project isolation from M001.
- Preserve strict placeholder parsing/fail-closed behavior where existing placeholder contracts are used.
- Do not store real building data or secrets in the repository.
- Avoid heavy UI dependencies unless they materially improve the required behavior.

## Integration Points

- Existing local API auth/project/chat/session endpoints — used by login, project selection, project context, and chat.
- Existing registry/management placeholders — may inform mock tool/skill/building-domain cards but must remain non-operational.
- Web localStorage session rehydration — may be improved around shell/loading behavior but should not expand secret exposure.
- React/Vite Web test harness — primary verification surface for UI contracts.

## Testing Requirements

- Web component tests for login, project selection, workspace layout, project-scope labels, right-panel order, Markdown rendering, image preview open/close, KB, Repository, and mock-only labels.
- Typecheck for all workspaces or at least Web plus any touched API/CLI contracts.
- Build verification before completion.
- Browser verification against the local app for the full login → project selection → workspace flow, Markdown/image behavior, first-load shell/loading behavior, responsive layout, and right-panel order.
- Existing root smoke sanity if changes touch cross-workspace behavior.

## Acceptance Criteria

- S01 proves the app shell and skeleton/loading behavior appear quickly and establish reusable UI primitives.
- S02 proves the login page is polished and the seeded login flow still works.
- S03 proves authorized project selection is polished and project metadata is mock-only.
- S04 proves the three-column project workspace is coherent and project/account scopes are clear.
- S05 proves Markdown and mock images render correctly in chat.
- S06 proves Knowledge Base and Repository surfaces are project-scoped and mock-only.
- S07 proves Scheduled Tasks, Skills, and Tools appear in the fixed order and the final integrated flow passes verification.

## Open Questions

- Exact visual direction can still be refined during S01/S02, but the milestone should avoid generic skeleton styling and commit to a clean building-operations product aesthetic.
- Whether Markdown rendering uses `react-markdown` + `remark-gfm` or a smaller parser can be decided in S05, with security and bundle size considered.

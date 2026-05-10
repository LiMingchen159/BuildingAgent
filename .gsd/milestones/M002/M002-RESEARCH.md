# M002 — Research

**Date:** 2026-05-10

## Summary

M002 should be planned as a staged front-end product rebuild on top of the already-working M001 contracts, not as a backend milestone. The existing Web app has the essential local flow in one file (`apps/web/src/App.tsx`): login, project selection, session rehydration, project-scoped chat, and placeholder registry/management panels. Current tests already cover many safety contracts: auth failure handling, forbidden project selection, malformed API payloads, request-id diagnostics, read-only project behavior, provider metadata redaction, and placeholder-only registry/management behavior. That means the redesign can reuse the API boundary and test harness while replacing the presentation and adding mock-only workspace surfaces.

The biggest planning risk is scope sprawl inside `App.tsx`: the file already contains state, API orchestration, layout, chat, management panels, and validation UI. M002’s requirements add a three-column workspace, left nav, right panel ordering, Markdown rendering, image previews, Knowledge Base, Repository, account-vs-project scope labels, and first-load skeleton behavior. The safest build order is to first introduce reusable shell/component boundaries and mock data shapes, then incrementally swap the screens and add tests per visible contract. Markdown/image rendering should be its own slice because it introduces a dependency/security choice and user-generated/provider-generated content handling.

The current backend can stay mostly untouched. It already exposes seeded projects, project selection, project chat, registry placeholders, and project management placeholders with `placeholderOnly: true`; `apps/api/src/server.ts` enforces membership, selected-project matching, permissions, and bounded arrays. M002 should avoid adding real scheduler/RAG/MCP/repository/building-control endpoints. For new KB, repository, scheduled tasks, skills, and tools surfaces, front-end mock fixtures are enough unless a future slice needs a tiny typed adapter for existing placeholder responses.

## Recommendation

Plan M002 as seven thin UI-first slices that preserve the local API contracts: (1) app shell/loading skeleton and component boundaries, (2) polished login, (3) polished project selection, (4) three-column workspace with project/account scope IA, (5) Markdown and mock image chat rendering, (6) project-scoped KB and Repository mock surfaces, and (7) right-panel scheduled tasks/skills/tools ordering plus integrated browser verification. This sequence proves launchability and layout foundations before adding content-heavy surfaces, keeps the risky Markdown dependency isolated, and reserves final integration for exact right-panel ordering and full local flow verification.

Use `react-markdown` with `remark-gfm` for Markdown rather than hand-rolling a parser. Documentation confirms `react-markdown` supports custom components and `remark-gfm` adds tables, task lists, strikethrough, and autolinks. It is secure by default because raw HTML is escaped/ignored and default URL handling blocks dangerous protocols such as `javascript:`. Avoid `rehype-raw`; if later raw HTML is needed, pair it with `rehype-sanitize`, but raw HTML is not needed for M002. Custom link components should set `target="_blank"` and `rel="noreferrer noopener"` for external links.

For visual direction, avoid generic dashboard styling. The product context supports a refined building-operations command-center aesthetic: dense but calm, with strong project boundary markers, operational safety badges, blueprint/grid motifs, and clear mock-only/approval-gated language. Keep CSS local/global and dependency-light; this milestone does not need a UI library or design-system rewrite.

## Implementation Landscape

### Key Files

- `apps/web/src/App.tsx` — Main Web app and current largest change target. Contains session storage (`building-agent.session.v1`), bootstrapping, login/project selection handlers, project chat, provider diagnostics, registry/gateway/building placeholder panels, tab navigation, and screen rendering. It should likely be split or at least reorganized into smaller components/fixtures as M002 grows.
- `apps/web/src/api.ts` — Typed Web API boundary. Already validates auth/project/chat/registry/management payload shapes and fails closed on malformed JSON. Keep real API calls here; do not put mock-only KB/repository/scheduled-task behavior behind live external calls.
- `apps/web/src/styles.css` — Current global visual system. It is clean but skeleton-like: card layout, tabs, management grids, message list, topbar, responsive breakpoint. M002 can evolve it, but planners should budget enough time for full shell/layout CSS, responsive three-column behavior, Markdown styles, image modal styles, and skeleton states.
- `apps/web/src/App.test.tsx` — Current primary contract test suite. It has 12 passing tests covering login → project → chat, auth guards, malformed payloads, provider diagnostics, read-only projects, registry/management errors, and provider secret redaction. Extend this suite for M002 UI contracts rather than replacing it.
- `apps/web/src/main.tsx` — Simple React/Vite root render. If first-load skeleton is meant to appear before React bootstraps, this can coordinate with static HTML/CSS in `index.html`; otherwise the current `bootstrapping` state only appears after bundle load.
- `apps/web/index.html` — Currently only contains `<div id="root"></div>`. For R034, planners should consider adding a minimal branded static shell/skeleton in or around the root so users do not see a completely blank body while Vite/bundle loading occurs. React can replace it on mount.
- `apps/api/src/server.ts` — Existing backend contracts for auth, projects, registry, project management, and chat. It already gates project management by auth, membership, selected project, and `chat:read`; chat POST calls provider only after auth/project/permission/body validation.
- `apps/api/src/seed.ts` — Seed users/projects and placeholder fixtures. Projects are `project_alpha`, `project_beta`, `project_gamma`; Ada has write access to Alpha and read-only access to Beta. Registry fixtures include runtime providers, tools, skills, gateways, and building capabilities; management fixtures are per project.
- `apps/api/src/providers.ts` — Deterministic mock provider and optional real OpenAI-compatible provider. M002 should not introduce unapproved provider calls; tests should continue to prove provider metadata is redaction-safe and mock/fallback mode is explicit.
- `package.json` and `apps/web/package.json` — Workspace scripts. Web currently depends only on React/Vite; adding Markdown likely means adding `react-markdown` and `remark-gfm` to `apps/web` dependencies.

### Existing Behavior to Reuse

- The Web app already persists token/user/project in localStorage and rehydrates with `/api/session`, `/api/projects`, `/api/projects/:id/chat`, `/api/registry`, and `/api/projects/:id/management`.
- API error envelopes include request IDs and are already surfaced through `Banner`; keep this for real API calls.
- `ProjectScreen` already only renders projects returned by the API. Use that as the trust boundary for authorized project selection.
- `PlaceholderBadge`, `ItemList`, `MetaBar`, and `EmptyState` are small primitives worth preserving or promoting into reusable components.
- Read-only project behavior is already tested: management inspection remains available while chat compose is disabled.
- Existing tests mock fetch centrally (`installBaseFetch`) and can be extended to return Markdown assistant content or mock image metadata.

### Natural Slice Boundaries

1. **Shell/loading primitives:** Add immediate visible shell/skeleton and reusable layout primitives. This unblocks every other screen and directly addresses R034.
2. **Login redesign:** Low backend risk; proves brand direction and preserves seeded login.
3. **Project selection redesign:** Reuses `/api/projects`; add project boundary and mock-only metadata language.
4. **Workspace IA:** Introduce three-column layout, left nav/project switcher/shortcuts/account settings affordance, and scope labels. This is the structural prerequisite for KB/repository/right-panel surfaces.
5. **Chat rendering:** Add Markdown renderer and mock image preview modal/card. Isolate dependency and security tests here.
6. **KB/Repository mock surfaces:** Front-end mock fixtures and project-scoped empty/error states; no real document parsing, repository mutation, or persistence.
7. **Right panel/final integration:** Scheduled & Rule-based Tasks → Skills → Tools order, mock-only labels, integrated local browser verification, and regression/type/build checks.

### Build Order

Prove the shell and component boundaries first. R034 is user-visible immediately and `index.html`/root skeleton decisions affect every later screen. Also, the current monolithic `App.tsx` will become harder to safely change if the milestone starts by adding Markdown and repository mocks directly into it.

After shell primitives, polish login and project selection because they are isolated, easy to verify with current tests, and establish the visual language. Then introduce the three-column workspace before content surfaces; otherwise KB/repository/right-panel work will be reworked. Keep Markdown/image work separate because dependency/security decisions and modal interactions deserve focused tests. Finish with right-panel ordering and end-to-end browser flow because it validates all cross-slice composition.

### Verification Approach

- Baseline verification already passes: `npm --workspace @building-agent/web run test && npm --workspace @building-agent/web run typecheck` completed successfully with 12 Web tests passing.
- Per-slice Web verification should include `npm --workspace @building-agent/web run test` and `npm --workspace @building-agent/web run typecheck`.
- Before milestone completion run root-level `npm run typecheck`, `npm run test`, and `npm run build` if touched changes remain web-only but workspace-level compatibility matters.
- Add React Testing Library assertions for:
  - static/app skeleton or loading shell text/landmarks,
  - polished login and seeded login flow,
  - project cards and project-scope labels,
  - three-column landmarks/left nav/center chat/right panel,
  - account-level LLM/settings affordance separate from project content,
  - Markdown elements rendered as HTML (`h1/h2`, list, link, code/pre, blockquote, hr, table),
  - unsafe Markdown behavior (`javascript:` link blocked; raw HTML not rendered as executable HTML if tested),
  - mock image inline preview and modal open/close,
  - KB and Repository mock-only/project-scoped language,
  - approval-gated future repository actions,
  - right-panel section order via DOM order checks.
- Browser verification should use the local Vite app backed by local API for seeded login → project selection → workspace → chat → Markdown/image preview → KB/Repository/right-panel order. Browser assertions should be explicit rather than inferred from screenshots.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Markdown rendering with GFM tables/lists/code/links | `react-markdown` + `remark-gfm` | Avoids writing a parser, supports React custom components, and has secure defaults for raw HTML/URL handling. |
| Component interaction tests | Existing Vitest + React Testing Library setup | Already established and passing; fastest way to lock UI contracts without adding Cypress/Playwright test infrastructure. |
| Real project/auth/chat contracts | Existing `apps/web/src/api.ts` client + Fastify API | Preserves M001 backend guardrails and request-id-aware errors. |
| Mock registry/tool/skill/building capability fixtures | Existing `apps/api/src/seed.ts` registry/management placeholders plus front-end fixtures | Keeps M002 mock/stub-only without adding real scheduler, repository, RAG, MCP, or building-control execution. |

## Constraints

- M002 must not add real RAG, MCP, scheduler, repository mutation, BMS control, chiller shutdown, external operations, or unapproved cost-producing provider calls.
- Existing Web dependencies are minimal (`react`, `react-dom`, `vite`). Any new dependency should materially support a requirement; Markdown is the only obvious dependency-worthy gap.
- The backend chat provider can be configured for a real provider through environment variables, but M002 acceptance should not require or trigger real provider calls. Local tests should keep deterministic mock behavior.
- `App.tsx` is currently monolithic; adding many surfaces without refactoring will increase test brittleness and merge risk.
- First-load blank screen has two layers: dev server cold start/network latency and post-bundle React state. Static `index.html` skeleton can address the former better than only a React `bootstrapping` branch.
- Mock-only surfaces must be worded carefully for building-control examples; avoid UI labels that imply a real command can be sent.

## Common Pitfalls

- **Raw Markdown XSS drift** — Do not add `rehype-raw` for M002. `react-markdown` escapes/ignores raw HTML by default; keep it that way and use default URL security or explicitly test unsafe links.
- **Right-panel order regression** — The exact order is a requirement: Scheduled & Rule-based Tasks, Skills, Tools. Use a DOM-order test, not just text presence.
- **Project/account scope confusion** — Left nav and settings affordance should clearly label account-level model settings separately from project-scoped chat/KB/repository/tasks/skills/tools.
- **Mock UI implying real operations** — Scheduled tasks, tools, repository actions, BIM/Brick/time-series/building-control examples should use disabled/preview/approval-gated language and mock/stub badges.
- **App shell only after bundle load** — A React-only loading state helps session bootstrap, but not a slow Vite bundle blank. Consider static HTML/CSS fallback in `index.html` for the immediate shell requirement.
- **Over-polishing into a design-system rewrite** — Use focused primitives and CSS variables; avoid introducing a large component library or unrelated UI infrastructure.

## Open Risks

- Markdown package versions may affect TypeScript/Vite ESM behavior; verify immediately after adding dependencies.
- `react-markdown` adds bundle weight; likely acceptable for the central chat contract, but keep syntax highlighting simple CSS-only unless explicitly required.
- Full browser verification may require coordinating API and Web dev servers; preserve root smoke scripts and document any Vite cold-start limitation separately from app-shell behavior.
- If mock image outputs are represented inside `ChatMessage.content`, planners need to choose a stable convention. Candidate approaches: typed front-end mock attachments keyed by assistant message ID, or a local extended message view model; avoid changing backend chat schema unless necessary.

## Candidate Requirements / Advisory Notes

- Candidate launchability requirement: static pre-React shell in `index.html` should be allowed as evidence for first-load perceived performance, with React replacing it after mount.
- Candidate security-quality requirement: Markdown rendering must not render raw HTML and must block unsafe `javascript:` links. This is implied by future provider-generated content but not explicitly listed in R029.
- Candidate UX requirement: mock image preview should be keyboard dismissible (`Escape`) and have dialog semantics; this is not explicit in R030 but should be treated as accessibility table stakes if practical.
- Advisory only: a full design-system package, real syntax highlighting dependency, or backend mock endpoint expansion is unnecessary for M002 unless a later slice proves a concrete gap.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| React / Next-style UI performance | Installed `react-best-practices`; external `vercel-labs/agent-skills@vercel-react-best-practices` (385.7K installs) | installed / available |
| Frontend visual design | Installed `frontend-design` | installed and consulted |
| UI polish details | Installed `make-interfaces-feel-better`, `userinterface-wiki`, `web-design-guidelines`, `accessibility` | installed; useful for later slice/review work |
| Vite / Vitest | External `antfu/skills@vite` (21.4K installs), `antfu/skills@vitest` (17.4K installs) | available, not installed |
| react-markdown | External `syncfusion/react-ui-components-skills@syncfusion-react-markdown-converter` (57 installs) | available but low install count; not necessary |

## Sources

- `react-markdown` documentation via Context7: `react-markdown` with `remark-gfm` supports GFM tables/task lists/autolinks and custom components; default URL transform blocks unsafe protocols; raw HTML is escaped/ignored by default; using raw HTML requires caution and sanitization.
- Current baseline verification: `npm --workspace @building-agent/web run test && npm --workspace @building-agent/web run typecheck` passed (12 Web tests, typecheck clean).
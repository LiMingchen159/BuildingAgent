# S01: App Shell, Loading Skeleton, and UI Primitives

**Goal:** Produce the shared BuildingAgent visual shell, immediate first-load skeleton, bounded loading/error UI states, reusable UI primitives, and mock-only badge vocabulary consumed by later M002 screens while preserving the existing M001 auth/session/project contracts.
**Demo:** After this: opening the local Web app shows a branded BuildingAgent shell or skeleton immediately after HTML/React bootstrap, with bounded loading/error states and reusable UI primitives ready for later screens.

## Must-Haves

- ## Must-Haves
- Opening the Web app never presents an empty `#root`: `apps/web/index.html` contains a branded BuildingAgent fallback/skeleton visible before React finishes bootstrapping.
- React removes or supersedes the static fallback once mounted and shows bounded branded loading states during saved-session bootstrap and async transitions.
- Reusable UI primitives exist for later slices: branded shell/header, banners with redaction-safe diagnostics, mock/stub-only badges, skeleton/loading cards, empty states, and surface/card styling.
- Existing M001 behavior remains intact: seeded login, authorized project selection, selected-project persistence, request-id-aware API errors, provider diagnostic redaction, and project-scoped chat tests keep passing.
- Mock/stub-only vocabulary is explicit in the shell/primitives and no new live scheduler, repository, RAG, MCP, BMS, BIM, Brick, time-series, mapping, or control action is reachable.
- ## Threat Surface
- **Abuse**: This slice should not add new API calls or permissions. The main abuse risk is UI overclaiming live operational capabilities; every new operational-looking label must use mock/stub-only wording.
- **Data exposure**: The app already stores a seeded bearer token in localStorage. New diagnostics and shell UI must not render bearer tokens, raw localStorage, provider secrets, API keys, or hidden customer/building data.
- **Input trust**: No new persisted user input should be introduced. Existing login/chat inputs continue through the established `apps/web/src/api.ts` client and must keep current validation/error behavior.
- ## Requirement Impact
- **Requirements touched**: R028, R034, R035.
- **Re-verify**: Web unit tests must re-run the login → project selection → workspace flow, saved-session bootstrap/loading behavior, request-id-aware error display, and mock/stub-only labeling.
- **Decisions revisited**: D012, D013, D014, D015 remain honored; no decision is changed by this slice.
- ## Verification
- `npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx apps/web/src/App.test.tsx`
- `npm --workspace @building-agent/web run build`
- Planned test file: `apps/web/src/appShell.test.tsx` asserts the static HTML shell/skeleton exists before React, React clears or supersedes it on mount, loading/error states are branded and bounded, diagnostic request IDs render without secrets, and mock/stub-only vocabulary is present.
- Existing test file: `apps/web/src/App.test.tsx` remains the regression suite for seeded login, project selection, project-scoped chat, provider diagnostic redaction, and request-id-aware API errors.
- ## Observability / Diagnostics
- Runtime signals: visible branded static fallback, React loading skeleton/status text, banners with tone/code/requestId, and explicit mock/stub-only badges.
- Inspection surfaces: DOM roles (`status`, `alert`), stable accessible labels/text in tests, `apps/web/index.html` fallback markup, and Vitest assertions.
- Failure visibility: bootstrap/session/API failures resolve to bounded banners instead of blank screens; auth failures clear stored state while preserving requestId/code display.
- Redaction constraints: no bearer token, provider `apiKey`, raw localStorage value, or secret-like diagnostic is rendered.

## Proof Level

- This slice proves: - This slice proves: integration
- Real runtime required: yes for build/Vitest jsdom runtime, and optionally the local Vite app for browser evidence; no live external building integrations are introduced.
- Human/UAT required: no for completion; later milestone UAT will visually confirm polish across the assembled flow.

## Integration Closure

Upstream surfaces consumed: `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/api.ts`, `apps/web/src/App.test.tsx`, `apps/web/src/styles.css`, and the existing Vite/Vitest setup in `apps/web/vite.config.ts`. New wiring introduced in this slice: a static no-blank HTML fallback shell in `apps/web/index.html`, bootstrap cleanup in `apps/web/src/main.tsx`, reusable React UI primitives in `apps/web/src/ui/primitives.tsx`, and App-level loading/error composition that uses those primitives. What remains before the milestone is truly usable end-to-end: later slices must redesign login, project selection, three-column workspace IA, Markdown/image chat, KB/Repository surfaces, and final right-panel ordering.

## Verification

- Runtime signals: branded loading and bounded error/status regions expose current phase through visible text, ARIA roles, and request-id-aware diagnostic lines without logging secrets. Inspection surfaces: Vitest DOM assertions, the static `#root` fallback shell in `apps/web/index.html`, and in-browser `role="status"`/`role="alert"` regions. Failure visibility: saved-session bootstrap failures continue to show bounded banners with code/requestId when available and clear invalid auth state. Redaction constraints: never render bearer tokens, provider API keys, or raw localStorage contents; mock/stub labels must not imply live building or repository operations.

## Tasks

- [x] **T01: Add a branded no-blank HTML fallback shell** `est:1h`
  Expected skills: frontend-design, accessibility, react-best-practices, verify-before-complete.
  - Files: ``apps/web/index.html``, ``apps/web/src/main.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/appShell.test.tsx``
  - Verify: npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx

- [x] **T02: Extract reusable shell, status, and mock-only UI primitives** `est:1h30m`
  Expected skills: frontend-design, make-interfaces-feel-better, accessibility, react-best-practices, verify-before-complete.
  - Files: ``apps/web/src/ui/primitives.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/appShell.test.tsx``
  - Verify: npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx

- [x] **T03: Wire primitives into App loading and error states** `est:2h`
  Expected skills: frontend-design, accessibility, react-best-practices, verify-before-complete.
  - Files: ``apps/web/src/App.tsx``, ``apps/web/src/ui/primitives.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/App.test.tsx``, ``apps/web/src/appShell.test.tsx``
  - Verify: npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx apps/web/src/App.test.tsx && npm --workspace @building-agent/web run build

## Files Likely Touched

- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/appShell.test.tsx`
- `apps/web/src/ui/primitives.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

---
estimated_steps: 24
estimated_files: 3
skills_used: []
---

# T02: Extract reusable shell, status, and mock-only UI primitives

Expected skills: frontend-design, make-interfaces-feel-better, accessibility, react-best-practices, verify-before-complete.

Extract the shared visual language into reusable React primitives that later login, project chooser, workspace, Markdown, and mock surface slices can consume instead of duplicating bespoke markup. Keep the primitives presentation-focused and mock-safe; do not introduce new backend calls, routing, or app state.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| Existing App props/API data | Render neutral empty/loading primitives instead of throwing | Not applicable; no async dependency in primitives | Guard optional fields like requestId/code and avoid rendering `undefined` text |

Load Profile:
- **Shared resources**: DOM/CSS only; no network, storage, or global event listeners.
- **Per-operation cost**: Trivial React rendering for small cards/badges/skeletons.
- **10x breakpoint**: Visual density and DOM size would degrade before compute; primitives should avoid timers and expensive effects.

Negative Tests:
- **Malformed inputs**: Render banners without `code`/`requestId`, empty states with simple strings, and badges with default labels.
- **Error paths**: Error banner uses `role="alert"`; non-error status/loading surfaces use `role="status"` or semantic sections.
- **Boundary conditions**: Long labels wrap without exposing secrets; mock-only badge vocabulary remains explicit.

Steps:
1. Create `apps/web/src/ui/primitives.tsx` with typed exports for brand/header shell pieces, `Banner`, `DiagnosticLine`, `MockOnlyBadge`, `LoadingSkeleton`, `EmptyState`, and reusable surface/card wrappers.
2. Move or mirror the existing `Banner`, `PlaceholderBadge`, and `EmptyState` behavior out of `apps/web/src/App.tsx` while preserving requestId/code rendering and redaction-safe text.
3. Add/update styles in `apps/web/src/styles.css` for the primitives: polished cards, badges, skeleton shimmer or static skeleton blocks, responsive spacing, and accessible focus/contrast.
4. Extend `apps/web/src/appShell.test.tsx` to render primitive examples and assert roles, diagnostic request IDs, default mock/stub label text, and absence of secret-like field names.

Must-haves:
- Later slices can import primitives from `apps/web/src/ui/primitives.tsx` rather than copying local components from `App.tsx`.
- Banner diagnostics render `code` and `requestId` when provided but never require or display token/API-key fields.
- Mock/stub-only badge vocabulary is reusable and visually distinct.
- Loading/skeleton primitives provide accessible status text and do not use timers or network state.

## Inputs

- ``apps/web/src/App.tsx` — existing local Banner, PlaceholderBadge, EmptyState, and shell patterns to preserve.`
- ``apps/web/src/styles.css` — existing class vocabulary and layout styles.`
- ``apps/web/src/appShell.test.tsx` — test file created by T01 to extend with primitive assertions.`

## Expected Output

- ``apps/web/src/ui/primitives.tsx` — reusable typed UI primitives for shell, banners, badges, skeletons, cards, and empty states.`
- ``apps/web/src/styles.css` — visual styles for the extracted primitives.`
- ``apps/web/src/appShell.test.tsx` — primitive behavior and accessibility assertions.`

## Verification

npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx

## Observability Impact

Signals added/changed: standardized `role="alert"`/`role="status"` rendering and diagnostic request-id lines move into shared primitives. How a future agent inspects this: import/render `apps/web/src/ui/primitives.tsx` in tests or inspect DOM roles in the browser. Failure state exposed: API/UI failures can consistently show bounded banners instead of ad hoc text.

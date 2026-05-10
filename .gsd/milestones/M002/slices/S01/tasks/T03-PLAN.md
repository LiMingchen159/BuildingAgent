---
estimated_steps: 26
estimated_files: 5
skills_used: []
---

# T03: Wire primitives into App loading and error states

Expected skills: frontend-design, accessibility, react-best-practices, verify-before-complete.

Wire the new primitives through the current App so the user-visible shell, saved-session bootstrap, async transitions, and error states are polished and bounded while existing login/project/chat behavior remains unchanged. This closes the slice by making the primitives real product UI rather than unused scaffolding.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| `/api/session` and `/api/projects` during saved-session bootstrap | Show bounded request-id-aware banner, clear auth only for auth failures, and render login/project state as appropriate | Existing fetch promise has no explicit timeout; UI remains in branded loading state until the request resolves | `apps/web/src/api.ts` raises `ApiClientError`/generic error; App shows safe fallback message without raw payload |
| `/api/registry`, `/api/projects/:id/management`, and `/api/projects/:id/chat` after project select | Keep selected project stable where appropriate and show bounded banner | Existing behavior remains; busy/loading text prevents silent blank regions | Show error banner and avoid rendering malformed management/chat data |

Load Profile:
- **Shared resources**: localStorage session key, global fetch, React state, and DOM rendering.
- **Per-operation cost**: Existing bootstrap performs up to3 API calls for restored sessions; project select performs select/chat/management calls as before.
- **10x breakpoint**: API latency or many cards/messages would affect perceived responsiveness first; skeletons/status states should make waiting diagnosable but not add more calls.

Negative Tests:
- **Malformed inputs**: Invalid stored session JSON clears safely; empty projects/messages show empty states.
- **Error paths**: Auth failure includes code/requestId and clears localStorage; non-auth API failure shows bounded banner without token leakage.
- **Boundary conditions**: No selected project renders project chooser, read-only project disables composer, mock/stub labels remain visible.

Steps:
1. Refactor `apps/web/src/App.tsx` to import and use primitives from `apps/web/src/ui/primitives.tsx` for shell/header, banners, badges, empty states, and loading/skeleton cards.
2. Replace the plain `Checking your saved session…` region with a branded loading skeleton/status that appears immediately during `bootstrapping` and documents the current safe phase.
3. Ensure async button/busy states remain bounded and accessible on login, project selection, and chat send; preserve current API calls and storage contract from `apps/web/src/api.ts`.
4. Update `apps/web/src/App.test.tsx` and `apps/web/src/appShell.test.tsx` to cover saved-session loading, invalid token request-id errors, mock/stub-only shell labels, provider diagnostic redaction, and the existing login → project selection → workspace path.
5. Run build and targeted tests; fix only regressions inside the S01 shell/primitives scope.

Must-haves:
- App rendering actually uses the primitives created in T02.
- Saved-session bootstrap visibly shows a branded skeleton/status instead of a plain card or blank screen.
- Existing M001 auth/session/project/chat regression tests continue passing.
- No new live operational route, scheduler, repository action, RAG, MCP, BIM/Brick/time-series, or building-control affordance is added.

## Inputs

- ``apps/web/src/App.tsx` — current login/project/workspace state machine and local components.`
- ``apps/web/src/api.ts` — existing API client and error contract that must not change in this slice.`
- ``apps/web/src/ui/primitives.tsx` — primitives created by T02.`
- ``apps/web/src/App.test.tsx` — existing regression suite for M001 Web behavior.`
- ``apps/web/src/appShell.test.tsx` — S01 shell/primitives verification from T01/T02.`

## Expected Output

- ``apps/web/src/App.tsx` — App composed with shared primitives and branded bounded loading/error states.`
- ``apps/web/src/styles.css` — final polish and responsive styles for App usage of primitives.`
- ``apps/web/src/App.test.tsx` — regression tests updated for new shell/loading semantics while preserving M001 behavior.`
- ``apps/web/src/appShell.test.tsx` — slice-level shell/primitives verification updated for integrated App behavior.`

## Verification

npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx apps/web/src/App.test.tsx && npm --workspace @building-agent/web run build

## Observability Impact

Signals added/changed: App-level bootstrap and async phases become inspectable through shared status/skeleton primitives, and all errors continue through shared request-id-aware banners. How a future agent inspects this: run the targeted Vitest command, search DOM for status/alert roles, or visually open the Vite app. Failure state exposed: auth/session/API failures surface phase-specific safe messages and diagnostics instead of empty regions.

---
estimated_steps: 24
estimated_files: 9
skills_used: []
---

# T02: Wire React Web login, project selection, and chat workspace to the API

Build the real Web UI vertical flow against the API contract from T01. The UI should not use mocked-only state for the main path: it should call the API client, store the local dev token in browser state, route guarded screens through session/project checks, and render clear failure states.

Skills expected: `react-best-practices`, `frontend-design`, `accessibility`, `tdd`, `verify-before-complete`.

Why: The milestone demo requires a seeded user to log in through the real Web UI, select a project, and reach a protected project-scoped chat workspace; this task closes the user-facing portion of S01.

Do:
1. Create the Vite React app package in `apps/web` with TypeScript, Vitest, jsdom, and Testing Library.
2. Implement `apps/web/src/api.ts` as the only browser API client for login, session, project listing/selection, and chat; preserve the backend error code/message/requestId shape for UI diagnostics.
3. Implement `apps/web/src/App.tsx` with a simple modern product shell: login form, project selection screen, protected chat workspace, and explicit unauthenticated/forbidden/error banners.
4. Implement `apps/web/src/main.tsx`, `apps/web/src/styles.css`, and any small component/state helpers needed to keep the UI understandable and keyboard-accessible.
5. Write `apps/web/src/App.test.tsx` using mocked `fetch` at the network boundary (not mocked components) to verify login -> project selection -> chat, redirect/guard when unauthenticated, display of forbidden/API errors, and that chat calls include the selected project id.
6. Update `README.md` with concise S01 local run instructions, seeded credentials, API/Web dev commands, and verification commands; clearly state production auth/SSO is out of scope and no anonymous paths are provided.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Local API `fetch` | Render actionable error banner and keep user on safe screen | Abort or surface a retryable local API unavailable message | Render `api_malformed`-style fallback without crashing |
| Stored token/session state | Clear invalid token and return to login on 401 | Not applicable | Treat as unauthenticated |
| Project selection/chat API | Show project/chat error with request id when present; do not mutate optimistic chat on failure | Surface retryable message | Preserve current project state and show failure banner |

Load Profile (Q6):
- **Shared resources**: browser state/localStorage/sessionStorage if used; API client fetch calls.
- **Per-operation cost**: one API call per login/session/project/chat action; chat list render is small and local for M001.
- **10x breakpoint**: long chat histories would impact client render first; keep component boundaries ready for later virtualization but do not overbuild now.

Negative Tests (Q7):
- **Malformed inputs**: empty login fields, blank chat message, missing selected project, malformed API JSON.
- **Error paths**: 401 returns to login, 403 project selection/chat shows forbidden, network failure shows local API unavailable.
- **Boundary conditions**: selected project id is required for chat requests and is visible in workspace title/state; no chat UI is usable before authentication and selection.

## Inputs

- ``apps/api/src/server.ts` — endpoint paths, request/response shapes, and error codes from T01.`
- ``apps/api/src/auth.ts` — canonical auth/project error shape from T01.`
- ``apps/api/src/seed.ts` — seeded local credential/project names for README and tests.`
- ``package.json` — root workspace scripts from T01.`
- ``README.md` — existing README to expand with local run guidance.`

## Expected Output

- ``apps/web/package.json` — Web package scripts and dependencies.`
- ``apps/web/tsconfig.json` — Web TypeScript config.`
- ``apps/web/index.html` — Vite HTML entrypoint.`
- ``apps/web/src/api.ts` — typed API client matching T01 backend contract.`
- ``apps/web/src/App.tsx` — login, project selection, and project-scoped chat UI.`
- ``apps/web/src/main.tsx` — React app bootstrap.`
- ``apps/web/src/styles.css` — accessible local product shell styles.`
- ``apps/web/src/App.test.tsx` — Web flow and guard tests.`
- ``README.md` — S01 local run and verification instructions.`

## Verification

`npm test -- --run apps/web/src/App.test.tsx`, `npm run typecheck`, and `npm run build` pass.

## Observability Impact

Adds browser-visible failure diagnostics for auth/API/project/chat failures and preserves backend request ids in error banners when available. Future agents can reproduce Web failures with `apps/web/src/App.test.tsx` or by running the dev server and reading the UI state.

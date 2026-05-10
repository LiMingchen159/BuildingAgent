---
id: T02
parent: S01
milestone: M001
key_files:
  - package.json
  - scripts/run-tests.cjs
  - apps/web/package.json
  - apps/web/tsconfig.json
  - apps/web/vite.config.ts
  - apps/web/index.html
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/main.tsx
  - apps/web/src/styles.css
  - apps/web/src/test/setup.ts
  - apps/web/src/App.test.tsx
  - README.md
key_decisions:
  - Built the Web UI as a real React/Vite app with a typed API client instead of mocked-only component state on the main flow.
  - Preserved backend error codes and request ids in browser-facing banners so auth/project failures remain diagnosable without leaking tokens.
  - Kept the client-side session minimal: token plus minimal user/project identifiers in browser storage, with guarded rehydration through `/api/session` and `/api/projects`.
  - Added workspace-aware root test forwarding so the required root verification command can run the Web test file through the correct workspace runner.
duration: 
verification_result: passed
completed_at: 2026-05-10T10:03:38.105Z
blocker_discovered: false
---

# T02: Built the seeded React/Vite Web UI for login, project selection, and protected project chat against the real API.

**Built the seeded React/Vite Web UI for login, project selection, and protected project chat against the real API.**

## What Happened

Implemented the real Web vertical slice for seeded local login, project selection, and project-scoped chat. I added the Vite/React workspace, a typed browser API client for login/session/projects/chat, a guarded app shell with explicit login/project/chat states, and accessible styles and bootstrap files. The UI persists only the seeded token and minimal user/project identifiers, rehydrates session state on load, and preserves backend request ids and canonical error codes in visible banners. I also wrote network-boundary tests that cover the happy path, unauthenticated guarding, forbidden API responses, malformed JSON, local API outages, blank inputs, and read-only project behavior. The initial test and typecheck runs exposed query and exact-optional typing issues, which I fixed before rerunning the full verification set.

## Verification

Verified the Web slice end-to-end with the required commands: `npm test -- --run apps/web/src/App.test.tsx` passed after fixing the initial test query issues; `npm run typecheck` passed for both API and Web workspaces; and `npm run build` produced the production Web bundle successfully. The Web tests used mocked `fetch` only at the network boundary so the real API client and guarded UI flow were exercised. The final checks confirmed request-id-bearing error banners, guarded auth/project transitions, and selected-project chat requests that include the project id.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/web/src/App.test.tsx` | 0 | ✅ pass | 59133ms |
| 2 | `npm run typecheck` | 0 | ✅ pass | 14679ms |
| 3 | `npm run build` | 0 | ✅ pass | 16701ms |

## Deviations

None beyond a small root test runner adjustment: I replaced the API-only forwarding shim with a workspace-aware `scripts/run-tests.cjs` so the required `npm test -- --run apps/web/src/App.test.tsx` command can target the Web workspace correctly while preserving the API path support from T01.

## Known Issues

The Web client currently assumes the local API is available on `127.0.0.1:3000` unless `VITE_API_BASE_URL` is set. That is intentional for this slice, but it means a missing API server will surface as an `api_unavailable` banner rather than a silent fallback.

## Files Created/Modified

- `package.json`
- `scripts/run-tests.cjs`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/test/setup.ts`
- `apps/web/src/App.test.tsx`
- `README.md`

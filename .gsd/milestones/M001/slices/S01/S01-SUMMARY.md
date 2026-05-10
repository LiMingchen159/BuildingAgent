---
id: S01
parent: M001
milestone: M001
provides:
  - Authenticated local Web/API foundation with seeded login.
  - Session context contract with userId, projectId, and permissions.
  - Project-selection API contract reusable by CLI and later Web management pages.
  - Project-scoped chat API/UI shell and in-memory project-keyed message store.
  - Canonical protected-route error/diagnostic envelope with request ids.
  - Workspace/test/build foundation for later M001 slices.
requires:
  []
affects:
  - S02
  - S03
key_files:
  - package.json
  - package-lock.json
  - tsconfig.base.json
  - scripts/run-tests.cjs
  - apps/api/package.json
  - apps/api/tsconfig.json
  - apps/api/src/seed.ts
  - apps/api/src/auth.ts
  - apps/api/src/server.ts
  - apps/api/src/index.ts
  - apps/api/src/auth.test.ts
  - apps/api/src/chat.test.ts
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
  - .gsd/PROJECT.md
  - .gsd/REQUIREMENTS.md
key_decisions:
  - Use Fastify injection-driven HTTP contract tests for the API auth/project/chat contract.
  - Return canonical machine-readable API errors with request ids for auth/project/chat denial modes.
  - Keep seeded auth and chat memory process-local and development-only with bounded list responses and capped chat history.
  - Build the Web UI as a real React/Vite app wired through a typed API client rather than mocked-only UI state.
  - Preserve backend error codes and request ids in browser-visible banners without rendering or logging bearer tokens.
  - Use workspace-aware root test forwarding so root commands can target API or Web test files.
patterns_established:
  - Backend checks, not browser state, are the source of truth for auth, project membership, selected-project state, and permissions.
  - All downstream protected surfaces should preserve the S01 session shape: userId, projectId, and permissions.
  - Canonical API error envelopes with request ids are the diagnostic contract for UI/CLI surfaces.
  - Root verification commands should use scripts/run-tests.cjs to dispatch API/Web test paths into the correct workspace.
  - Seeded local auth is a development fixture and must be guarded before non-local exposure.
observability_surfaces:
  - GET /health returns service ok state plus requestId.
  - All structured API error responses include error.code, error.message, and error.requestId.
  - Protected denial modes are separately test-covered: auth_missing, auth_invalid, project_forbidden, project_not_selected, permission_denied, and chat_invalid/internal validation paths.
  - The Web UI renders actionable error banners including backend request ids/codes and local api_unavailable failures.
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-10T10:14:48.365Z
blocker_discovered: false
---

# S01: Authenticated web foundation and project-scoped chat

**S01 delivered the local authenticated Web/API foundation: seeded login, authorized project selection, backend-enforced project isolation, and project-scoped chat all pass tests, typecheck, and build.**

## What Happened

S01 delivered the first runnable BuildingAgent vertical foundation. The backend is now a TypeScript Fastify API with seeded local users, bearer-token authentication, in-memory sessions, per-project memberships/permissions, selected-project state, bounded project/message responses, and project-keyed chat memory. Protected endpoints attach session context containing userId, projectId, and permissions before returning project/session/chat data or accepting chat messages. Denial modes are intentionally distinct and observable through machine-readable error codes and request ids.

The Web surface is now a real React/Vite app wired to that API through a typed client. It provides the seeded login screen, guarded session rehydration, authorized project selection, and a project-scoped chat workspace. The UI sends selected project ids to the backend, preserves backend request ids/error codes in visible banners, handles local API outage/malformed response states, prevents blank chat submission, and surfaces read-only project behavior. The main path is not mocked-only; tests mock fetch only at the network boundary while exercising the real client and app state transitions.

The slice also established the root npm workspace, TypeScript configurations, workspace-aware test forwarding, README local-run instructions, and durable project notes. Security review found no direct auth bypass or projectId tampering path in the current local scope. It did identify non-blocking local-dev risks around public seeded credentials, permissive CORS, localStorage token persistence, and dependency audit findings; these must be addressed before any shared/non-loopback demo or production interpretation.

## Verification

Fresh slice verification passed on 2026-05-10 with the required commands: `npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` passed 10 API tests; `npm test -- --run apps/web/src/App.test.tsx` passed 7 Web tests; `npm run typecheck` passed for API and Web workspaces; `npm run build` compiled the API and produced the Web production bundle. Additional inspection confirmed `/health`, canonical API error codes, README local-run instructions, and browser-facing diagnostic patterns. A security subagent review found no direct auth bypass or projectId tampering path for strict local scope and recorded non-blocking hardening follow-ups for non-local exposure.

## Requirements Advanced

- R001 — S01 proves the Web UI portion of all-user-facing auth; CLI and gateways remain for S03/S02.
- R009 — S01 creates the React/Vite login, project selection, and chat shell; management pages remain for S02.
- R013 — S01 verifies local backend and Web package tests/typecheck/build; CLI and full smoke checks remain for S03.
- R014 — README now explains S01 local backend/Web run path, seeded credentials, and verification commands; CLI/provider/smoke docs remain for later slices.

## Requirements Validated

- R002 — Validated by S01 Web/API flow and tests: a signed-in seeded user can list authorized projects, select a project, and enter/send messages in the project-scoped chat workspace.
- R003 — Validated by API contract tests and full verification: missing/invalid tokens, forbidden project selection, missing selected project, read/write permission checks, and backend-side project membership enforcement all pass.
- R004 — Validated by chat/project-isolation tests: messages are stored and read by project boundary and users cannot select or chat in projects where they lack membership.

## New Requirements Surfaced

- Before any shared demo or non-loopback run, seeded local auth must fail closed unless explicitly allowed and CORS must be restricted to trusted local Web origins.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

The slice remained within the planned Web/API scope. A security review found non-blocking local-dev limitations: seeded credentials/tokens are public fixtures, CORS is currently permissive, localStorage is used for the seeded bearer token, and dependency audit findings remain. Source edits are not allowed in the complete-slice lane, so these are recorded as follow-ups for a future execute task before any shared/non-loopback demo.

## Known Limitations

S01 is local-development auth only: seeded credentials/tokens are public fixtures, not production identity. The API defaults to 127.0.0.1, but if it is intentionally exposed with HOST=0.0.0.0 the documented seeded users become real remote credentials. The current API CORS configuration reflects arbitrary origins, which is acceptable only for strict local use and should be tightened before any shared demo. The Web stores the seeded bearer token in localStorage for local session restore; future production auth should use a safer session mechanism. npm audit findings remain in the current dependency tree and should be remediated before external deployment. S01 chat is a local in-memory echo/user-message store, not yet the real runtime/provider path required later in M001.

## Follow-ups

Before any shared demo or non-loopback run, add a runtime guard that refuses seeded auth outside explicit local/dev mode and restrict CORS to known local Web origins. Plan dependency upgrade/remediation for current npm audit findings before treating the stack as production-clean. S02 should reuse the S01 auth/session/project boundary for registry, gateway, and building-domain placeholder surfaces. S03 should reuse the same login/project-selection contract for the CLI and smoke checks.

## Files Created/Modified

- `package.json, package-lock.json, tsconfig.base.json, scripts/run-tests.cjs` — Root npm workspace, scripts, package lock, and TypeScript base config for API/Web workspaces and workspace-aware test forwarding.
- `apps/api/src/*` — Fastify API seed data, auth helpers, server routes, startup entrypoint, and auth/chat contract tests.
- `apps/web/*` — React/Vite Web app, typed API client, guarded login/project/chat UI, styles, test setup, and App tests.
- `README.md` — Local development run and verification instructions for the S01 vertical slice.
- `.gsd/PROJECT.md` — Project state refreshed to note S01 completion and foundation patterns.
- `.gsd/REQUIREMENTS.md` — Requirements R002, R003, and R004 marked validated with S01 evidence.

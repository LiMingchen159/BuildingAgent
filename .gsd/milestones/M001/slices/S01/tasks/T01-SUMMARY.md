---
id: T01
parent: S01
milestone: M001
key_files:
  - package.json
  - package-lock.json
  - tsconfig.base.json
  - scripts/run-api-tests.cjs
  - apps/api/package.json
  - apps/api/tsconfig.json
  - apps/api/src/seed.ts
  - apps/api/src/auth.ts
  - apps/api/src/server.ts
  - apps/api/src/index.ts
  - apps/api/src/auth.test.ts
  - apps/api/src/chat.test.ts
  - apps/web/package.json
key_decisions:
  - Use Fastify injection-driven HTTP contract tests for auth/project/chat behavior.
  - Return canonical machine-readable errors with request ids for auth_missing, auth_invalid, project_forbidden, project_not_selected, and chat_invalid.
  - Keep seeded auth and chat memory explicitly process-local and development-only, with bounded project/message responses and capped stored chat messages.
duration: 
verification_result: passed
completed_at: 2026-05-10T09:46:49.176Z
blocker_discovered: false
---

# T01: Implemented the tested Fastify auth, project permission, and project-scoped chat API contract.

**Implemented the tested Fastify auth, project permission, and project-scoped chat API contract.**

## What Happened

Created the npm workspace foundation, API TypeScript config, and package scripts. Wrote Fastify injection contract tests for seeded login/session/projects, bearer-token failure modes, forbidden project selection, selected-project enforcement, chat validation, permission checks, bounded chat reads, and project/user memory isolation. Implemented the minimal Fastify API with an in-memory seeded store, bearer authentication helpers, per-request ids, stable error bodies, bounded list responses, and capped per-project chat history. Fixed the root test script so the exact task verification command works from the repository root, then resolved a strict TypeScript narrowing issue in project selection.

## Verification

Verified with the required API contract test command and TypeScript typecheck. `npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` passed 10 tests across `auth.test.ts` and `chat.test.ts`; `npm run typecheck` passed with `tsc --noEmit`. Observability was verified through contract assertions on `/health` request ids and canonical error codes in auth/project/chat failure responses.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` | 0 | ✅ pass | 11815ms |
| 2 | `npm run typecheck` | 0 | ✅ pass | 6817ms |

## Deviations

Added `scripts/run-api-tests.cjs` so the required root verification command can forward `apps/api/...` test paths into the API workspace without npm treating them as script names. Added a minimal `apps/web/package.json` placeholder to make the declared npm workspace concrete; no Web UI runtime was implemented in this backend task.

## Known Issues

`npm install` reported 10 dependency audit findings (5 moderate, 5 high) from the initial Fastify/Vitest toolchain. They were not remediated in this task because the verification contract was focused on functional API behavior and type safety.

## Files Created/Modified

- `package.json`
- `package-lock.json`
- `tsconfig.base.json`
- `scripts/run-api-tests.cjs`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/seed.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/server.ts`
- `apps/api/src/index.ts`
- `apps/api/src/auth.test.ts`
- `apps/api/src/chat.test.ts`
- `apps/web/package.json`

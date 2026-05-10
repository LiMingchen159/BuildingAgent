---
estimated_steps: 24
estimated_files: 10
skills_used: []
---

# T01: Implement tested auth, project permission, and chat API contract

Create the TypeScript npm workspace and implement the backend contract that all later surfaces trust. This task should use TDD: establish the test runner first, write API contract tests for auth/project/chat behavior, then implement the minimal Fastify server and in-memory seeded store that makes them pass.

Skills expected: `tdd`, `api-design`, `security-review`, `verify-before-complete`.

Why: S01's highest-risk boundary is backend enforcement. The Web UI and future CLI/registry/gateway slices must be unable to bypass authentication, project membership, or permission checks.

Do:
1. Create root npm workspace files and TypeScript/Vitest configuration for `apps/api` and `apps/web` without adding Streamlit or untracked fixtures.
2. Implement `apps/api/src/seed.ts` with local seeded users, tokens, projects, memberships, and empty per-project chat memory; keep this explicitly development-only.
3. Implement `apps/api/src/auth.ts` route/pre-handler helpers that parse bearer tokens, attach session context (`userId`, `projectId`, `permissions`), and return canonical error responses with request ids.
4. Implement `apps/api/src/server.ts` endpoints: `GET /health`, `POST /api/login`, `GET /api/session`, `GET /api/projects`, `POST /api/projects/:projectId/select`, `GET /api/projects/:projectId/chat`, and `POST /api/projects/:projectId/chat`.
5. Write `apps/api/src/auth.test.ts` and `apps/api/src/chat.test.ts` as public HTTP-contract tests through Fastify injection; cover successful login/session/projects, missing/invalid auth, forbidden project selection, chat before/after selection, invalid chat input, and project-memory isolation.
6. Keep all list responses bounded even with in-memory fixtures, use honest HTTP status codes, and use a stable error shape `{ error: { code, message, requestId } }`.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Authorization header / seeded token | Return 401 `auth_missing` or `auth_invalid`; never enter protected handler | Not applicable for in-memory local auth | Return 401 `auth_invalid` |
| Project membership lookup | Return 403 `project_forbidden` before reading/writing chat memory | Not applicable for in-memory store | Treat unknown/missing project as 404/403 without leaking other project data |
| Chat body parsing | Return 400/422 with `chat_invalid` before mutation | Not applicable | Return 400/422 `chat_invalid` |

Load Profile (Q6):
- **Shared resources**: process-local in-memory seeded store and chat arrays.
- **Per-operation cost**: O(number of seeded memberships/projects) lookup plus one in-memory append/read; no external network/DB.
- **10x breakpoint**: memory growth from unbounded chat history would break first; cap or structure fixtures so tests prove bounded local behavior where practical.

Negative Tests (Q7):
- **Malformed inputs**: missing Authorization, malformed bearer header, empty credentials, unknown token, empty chat body, wrong JSON shape, blank/oversized chat message.
- **Error paths**: unauthorized session/projects/chat, forbidden project id, chat against a project not selected or not joined.
- **Boundary conditions**: user with one project cannot read/write another project's memory; selected project id must be rechecked for each protected operation.

## Inputs

- ``README.md` — existing repository starting point and local project name.`
- ``.gitignore` — confirm generated dependency/build outputs remain ignored, not used as test fixtures.`

## Expected Output

- ``package.json` — root workspace scripts for test/typecheck/build/dev commands.`
- ``tsconfig.base.json` — shared TypeScript compiler settings.`
- ``apps/api/package.json` — API package scripts and dependencies.`
- ``apps/api/tsconfig.json` — API TypeScript config.`
- ``apps/api/src/seed.ts` — seeded local users, projects, memberships, permissions, and chat memory fixtures.`
- ``apps/api/src/auth.ts` — auth/session/project permission helpers and error response utilities.`
- ``apps/api/src/server.ts` — Fastify app factory and S01 API endpoints.`
- ``apps/api/src/index.ts` — local API dev entrypoint.`
- ``apps/api/src/auth.test.ts` — auth/session/project API contract tests.`
- ``apps/api/src/chat.test.ts` — project-scoped chat and isolation tests.`

## Verification

`npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` and `npm run typecheck` pass.

## Observability Impact

Adds the first API diagnostics contract: request ids, canonical error codes, `/health`, and distinguishable auth/project/chat failure states. Future agents inspect failures via API responses and the named Vitest cases without needing raw token logs.

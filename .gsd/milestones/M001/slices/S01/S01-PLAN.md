# S01: Authenticated web foundation and project-scoped chat

**Goal:** Create the first runnable vertical foundation: a local TypeScript API that enforces seeded authentication, RBAC-style project permissions, and project isolation, plus a React/Vite Web UI where a seeded user logs in, selects an authorized project, and reaches a project-scoped chat workspace.
**Demo:** After this, a seeded local user can log in through the real Web UI, choose a project, and reach a protected project-scoped chat workspace; unauthorized access is blocked by the backend.

## Must-Haves

- ## Must-Haves
- Seeded local auth exists with documented development credentials/tokens only; no anonymous Web or API chat/project path is available.
- Backend protected endpoints attach and enforce session context containing `userId`, `projectId`, and `permissions` before returning projects or accepting chat messages.
- A signed-in seeded user can list authorized projects, select one, and send a chat message scoped to that project.
- Project isolation is test-proven: a user cannot select or chat in a project they are not a member of, and project memory/messages are keyed by project boundary.
- React/Vite Web UI provides real login, project selection, and project-scoped chat workspace screens wired to the local API, not mocked-only placeholders.
- ## Threat Surface
- **Abuse**: Missing/replayed/forged bearer token, projectId parameter tampering, attempting to chat before project selection, and privilege escalation by selecting another user's project.
- **Data exposure**: Seeded local user/project ids and chat messages are accessible only to authenticated users with project membership; bearer tokens must never be rendered except as internal client state or logged.
- **Input trust**: Login credentials and chat messages are untrusted browser input reaching API handlers and in-memory stores; project ids from routes/body/local state are untrusted until backend membership checks pass.
- ## Requirement Impact
- **Requirements touched**: R001, R002, R003, R004, R009, R013; honors out-of-scope R021, R022, R026.
- **Re-verify**: login flow, unauthorized API rejection, forbidden project access, chat project scoping, Web route guards/error states, and non-Streamlit UI implementation.
- **Decisions revisited**: D003 is honored; D004 establishes the local monorepo/API/Web skeleton and may be revisited if a later slice needs different packaging.
- ## Verification
- `npm test -- --run` runs `apps/api/src/auth.test.ts`, `apps/api/src/chat.test.ts`, and `apps/web/src/App.test.ts` with real assertions covering login, unauthorized/forbidden access, project selection, and project-scoped chat.
- `npm run typecheck` verifies shared TypeScript contracts across `apps/api` and `apps/web`.
- `npm run build` verifies both packages compile for local use.
- Manual demo command: run `npm run dev:api` and `npm run dev:web`, log in as the seeded local user, select an authorized project, and send a chat message that displays the selected project name.
- ## Observability / Diagnostics
- Runtime signals: structured API error responses include `{ error: { code, message, requestId } }`; protected handlers can be traced by request id without exposing bearer tokens.
- Inspection surfaces: `GET /health`, `GET /api/session`, browser-visible login/project/chat error banners, and automated tests for denial modes.
- Failure visibility: missing auth, invalid auth, missing project context, forbidden project, and invalid chat input use distinct status codes/error codes.
- Redaction constraints: do not log raw Authorization headers, seeded passwords, or chat message bodies as diagnostics.

## Proof Level

- This slice proves: This slice proves local integration between the real Web UI and the real local API for the authenticated Web happy path and core auth/project-isolation failures. Real runtime required: yes for manual/demo verification; automated proof is primarily Vitest/jsdom/API contract tests. Human/UAT required: no, but a browser run can demonstrate the flow.

## Integration Closure

Upstream surfaces consumed: existing `README.md`, `.gitignore`, and GSD requirement/roadmap contracts. New wiring introduced: npm workspace root composes `apps/api` and `apps/web`; the Web UI calls the real local API contract for login, session, project listing, project selection, and chat; backend route guards attach `userId`, `projectId`, and permissions before protected handlers run. What remains before M001 is fully end-to-end: S02 must add authenticated registry/gateway/building-domain placeholder pages; S03 must add the CLI entrypoint and full local smoke script/README verification.

## Verification

- Runtime signals: every protected API request should have a request id and auth/project-denial responses with machine-readable error codes, without logging tokens. Inspection surfaces: API health/session responses, test assertions, and visible Web UI auth/chat states. Failure visibility: auth failures distinguish missing token, invalid token, missing project selection, and forbidden project access; Web UI renders actionable error states. Redaction constraints: seeded token values and user identifiers must not be logged in plaintext beyond safe local fixture ids.

## Tasks

- [x] **T01: Implement tested auth, project permission, and chat API contract** `est:2h`
  Create the TypeScript npm workspace and implement the backend contract that all later surfaces trust. This task should use TDD: establish the test runner first, write API contract tests for auth/project/chat behavior, then implement the minimal Fastify server and in-memory seeded store that makes them pass.
  - Files: ``package.json``, ``tsconfig.base.json``, ``apps/api/package.json``, ``apps/api/tsconfig.json``, ``apps/api/src/seed.ts``, ``apps/api/src/auth.ts``, ``apps/api/src/server.ts``, ``apps/api/src/index.ts``, ``apps/api/src/auth.test.ts``, ``apps/api/src/chat.test.ts``
  - Verify: `npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` and `npm run typecheck` pass.

- [ ] **T02: Wire React Web login, project selection, and chat workspace to the API** `est:2h`
  Build the real Web UI vertical flow against the API contract from T01. The UI should not use mocked-only state for the main path: it should call the API client, store the local dev token in browser state, route guarded screens through session/project checks, and render clear failure states.
  - Files: ``apps/web/package.json``, ``apps/web/tsconfig.json``, ``apps/web/index.html``, ``apps/web/src/api.ts``, ``apps/web/src/App.tsx``, ``apps/web/src/main.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/App.test.tsx``, ``README.md``
  - Verify: `npm test -- --run apps/web/src/App.test.tsx`, `npm run typecheck`, and `npm run build` pass.

## Files Likely Touched

- `package.json`
- `tsconfig.base.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/seed.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/server.ts`
- `apps/api/src/index.ts`
- `apps/api/src/auth.test.ts`
- `apps/api/src/chat.test.ts`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/index.html`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`
- `README.md`

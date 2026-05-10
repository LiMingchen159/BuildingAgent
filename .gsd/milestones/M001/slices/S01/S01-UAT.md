# S01: Authenticated web foundation and project-scoped chat — UAT

**Milestone:** M001
**Written:** 2026-05-10T10:14:48.375Z

# S01 UAT: Authenticated Web Foundation and Project-Scoped Chat

## UAT Type

Local functional acceptance test for the S01 Web/API vertical slice. This UAT validates the seeded local Web login → project selection → project-scoped chat path and core backend denial behavior using the local Fastify API and React/Vite UI.

## Preconditions

- Dependencies are installed with `npm install`.
- The API is running with `npm run dev:api` and listening on `http://127.0.0.1:3000`.
- The Web UI is running with `npm run dev:web` and can reach the API through the Vite proxy or configured `VITE_API_BASE_URL`.
- Use only seeded local accounts; do not use real passwords or real building data.

## Test Case 1 — API health and request-id signal

1. Open `http://127.0.0.1:3000/health` or request it with an HTTP client.
2. Expected: response is successful and contains `ok: true`, `service: building-agent-api`, and a `requestId` value.

## Test Case 2 — Seeded Web login

1. Open the local Vite Web URL.
2. Verify the login screen is shown before any project or chat workspace is accessible.
3. Sign in with `ada@example.test` / `local-dev-password`.
4. Expected: login succeeds, no bearer token is rendered on screen, and the project selection screen appears.

## Test Case 3 — Authorized project selection

1. From Ada's project list, select `Alpha Build`.
2. Expected: the app enters the chat workspace and displays the selected project name.
3. Expected: the backend session now includes Ada's user id, selected project id, and Alpha permissions.

## Test Case 4 — Project-scoped chat happy path

1. In `Alpha Build`, enter a non-empty chat message such as `Check project isolation smoke`.
2. Submit the message.
3. Expected: the message appears in the chat transcript for `Alpha Build`.
4. Expected: request succeeds only after the project has been selected and the project id is included in the chat API route.

## Test Case 5 — Unauthorized API rejection

1. Request `GET /api/projects` without an Authorization bearer token.
2. Expected: request is rejected with a structured error containing code `auth_missing` and a `requestId`.
3. Request the same endpoint with an invalid bearer token.
4. Expected: request is rejected with code `auth_invalid` and a `requestId`.

## Test Case 6 — Forbidden project access

1. Log in as Ada.
2. Attempt to select or chat in Grace's `Gamma Build` project by directly calling the project API with Ada's token.
3. Expected: the backend rejects the request with `project_forbidden`; the UI/API must not expose Gamma chat messages to Ada.

## Test Case 7 — Selected-project enforcement

1. Log in as Ada but do not select a project, or select `Alpha Build` and then call the chat endpoint for a different project.
2. Expected: chat access is rejected with `project_not_selected` rather than trusting the browser-provided project id alone.

## Test Case 8 — Read-only permission behavior

1. Log in as Ada and select `Beta Build`, where Ada has read-only access.
2. Attempt to send a chat message.
3. Expected: the backend rejects write access with a permission-denial response and request id; the Web UI shows an actionable error banner.

## Test Case 9 — Invalid chat input

1. Select an authorized writable project.
2. Attempt to submit a blank or whitespace-only chat message.
3. Expected: the UI prevents or the backend rejects the message; no empty message is added to project chat.
4. Attempt to submit a message longer than 1000 characters through the API.
5. Expected: response has code `chat_invalid` and a request id.

## Not Proven By This UAT

- Production authentication, SSO, password reset, invitations, token expiry, or secure cookie sessions.
- Safety of exposing the seeded-auth API outside loopback or a developer machine.
- Runtime/model-provider integration; S01 chat is still the local project-scoped chat foundation, not the final real-provider path.
- CLI authentication/project/chat parity; this is deferred to S03.
- Registry, gateway, building-domain placeholder pages, and management surfaces; these are deferred to S02.
- Performance, load behavior, persistence across process restarts, or multi-user concurrency beyond seeded local contract tests.


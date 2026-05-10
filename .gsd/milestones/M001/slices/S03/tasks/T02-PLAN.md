---
estimated_steps: 1
estimated_files: 5
skills_used: []
---

# T02: Wire seeded login, session, project, and chat commands to the API

Implement the authenticated CLI command path against the real API: login stores the bearer token and API base URL, and session, projects, use, chat, and chat:list reuse the saved token and selected project in fresh processes. Keep canonical API errors intact so missing auth, forbidden project selection, and blank chat input fail closed with request ids instead of vague local errors.

## Inputs

- ``apps/api/src/server.ts``
- ``apps/api/src/auth.ts``
- ``apps/api/src/seed.ts``
- ``apps/cli/src/config.ts``

## Expected Output

- ``apps/cli/src/api.ts``
- ``apps/cli/src/commands.ts``
- ``apps/cli/src/index.ts``
- ``apps/cli/src/commands.test.ts``
- ``apps/cli/src/config.ts``

## Verification

`npm test -- --run apps/cli/src/commands.test.ts`

## Observability Impact

Preserve request ids and backend error codes in CLI failures, and expose the last failing command plus selected-project state so future agents can tell whether the problem was authentication, membership, or chat input validation.

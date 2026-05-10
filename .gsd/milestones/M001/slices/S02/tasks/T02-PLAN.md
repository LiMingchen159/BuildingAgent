---
estimated_steps: 29
estimated_files: 5
skills_used: []
---

# T02: Build Web management panels from the registry contracts

Wire the S02 backend contracts into the React/Vite Web app as real authenticated management pages. The UI should extend the selected-project workspace rather than replacing S01 chat: users should be able to inspect runtime/provider/tool/skill placeholders, project gateway placeholders, and synthetic building-domain capabilities while still seeing and using the project-scoped chat shell.

Steps:
1. Extend `apps/web/src/api.ts` with typed `getRegistry(token)` and `getProjectManagement(token, projectId)` client methods that validate `limit`, `placeholderOnly`, item arrays, and `requestId`, while preserving existing `ApiClientError` behavior.
2. Refactor `apps/web/src/App.tsx` just enough to add selected-project navigation/tabs or panels for Chat, Platform Registry, Gateways, and Building Domain; fetch registry/management data after project selection and during bootstrap when a stored selected project is restored.
3. Render explicit placeholder-only copy/status badges so stakeholders cannot mistake the page for a live integration; keep backend request ids/codes visible in banners when registry or management fetches fail.
4. Update `apps/web/src/styles.css` for the new management panels without disrupting the existing login/project/chat layout.
5. Expand `apps/web/src/App.test.tsx` to cover the authenticated management-page happy path, preservation of the S01 chat flow, read-only project behavior, API failure diagnostics for registry/management calls, and malformed registry/management payload handling.

Must-haves:
- [ ] Web management panels are driven by `apps/web/src/api.ts` calls, not hard-coded-only UI state.
- [ ] Placeholder registry, gateway, and building-domain data is visible after selecting an authorized project.
- [ ] Registry/management failures show requestId-aware banners and do not clear auth unless the failure is an auth failure.
- [ ] Existing login, project selection, chat send, read-only project, malformed JSON, and local API outage tests remain green.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `/api/registry` | Show requestId/code banner; keep selected project and chat shell usable unless auth failed | Existing request timeout becomes `api_unavailable` banner | Throw `api_malformed` and show banner without crashing |
| `/api/projects/:projectId/management` | Show requestId/code banner; keep selected project and chat shell usable unless auth failed | Existing request timeout becomes `api_unavailable` banner | Throw `api_malformed` and show banner without crashing |

Load Profile:
- **Shared resources**: browser state and two additional GET requests after project selection/bootstrap.
- **Per-operation cost**: one registry fetch and one project management fetch per selected project load, plus existing session/projects/chat fetches.
- **10x breakpoint**: extra local requests are acceptable for M001; bounded payload sizes and typed parsing prevent oversized fixture rendering from becoming the first failure.

Negative Tests:
- **Malformed inputs**: registry response missing `placeholderOnly`/arrays, management response with invalid item shapes, and malformed JSON through the existing parser path.
- **Error paths**: registry/management 403/500-style canonical API errors render diagnostic banners; auth failures clear stored auth as in S01.
- **Boundary conditions**: empty placeholder lists render useful empty states, and read-only projects still show management inspection while chat compose remains disabled.

Observability Impact:
- Signals added/changed: Web banners surface registry/management backend error codes and request ids; UI labels each panel as placeholder-only.
- How a future agent inspects this: run `npm test -- --run apps/web/src/App.test.tsx` and review rendered roles/text in failing test output.
- Failure state exposed: registry and management fetch failures become visible without silently dropping the user back to login, except for true auth failures.

## Inputs

- ``apps/web/src/api.ts``
- ``apps/web/src/App.tsx``
- ``apps/web/src/styles.css``
- ``apps/web/src/App.test.tsx``
- ``apps/api/src/registry.test.ts``

## Expected Output

- ``apps/web/src/api.ts``
- ``apps/web/src/App.tsx``
- ``apps/web/src/styles.css``
- ``apps/web/src/App.test.tsx``

## Verification

`npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build`

## Observability Impact

Adds browser-visible, requestId-aware diagnostics for registry/management fetch failures and explicit placeholder-only UI state for non-live integrations.

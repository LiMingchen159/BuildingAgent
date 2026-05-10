---
estimated_steps: 28
estimated_files: 6
skills_used: []
---

# T01: Add authenticated placeholder registry and management API contracts

Add the backend seed fixtures and Fastify routes for S02's placeholder registry and project management contracts. The implementation should be API-first and synthetic-only: global registry data is inspectable by any authenticated user, while project management placeholder data is returned only after membership, selected-project, and read-permission checks pass.

Steps:
1. Extend `apps/api/src/seed.ts` with typed synthetic fixtures for runtime providers, tools, skills, gateways, and building-domain capabilities; include explicit placeholder statuses such as `placeholder`, `mock`, or `not_configured`, and do not add secrets or real external configuration.
2. Update `apps/api/src/server.ts` with `GET /api/registry` and `GET /api/projects/:projectId/management`, using `authenticateRequest`, `requireProjectMembership`, `requireSelectedProject`, and `requirePermission(..., "chat:read")` where project context is required.
3. Ensure all list responses are bounded by `store.maxListSize` and include `limit`, `placeholderOnly: true`, and `requestId`; keep canonical error envelopes for all denial modes.
4. Add `apps/api/src/registry.test.ts` covering successful authenticated registry listing, missing/invalid auth, selected-project enforcement for management listing, forbidden project access, bounded list limits, request ids, and absence of secret/live-integration fields.

Must-haves:
- [ ] Registry and management endpoints are read-only GET contracts with honest HTTP status codes.
- [ ] Project management listing cannot be read before selecting the same authorized project.
- [ ] Placeholder fixture data is synthetic and clearly marked as placeholder-only.
- [ ] API tests prove bounded responses and canonical diagnostic envelopes.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Bearer auth/session store | Return canonical 401 `auth_missing`/`auth_invalid` with request id | N/A for in-memory local store | Return canonical 401/500 rather than leaking internals |
| Project membership/selection | Return canonical 403 `project_forbidden` or `project_not_selected` with request id | N/A for in-memory local store | Return canonical 403/500 rather than partial data |

Load Profile:
- **Shared resources**: in-memory seeded fixture arrays and sessions.
- **Per-operation cost**: one auth lookup, at most a few in-memory membership/project checks, and bounded array slicing.
- **10x breakpoint**: fixture arrays remain small in M001; the important guard is maintaining `maxListSize` bounds so future real stores do not inherit unbounded list semantics.

Negative Tests:
- **Malformed inputs**: missing bearer, malformed bearer, unknown token, project id for a project the user cannot access.
- **Error paths**: management read before project selection and management read for a different selected project.
- **Boundary conditions**: store with more fixtures than `maxListSize` returns only the bounded count and includes the explicit limit.

Observability Impact:
- Signals added/changed: successful registry/management responses include `requestId`, `limit`, and `placeholderOnly`; denial paths preserve canonical error codes.
- How a future agent inspects this: run `npm test -- --run apps/api/src/registry.test.ts` or inject the two GET endpoints locally.
- Failure state exposed: auth, project membership, selected-project, and permission failures are distinguishable by code/request id.

## Inputs

- ``apps/api/src/seed.ts``
- ``apps/api/src/server.ts``
- ``apps/api/src/auth.ts``
- ``apps/api/src/auth.test.ts``
- ``apps/api/src/chat.test.ts``

## Expected Output

- ``apps/api/src/seed.ts``
- ``apps/api/src/server.ts``
- ``apps/api/src/registry.test.ts``

## Verification

`npm test -- --run apps/api/src/registry.test.ts apps/api/src/auth.test.ts apps/api/src/chat.test.ts`

## Observability Impact

Adds requestId-bearing, placeholderOnly, bounded registry/management API responses and test-covered canonical denial modes for future CLI/Web diagnostics.

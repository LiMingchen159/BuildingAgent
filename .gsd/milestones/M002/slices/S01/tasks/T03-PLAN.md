---
estimated_steps: 28
estimated_files: 5
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T03: Expose authenticated API endpoints and contract tests

Wire the shared auth/project-context services into authenticated FastAPI endpoints and add contract tests that prove the slice demo exactly as a downstream CLI/Web caller will consume it.

Expected `skills_used` frontmatter for executor: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add FastAPI dependencies for bearer-token extraction, current-user resolution, and project-context resolution using the T02 provider/services.
2. Implement `POST /auth/dev-login` for the local/dev seeded login flow, returning a non-secret seeded access token and current user metadata; keep it explicitly dev/local and provider-shaped.
3. Implement authenticated `GET /auth/me`, bounded `GET /projects`, and `GET /projects/{project_id}/context` endpoints with stable response shapes and honest HTTP status codes.
4. Map missing/malformed/invalid authorization to structured 401 errors; map inaccessible projects to structured 403 or 404 as appropriate; include request IDs in all error responses.
5. Add contract tests using httpx/FastAPI in-process app testing for dev login, `/auth/me`, `/projects`, project context, unauthenticated 401, invalid token 401, and cross-project denial.
6. Add or update a short developer-facing API contract note so downstream S02-S04 executors know the seeded token flow and endpoint shapes without reading tests.

Must-haves:
- All non-health S01 endpoints require `Authorization: Bearer <token>` except the explicit local/dev login helper.
- Responses expose IDs, role, and permission scopes consistently with the shared `RequestContext` model.
- Project listing is bounded and returns an `items` array plus pagination metadata even with in-memory seeds.
- Negative auth/project tests assert status codes and stable `error.code` values, not prose-only messages.
- No production OAuth/SSO, database migrations, provider secrets, runtime/chat, memory, tool, skill, or model execution is added.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| Auth provider dependency | return structured 401 for missing/invalid credentials | not applicable to local in-process provider | reject malformed `Authorization` headers before context resolution |
| Project context service | return structured 403/404 for inaccessible or missing projects | not applicable to local in-memory service | reject invalid path/list parameters with honest 4xx responses |

Load Profile (Q6):
- Shared resources: FastAPI app dependencies and in-memory seed store.
- Per-operation cost: one auth lookup plus bounded membership/project lookup per request.
- 10x breakpoint: in-memory scans and lack of persistence are acceptable for M002 skeleton but must remain isolated behind service functions.

Negative Tests (Q7):
- Malformed inputs: missing `Authorization`, wrong scheme, empty bearer token, excessive/invalid `limit`, unknown `project_id`.
- Error paths: invalid token returns 401; valid token without project membership returns structured denial; dev-login with unknown user returns structured 4xx.
- Boundary conditions: list endpoint respects a max `limit`; context endpoint returns exactly the selected project/workspace IDs and not another seeded project.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/core/errors.py``
- ``buildingagent/auth/provider.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/projects/context.py``
- ``tests/test_project_context.py``

## Expected Output

- ``apps/api/main.py``
- ``buildingagent/auth/provider.py``
- ``buildingagent/projects/context.py``
- ``tests/test_api_auth_context.py``
- ``docs/API_CONTRACT.md``

## Verification

`python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`

## Observability Impact

Propagates request IDs through authenticated success/error paths and makes auth/context failures inspectable through status code plus stable `error.code` in API responses.

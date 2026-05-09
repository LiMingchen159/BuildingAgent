---
estimated_steps: 25
estimated_files: 5
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T02: Implement seeded auth and reusable project context services

Implement the seeded local/dev identity, workspace, project, membership, and request-context domain modules independently from HTTP handlers so CLI/Web/runtime slices can reuse the same contract.

Expected `skills_used` frontmatter for executor: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Define typed data models for seeded users, workspaces, projects, memberships, roles, permission scopes, and `RequestContext` using standard Python dataclasses or Pydantic models that serialize predictably.
2. Implement a provider-shaped local/dev auth module that maps non-secret seeded bearer tokens to users and can later be replaced by a production identity provider without changing API handlers.
3. Implement project lookup and membership/context resolution services that return a user's accessible projects and resolve context for a specific project only when membership exists.
4. Keep seeded data small, deterministic, and non-secret; do not use `.env`, external databases, ignored fixtures, or real customer/building data.
5. Add unit tests for valid token resolution, invalid token rejection, project listing by user, context resolution, and cross-project denial.

Must-haves:
- `RequestContext` includes `user_id`, `workspace_id`, `project_id`, `role`, and `permission_scopes`.
- Seeded tokens are local/dev only and are never treated as production credentials.
- Cross-project access is rejected in the domain layer, not only in HTTP route code.
- Tests prove R022's backend project model skeleton and R026's request-context shape at the shared-module level.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| In-memory seed store | raise/return typed domain errors that map cleanly to HTTP later | not applicable | validate token/project/user identifiers before building context |

Load Profile (Q6):
- Shared resources: small in-memory seed store used by all tests and app routes.
- Per-operation cost: bounded dictionary/list lookup over seeded data; acceptable for skeleton.
- 10x breakpoint: linear scans in membership/project listing would be the first issue if seed data grew; keep service functions isolated so persistence can replace them later.

Negative Tests (Q7):
- Malformed inputs: empty token, unknown token, empty project id, unknown project id.
- Error paths: valid user requesting a project without membership must fail distinctly from missing auth.
- Boundary conditions: user with no accessible projects should return an empty list from the service if seeded later, not leak another user's projects.

## Inputs

- ``docs/AUTH_ACCESS_CONTROL_SPEC.md``
- ``docs/PROJECT_MODEL_SPEC.md``
- ``docs/ENTRYPOINTS_SPEC.md``
- ``buildingagent/core/errors.py``
- ``pyproject.toml``

## Expected Output

- ``buildingagent/auth/__init__.py``
- ``buildingagent/auth/provider.py``
- ``buildingagent/projects/__init__.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/projects/context.py``
- ``tests/test_project_context.py``

## Verification

`python -m pytest tests/test_project_context.py tests/test_api_foundation.py`

## Observability Impact

Creates stable context/error boundaries that route-level diagnostics can expose through structured HTTP status and error codes without leaking token values or internal seed-store details.

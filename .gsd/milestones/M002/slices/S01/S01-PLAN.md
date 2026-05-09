# S01: Authenticated API and project context contract

**Goal:** Implement the first authenticated FastAPI backend contract for M002: local/dev bearer authentication, seeded users/workspaces/projects/memberships, a reusable request-context shape, and structured error responses for unauthenticated or invalid project access.
**Demo:** A developer can start or test the FastAPI app, authenticate with the seeded local/dev token flow, call `/auth/me`, `/projects`, and a project context endpoint, and see unauthenticated requests fail with structured 401 errors.

## Must-Haves

- Must-haves:
- Public health endpoint exists for local startup/testing without authentication.
- Local/dev authentication is provider-shaped and uses seeded non-secret bearer tokens or a dev-login endpoint; production identity provider selection remains deferred per D001.
- `GET /auth/me`, `GET /projects`, and `GET /projects/{project_id}/context` require `Authorization: Bearer ...` and return stable JSON shapes.
- Request context resolves `user_id`, `workspace_id`, `project_id`, project membership role, and permission scopes for authorized seeded memberships, directly advancing R022 and providing the S01-owned proof for R026's context shape.
- Missing, malformed, or invalid credentials return HTTP 401 with the canonical structured error shape; unknown or inaccessible projects return honest HTTP 404/403-style structured errors rather than 200-with-error.
- Project list responses are bounded and evolvable, using `items` plus pagination metadata even while backed by seeded in-memory data.
- Tests verify both happy paths and negative auth/context paths without reading ignored files such as `.gsd/`, `.env`, or local virtualenv state.
- Threat Surface (Q3):
- Abuse: callers may omit credentials, replay/guess local tokens, tamper with `project_id`, or attempt cross-project context access. The skeleton must reject invalid tokens and inaccessible projects at the backend boundary.
- Data exposure: seeded user/workspace/project/member data is non-secret demo data, but bearer tokens and future project identifiers must never appear in error details or logs.
- Input trust: request headers, optional list parameters, and path `project_id` are untrusted HTTP input and must be validated before resolving context.
- Requirement Impact (Q4):
- Requirements touched: R022 is directly owned by this slice; R026 is materially advanced by the reusable request-context object; R020/R021/S02-S04 depend on the contract but are not implemented here; R024/R025 remain future enforcement requirements.
- Re-verify: API contract tests for auth, project listing, context resolution, negative credentials, inaccessible projects, and request-id propagation must pass after this slice.
- Decisions revisited: D001 local/dev auth provider scope, D002 API-first slice ordering, and D004 API skeleton module/test layout must be honored; do not introduce production OAuth/SSO, persistence, or real runtime execution.

## Proof Level

- This slice proves: Contract/in-process integration proof: pytest/httpx exercises the real FastAPI app object and shared auth/project modules without a live server, external services, production auth provider, or persistent database.

## Integration Closure

This slice consumes the tracked M001 specifications in `docs/AUTH_ACCESS_CONTROL_SPEC.md`, `docs/PROJECT_MODEL_SPEC.md`, and `docs/ENTRYPOINTS_SPEC.md`; introduces the FastAPI composition root in `apps/api/main.py`; and exports reusable auth/project/context modules under `buildingagent/` for later CLI, Web, runtime, memory, registry, and model slices. It proves the API boundary with in-process pytest/httpx contract tests only; live CLI/Web integration, runtime/chat wiring, real model execution, production identity providers, persistence, and audit retention remain for downstream M002/M003 slices.

## Verification

- Every API response should carry or echo an `X-Request-ID`; all structured error bodies should include `error.code`, `error.message`, `error.details`, and `error.requestId`; authentication and context-resolution failures should be diagnosable from status code plus stable error code without exposing bearer tokens, stack traces, or secrets.

## Tasks

- [x] **T01: Establish FastAPI test harness and structured error primitives** `est:1h`
  Create the Python API/test foundation and canonical response/error primitives so later tasks can build real authenticated endpoints without inventing contract shape.
  - Files: ``pyproject.toml``, ``apps/api/main.py``, ``buildingagent/core/errors.py``, ``tests/test_api_foundation.py``
  - Verify: `python -m pytest tests/test_api_foundation.py`

- [x] **T02: Implement seeded auth and reusable project context services** `est:1.5h`
  Implement the seeded local/dev identity, workspace, project, membership, and request-context domain modules independently from HTTP handlers so CLI/Web/runtime slices can reuse the same contract.
  - Files: ``buildingagent/auth/provider.py``, ``buildingagent/projects/models.py``, ``buildingagent/projects/seeds.py``, ``buildingagent/projects/context.py``, ``tests/test_project_context.py``
  - Verify: `python -m pytest tests/test_project_context.py tests/test_api_foundation.py`

- [x] **T03: Expose authenticated API endpoints and contract tests** `est:2h`
  Wire the shared auth/project-context services into authenticated FastAPI endpoints and add contract tests that prove the slice demo exactly as a downstream CLI/Web caller will consume it.
  - Files: ``apps/api/main.py``, ``buildingagent/auth/provider.py``, ``buildingagent/projects/context.py``, ``tests/test_api_auth_context.py``, ``docs/API_CONTRACT.md``
  - Verify: `python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`

## Files Likely Touched

- `pyproject.toml`
- `apps/api/main.py`
- `buildingagent/core/errors.py`
- `tests/test_api_foundation.py`
- `buildingagent/auth/provider.py`
- `buildingagent/projects/models.py`
- `buildingagent/projects/seeds.py`
- `buildingagent/projects/context.py`
- `tests/test_project_context.py`
- `tests/test_api_auth_context.py`
- `docs/API_CONTRACT.md`

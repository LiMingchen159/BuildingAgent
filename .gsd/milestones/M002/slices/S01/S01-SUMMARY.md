---
id: S01
parent: M002
milestone: M002
provides:
  - Authenticated FastAPI app composition root for downstream M002 API slices.
  - Seeded local/dev auth provider and token fixtures (`user_alice`, `user_bob`, `user_no_projects`) for CLI/Web tests.
  - Reusable request-context domain shape resolving user, workspace, project, role, and permission scopes.
  - Documented API contract in `docs/API_CONTRACT.md` for S02-S04 callers.
  - Test harness and reproducible pytest command for API/domain contract verification.
requires:
  []
affects:
  - S02
  - S03
  - S04
  - S05
key_files:
  - apps/api/main.py
  - buildingagent/core/errors.py
  - buildingagent/auth/provider.py
  - buildingagent/projects/models.py
  - buildingagent/projects/seeds.py
  - buildingagent/projects/context.py
  - tests/test_api_foundation.py
  - tests/test_project_context.py
  - tests/test_api_auth_context.py
  - docs/API_CONTRACT.md
  - pyproject.toml
  - uv.lock
  - .gsd/PROJECT.md
key_decisions:
  - Centralized structured API errors in `buildingagent.core.errors` with stable `error.code`, `error.message`, `error.details`, and `error.requestId` fields.
  - Added FastAPI request-id middleware in the app composition root so successful and structured-error responses carry or echo `X-Request-ID`.
  - Kept `/health` unauthenticated with a minimal `{status: ok}` payload for local startup diagnostics.
  - Kept local/dev bearer authentication behind `AuthProvider`/`LocalDevAuthProvider` so production identity can replace seeded token lookup later without changing HTTP handlers.
  - Placed cross-project denial in `ProjectContextService.resolve_context` so project isolation is enforced in reusable domain services, not just routes.
  - Represented request context and seed data as frozen dataclasses with JSON-friendly `RequestContext.to_public_dict()` serialization.
  - Mapped authorization header failures to distinct stable 401 codes before provider resolution: `auth_missing_credentials`, `auth_malformed_authorization`, and provider-driven `auth_invalid_token`.
  - Kept HTTP 403/404 mapping at the FastAPI boundary while preserving transport-agnostic domain errors.
  - Documented the M002 local/dev API contract in `docs/API_CONTRACT.md` for downstream CLI/Web/runtime executors.
patterns_established:
  - Transport-agnostic domain services for auth/project context with thin FastAPI HTTP mapping at the boundary.
  - Centralized structured error primitives reused across handlers instead of ad hoc error responses.
  - Request ID propagation as a cross-cutting middleware concern for both success and failure responses.
  - Seeded local/dev fixtures as deterministic non-secret contract data for CLI/Web/runtime skeleton development.
  - Bounded list responses using `items` plus pagination metadata even for in-memory seed data.
observability_surfaces:
  - Public `GET /health` endpoint for local startup/testing without authentication.
  - `X-Request-ID` middleware that echoes caller-provided request IDs or generates one for every response.
  - Canonical structured error body containing `error.code`, `error.message`, `error.details`, and `error.requestId`.
  - Stable auth/project error codes for diagnosing failures without exposing bearer tokens, stack traces, or file paths.
  - Contract tests and TestClient smoke proving request-id propagation on success and errors.
drill_down_paths:
  - .gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-09T11:30:43.542Z
blocker_discovered: false
---

# S01: Authenticated API and project context contract

**S01 delivered the authenticated FastAPI backend foundation: local/dev bearer auth, seeded project memberships, reusable request context, structured errors, request IDs, and documented `/auth/me`, `/projects`, and project-context contracts.**

## What Happened

S01 delivered the first executable backend/auth/project-context contract for the M002 authenticated foundation skeleton. The slice established the FastAPI API composition root, unauthenticated local health diagnostics, request-id propagation, and one canonical structured error contract. It then added provider-shaped local/dev authentication, seeded users/workspaces/projects/memberships, permission-scope metadata, and a reusable `ProjectContextService` that lists accessible projects and resolves a `RequestContext` only for valid memberships. Finally, it exposed the downstream-facing API surface: `POST /auth/dev-login`, `GET /auth/me`, bounded `GET /projects`, and `GET /projects/{project_id}/context`, with explicit structured 401, 403, 404, and 422 failure behavior.

The assembled work directly validates R022 for the backend auth/project model skeleton and materially advances R026 for the shared request-context shape. It gives S02 a safe authenticated boundary for registry/runtime/memory/model skeleton endpoints, and gives S03/S04 a documented login/project-selection/context contract for CLI and Web implementation. The established pattern is transport-agnostic domain services plus thin FastAPI mappings: auth/project-context decisions live in reusable modules, while HTTP-specific header parsing and status-code translation remain in the API layer.

Operational readiness for this slice is intentionally local/test scoped. Health signal: `GET /health` is public and returns `{"status":"ok"}` with `X-Request-ID`. Failure signal: missing/malformed/invalid credentials and project access failures return structured errors with stable codes and request IDs. Recovery procedure: reproduce with `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`, then inspect `docs/API_CONTRACT.md` for expected endpoint/error shapes. Monitoring gaps: no metrics backend, audit retention, live deployment, or production auth provider exists yet; those remain future slices/milestones.

## Verification

Fresh slice-level verification ran after the `.gsd/PROJECT.md` refresh: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` exited 0 with 26 passed in 3.21s. Additional TestClient smoke exited 0 and proved `/health` returns 200 with request-id echo, unauthenticated `/auth/me` returns structured 401 with requestId, `POST /auth/dev-login` returns access token/user shape, `GET /projects` returns items plus pagination, and `GET /projects/{project_id}/context` returns project context with role and permission scopes. Earlier attempts using `python` and `python3 -m pytest` failed only because the base environment lacks `python`/system pytest, not because of product code failures.

## Requirements Advanced

- R026 — S01 validates the backend/API portion of the authoritative request-context shape by resolving `user_id`, `workspace_id`, `project_id`, role, and permission scopes for seeded memberships. It remains active until later CLI/Web/runtime entry points prove the same context object across all boundaries.

## Requirements Validated

- R022 — Backend auth and project model skeleton implemented and verified by `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` with 26 passed tests, plus TestClient smoke proving `/health`, dev-login, unauthenticated 401, project listing, project context, and request-id propagation.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

The slice plan's literal `python -m pytest ...` commands are not runnable in this container because the base environment lacks `python`, `pip`, and system `pytest`. Verification used the project virtualenv equivalent `.venv/bin/python -m pytest ...`, matching the tracked dependency environment. LSP diagnostics were attempted during T03 but unavailable because no Python language server is configured.

## Known Limitations

This slice intentionally uses seeded in-memory local/dev data and deterministic non-secret tokens only; it does not implement production OAuth/SSO, durable persistence, real permission enforcement in runtime/tool dispatchers, audit retention, CLI/Web integration, or live server/browser acceptance. The base container does not provide `python` or system pytest, so the verified local command uses `.venv/bin/python`. Python LSP diagnostics are not configured.

## Follow-ups

S02 should reuse the authenticated request-context dependency and documented `docs/API_CONTRACT.md` shapes when exposing runtime, registry, memory, model, tool, and skill skeleton endpoints. S03/S04 should use `POST /auth/dev-login`, `GET /projects`, and `GET /projects/{project_id}/context` exactly as documented rather than inventing separate auth/context flows. Later slices should configure Python LSP support if diagnostics are required in the harness.

## Files Created/Modified

- `apps/api/main.py` — FastAPI app composition root with `/health`, request-id middleware, structured error handling, dev-login, authenticated `/auth/me`, bounded `/projects`, and project context endpoint wiring.
- `buildingagent/core/errors.py` — Central structured API error primitives and safe response helpers.
- `buildingagent/auth/provider.py` — Provider-shaped local/dev authentication and seeded bearer-token resolution.
- `buildingagent/projects/models.py` — Frozen domain models for users, workspaces, projects, memberships, permission scopes, and request context serialization.
- `buildingagent/projects/seeds.py` — Seeded in-memory local/dev users, workspaces, projects, memberships, and deterministic token fixtures.
- `buildingagent/projects/context.py` — Reusable project listing and context-resolution service enforcing membership and project isolation outside HTTP handlers.
- `tests/test_api_foundation.py` — API foundation tests for health, request IDs, and canonical structured errors.
- `tests/test_project_context.py` — Domain tests for seeded auth, project listing, request-context shape, missing/unknown projects, and cross-project denial.
- `tests/test_api_auth_context.py` — FastAPI contract tests for dev login, `/auth/me`, `/projects`, project context, negative auth, 403/404 project failures, pagination validation, request IDs, and non-leakage.
- `docs/API_CONTRACT.md` — Downstream API contract documentation for S02-S04 callers.
- `.gsd/PROJECT.md` — Project state refreshed with current M002/S01 backend contract and local verification notes.
- `pyproject.toml` — Python project metadata and lockfile for FastAPI/httpx/pytest test environment.
- `uv.lock` — Dependency lockfile generated for reproducible local/test environment.

---
id: T02
parent: S01
milestone: M002
key_files:
  - buildingagent/auth/__init__.py
  - buildingagent/auth/provider.py
  - buildingagent/projects/__init__.py
  - buildingagent/projects/models.py
  - buildingagent/projects/seeds.py
  - buildingagent/projects/context.py
  - tests/test_project_context.py
key_decisions:
  - Kept local/dev bearer authentication behind `AuthProvider`/`LocalDevAuthProvider` so future production identity can replace seeded token lookup without changing handlers.
  - Placed cross-project denial in `ProjectContextService.resolve_context` rather than deferring it to HTTP routes, preserving the project isolation invariant for all entrypoints.
  - Represented request context and seed data as frozen dataclasses with JSON-friendly `RequestContext.to_public_dict()` serialization.
duration: 
verification_result: passed
completed_at: 2026-05-09T11:16:18.771Z
blocker_discovered: false
---

# T02: Added seeded local/dev auth and reusable project-context services with domain-level project isolation tests.

**Added seeded local/dev auth and reusable project-context services with domain-level project isolation tests.**

## What Happened

Added the shared local/dev authentication and project-context domain layer independent of HTTP handlers. The new auth provider maps deterministic non-secret seeded bearer tokens to users and raises stable typed domain errors for empty, unknown, or malformed token input without exposing token values. The project package now defines frozen models for users, workspaces, projects, memberships, roles, permission scopes, seed stores, and `RequestContext`, plus a deterministic local/dev seed store covering accessible projects, a cross-project denial case, and a no-projects boundary user. `ProjectContextService` lists only a user's accessible projects and resolves context only when the target project exists and membership is present, raising distinct `project_not_found` and `project_access_denied` domain errors for later HTTP mapping. Tests were added for valid token resolution, empty/unknown token rejection, user-scoped project listing, no-projects boundary behavior, context serialization shape, missing project identifiers, unknown projects, and cross-project denial.

## Verification

Ran `uv run --extra test python -m pytest tests/test_project_context.py tests/test_api_foundation.py` after the final code change. Pytest collected 13 tests across the new project-context coverage and existing API foundation coverage; all 13 passed, proving seeded auth resolution, domain-layer project isolation, request-context shape, and no regression to structured API foundation behavior.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `uv run --extra test python -m pytest tests/test_project_context.py tests/test_api_foundation.py` | 0 | ✅ pass — 13 tests passed | 7607ms |

## Deviations

Used `uv run --extra test python -m pytest ...` as the verified equivalent because this environment lacks a base `python`/system pytest, matching the T01 tooling deviation. The first red test run exposed a test indentation error before the intended missing-module failure; the test was corrected and rerun red before implementation.

## Known Issues

The literal plan command `python -m pytest ...` is not runnable in this container because the base environment has no `python`; `uv run --extra test python -m pytest ...` is the reproducible verified command here.

## Files Created/Modified

- `buildingagent/auth/__init__.py`
- `buildingagent/auth/provider.py`
- `buildingagent/projects/__init__.py`
- `buildingagent/projects/models.py`
- `buildingagent/projects/seeds.py`
- `buildingagent/projects/context.py`
- `tests/test_project_context.py`

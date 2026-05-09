---
id: T01
parent: S01
milestone: M002
key_files:
  - pyproject.toml
  - uv.lock
  - apps/__init__.py
  - apps/api/__init__.py
  - apps/api/main.py
  - buildingagent/__init__.py
  - buildingagent/core/errors.py
  - tests/test_api_foundation.py
key_decisions:
  - Centralized API error responses in `buildingagent.core.errors` with stable `error.code`, `error.message`, `error.details`, and `error.requestId` fields.
  - Added FastAPI request-id middleware in the app composition root so successful and structured-error responses carry `X-Request-ID`.
  - Kept `/health` unauthenticated with a minimal `{status: ok}` payload for local diagnostics.
duration: 
verification_result: mixed
completed_at: 2026-05-09T11:07:46.872Z
blocker_discovered: false
---

# T01: Established the FastAPI foundation with `/health`, request-id middleware, canonical structured API errors, and passing pytest contract coverage.

**Established the FastAPI foundation with `/health`, request-id middleware, canonical structured API errors, and passing pytest contract coverage.**

## What Happened

Created the tracked Python project metadata for FastAPI, httpx, pytest, and in-repo pytest import paths. Added package markers for `apps`, `apps.api`, and `buildingagent` so tests can import `apps.api.main` and shared `buildingagent.*` modules cleanly. Implemented `apps/api/main.py` as the FastAPI composition root with `create_app()`, an unauthenticated `GET /health`, request-id generation/echoing middleware, and `ApiError` handling. Implemented `buildingagent/core/errors.py` with canonical safe structured error body/response helpers. Added focused contract tests for health, generated request IDs, echoed request IDs, structured error shape, non-leakage checks, and empty details serialization as `{}`. The first attempted verification exposed missing Python tooling in the base environment; using uv installed dependencies from the tracked project metadata and the final focused test run passed.

## Verification

Ran `uv run --extra test python -m pytest tests/test_api_foundation.py` after the final code change. Pytest collected 4 tests from `tests/test_api_foundation.py` and all 4 passed, covering `/health`, request-id generation/echoing, canonical structured errors, and empty details serialization.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python -m pytest tests/test_api_foundation.py` | 127 | ❌ fail — base environment has no `python` executable | 187ms |
| 2 | `python3 -m pytest tests/test_api_foundation.py` | 1 | ❌ fail — base environment has no system pytest installed | 32ms |
| 3 | `python3 -m pip install --user -e '.[test]'` | 1 | ❌ fail — base environment has no pip installed | 28ms |
| 4 | `uv run --extra test python -m pytest tests/test_api_foundation.py` | 0 | ✅ pass — 4 tests passed | 7953ms |

## Deviations

Used `uv run --extra test python -m pytest tests/test_api_foundation.py` for local verification because this environment has no `python`, `pip`, or system `pytest`; the tracked `pyproject.toml` still defines the reproducible dependency set and pytest configuration. `uv.lock` was generated as the dependency lockfile.

## Known Issues

The literal plan command `python -m pytest tests/test_api_foundation.py` cannot run in this container because `python` and `pip` are absent; `uv run --extra test python -m pytest tests/test_api_foundation.py` is the verified equivalent here.

## Files Created/Modified

- `pyproject.toml`
- `uv.lock`
- `apps/__init__.py`
- `apps/api/__init__.py`
- `apps/api/main.py`
- `buildingagent/__init__.py`
- `buildingagent/core/errors.py`
- `tests/test_api_foundation.py`

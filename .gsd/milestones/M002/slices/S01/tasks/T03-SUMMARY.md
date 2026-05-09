---
id: T03
parent: S01
milestone: M002
key_files:
  - apps/api/main.py
  - tests/test_api_auth_context.py
  - docs/API_CONTRACT.md
key_decisions:
  - Mapped auth header parsing failures to distinct stable 401 codes before provider resolution: `auth_missing_credentials`, `auth_malformed_authorization`, and provider-driven `auth_invalid_token`.
  - Kept project context denial/not-found mapping at the FastAPI boundary so domain services stay transport-agnostic while HTTP callers receive honest 403/404 structured errors.
  - Documented the M002 local/dev API contract in `docs/API_CONTRACT.md` for downstream CLI/Web executors.
duration: 
verification_result: mixed
completed_at: 2026-05-09T11:24:34.997Z
blocker_discovered: false
---

# T03: Exposed the seeded local/dev authenticated FastAPI API contract with `/auth/me`, `/projects`, project context, structured failures, and contract docs.

**Exposed the seeded local/dev authenticated FastAPI API contract with `/auth/me`, `/projects`, project context, structured failures, and contract docs.**

## What Happened

Added FastAPI dependency wiring for bearer-token extraction, seeded local/dev current-user resolution, and reusable project-context resolution. Implemented `POST /auth/dev-login`, authenticated `GET /auth/me`, bounded `GET /projects`, and `GET /projects/{project_id}/context` using the T02 seed store, auth provider, and context service. Added stable structured auth/context error mappings with request IDs preserved by the existing middleware, including missing credentials, malformed bearer headers, invalid tokens, inaccessible projects, unknown projects, invalid limits, and unknown dev-login users. Added in-process FastAPI contract tests covering the happy paths, negative auth/project paths, pagination boundary behavior, request-id error shape, and token non-leakage. Added `docs/API_CONTRACT.md` describing seeded token usage, endpoint shapes, pagination, request IDs, and stable error codes for downstream S02-S04 work.

## Verification

Fresh verification after the final code change ran `uv run --extra test python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`; pytest collected 26 tests and all 26 passed. A focused run of `uv run --extra test python -m pytest tests/test_api_auth_context.py` collected 13 tests and all 13 passed. LSP diagnostics were attempted on edited Python files but could not run because no language server is configured.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `uv run --extra test python -m pytest tests/test_api_auth_context.py` | 0 | ✅ pass — 13 API auth/context contract tests passed | 8438ms |
| 2 | `lsp diagnostics apps/api/main.py` | 1 | ❌ fail — no Python language server found in harness | 0ms |
| 3 | `lsp diagnostics tests/test_api_auth_context.py` | 1 | ❌ fail — no Python language server found in harness | 0ms |
| 4 | `uv run --extra test python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` | 0 | ✅ pass — 26 slice verification tests passed | 8284ms |

## Deviations

Used `uv run --extra test python -m pytest ...` as the runnable equivalent because this environment lacks a base `python` executable, consistent with T01/T02. LSP diagnostics could not run because no Python language server is configured in the harness.

## Known Issues

The literal plan command `python -m pytest ...` is not runnable in this container because the base environment has no `python`; use `uv run --extra test python -m pytest ...`. No Python LSP server is configured, so LSP diagnostics were unavailable.

## Files Created/Modified

- `apps/api/main.py`
- `tests/test_api_auth_context.py`
- `docs/API_CONTRACT.md`

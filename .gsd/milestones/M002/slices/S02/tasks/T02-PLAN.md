---
estimated_steps: 6
estimated_files: 3
skills_used: []
---

# T02: Expose authenticated S02 FastAPI endpoints and contract tests

Wire the S02 services into authenticated FastAPI endpoints and document the additive API contract for downstream CLI/Web slices. Endpoints should be thin HTTP adapters over the services from T01, reuse S01 dependencies and error handling, and keep `/runtime/chat` deterministic and explicitly stubbed.

Expected skills_used frontmatter: `api-design`, `tdd`, `verify-before-complete`.

Planned endpoint shape: `GET /projects/{project_id}/models`, `GET /projects/{project_id}/memory`, `GET /projects/{project_id}/tools`, `GET /projects/{project_id}/skills`, and `POST /projects/{project_id}/runtime/chat`. The chat request should require a non-empty prompt and may include optional client metadata, but must never execute the prompt, call a provider, or dispatch tools.

Failure Modes (Q5): auth dependency failures must return existing structured 401s; project resolution failures must return existing 403/404s; malformed chat payloads must return an honest 422 validation response; service construction should not introduce network/file/provider failure paths.

Load Profile (Q6): shared resources are FastAPI dependency construction and static in-memory services; per-operation cost is one auth resolution, one project-context resolution, and one service serialization. At 10x local TestClient load, request serialization dominates; no database pool, provider quota, or vector index exists.

Negative Tests (Q7): missing auth, malformed auth, invalid token, inaccessible project, unknown project, empty/blank prompt, and response non-leakage of token/secret/file-path substrings must be covered in `tests/test_api_runtime_registry.py`.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/core/errors.py``
- ``docs/API_CONTRACT.md``
- ``tests/test_api_auth_context.py``
- ``tests/test_runtime_registry_contracts.py``

## Expected Output

- ``apps/api/main.py``
- ``docs/API_CONTRACT.md``
- ``tests/test_api_runtime_registry.py``

## Verification

.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_api_runtime_registry.py

## Observability Impact

Extends API inspection surfaces with request-id-bearing authenticated skeleton endpoints and explicit stub/runtime/dispatcher metadata; verifies structured error bodies and redaction behavior so future agents can localize failures to auth, context resolution, validation, or intentional no-op execution.

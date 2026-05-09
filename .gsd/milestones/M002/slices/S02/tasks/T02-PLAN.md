---
estimated_steps: 6
estimated_files: 8
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T02: Expose authenticated skeleton APIs and contract tests

Wire the skeleton services into authenticated FastAPI endpoints and document the downstream API contract for CLI/Web implementers. Expected skills: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add FastAPI request/response models for chat and metadata responses in or near `apps/api/main.py`, keeping route handlers thin and delegating business semantics to the T01 services.
2. Add authenticated project-scoped endpoints: `GET /projects/{project_id}/models`, `GET /projects/{project_id}/memory`, `GET /projects/{project_id}/tools`, `GET /projects/{project_id}/skills`, and `POST /runtime/chat` with request body containing `project_id` and `prompt`.
3. Reuse `get_project_context`/`ProjectContextService.resolve_context` for every project-bearing endpoint so missing auth, unknown project, and cross-project denial preserve S01 error semantics.
4. Validate malformed chat inputs with honest 4xx responses; bound prompt length and require non-empty prompt text. Do not add streaming, idempotency keys, external provider configuration, or real execution hooks in this slice.
5. Extend `docs/API_CONTRACT.md` with additive S02 endpoint documentation: auth model, request/response examples, stable error codes, non-execution guarantees, and caller notes for S03/S04.
6. Add `tests/test_api_runtime_registry.py` with TestClient success and failure-path assertions for all new endpoints, including request-id echo, context shape, stub flags, cross-project denial, unknown project, missing auth, malformed chat payload, and no token/secret leakage.

Must-haves:
- HTTP status codes remain honest and structured errors use the existing canonical `error.code`, `error.message`, `error.details`, `error.requestId` shape.
- List/metadata responses are bounded and stable enough for CLI/Web rendering without separate mock contracts.
- `/runtime/chat` returns resolved context plus runtime/dispatcher/model metadata and an explicit stub response without any real LLM/tool/skill execution.
- The full S01+S02 pytest command passes after wiring.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/core/errors.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/models/registry.py``
- ``buildingagent/memory/store.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``tests/test_api_auth_context.py``
- ``docs/API_CONTRACT.md``

## Expected Output

- ``apps/api/main.py``
- ``docs/API_CONTRACT.md``
- ``tests/test_api_runtime_registry.py``

## Verification

`.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`

## Observability Impact

Preserves and expands API diagnostics by asserting `X-Request-ID` on S02 success/error responses, stable structured error codes for auth/project/chat failures, and safe runtime/dispatcher metadata in chat responses. Future agents can localize failures by running `tests/test_api_runtime_registry.py` and comparing response bodies to `docs/API_CONTRACT.md`.

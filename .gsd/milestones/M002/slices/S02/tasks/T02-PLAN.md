---
estimated_steps: 18
estimated_files: 3
skills_used: []
---

# T02: Expose authenticated S02 FastAPI endpoints, docs, and smoke tests

Wire the S02 services into authenticated FastAPI endpoints, document the additive API contract, and add API/smoke tests for the downstream path S03 CLI and S04 Web should consume. Endpoints should be thin HTTP adapters over T01 services, reuse S01 dependencies and error handling, and keep runtime chat deterministic and explicitly stubbed.

Executor skills: `api-design`, `write-docs`, `tdd`, `verify-before-complete`.

Planned endpoint shape: `GET /projects/{project_id}/models`, `GET /projects/{project_id}/memory`, `GET /projects/{project_id}/tools`, `GET /projects/{project_id}/skills`, and `POST /projects/{project_id}/runtime/chat`. The chat request should require a non-empty prompt and may include optional client metadata, but must never execute the prompt, call a provider, or dispatch tools.

Steps:
1. In `apps/api/main.py`, instantiate or depend on the T01 services/registries and add the planned routes behind the existing bearer-auth/project-context dependency.
2. Define the chat request validation shape in the API layer, requiring a non-empty prompt and preserving optional metadata as inert diagnostics only.
3. Map all service responses directly to JSON-friendly bodies that include context/project identifiers and explicit stub/no-execution metadata.
4. Update `docs/API_CONTRACT.md` with paths, request/response examples, auth/project scoping, status codes, request-id behavior, structured error behavior, redaction guarantees, and the no-real-execution guarantee.
5. Add `tests/test_api_runtime_registry.py` covering each metadata endpoint, runtime chat, downstream smoke flow, request-id propagation, missing/malformed/invalid auth, unknown/inaccessible projects, blank prompts, and non-leakage.
6. Run the full S01+S02 backend regression command.

Must-haves:
- Every S02 route uses the S01 request-context dependency; handlers must not read seed data or parse project memberships directly.
- API response keys match the documented contract exactly enough for S03/S04 executors to implement clients without guessing.
- The smoke path logs in as a seeded user, selects an accessible project, calls all metadata endpoints, posts runtime chat, and sees consistent context fields across responses.
- Existing S01 auth/context tests continue to pass unchanged.

Failure Modes (Q5): Auth dependency failures must return existing structured 401s; project resolution failures must return existing 403/404s; malformed chat payloads must return an honest 422 validation response; service construction should not introduce network/file/provider failure paths. Documentation/implementation drift is caught by smoke assertions on documented response keys and context fields.

Load Profile (Q6): Shared resources are FastAPI dependency construction and static in-memory services; per-operation cost is one auth resolution, one project-context resolution, and one service serialization. At 10x local TestClient load, request serialization dominates; no database pool, provider quota, or vector index exists.

Negative Tests (Q7): Missing auth, malformed auth, invalid token, inaccessible project, unknown project, empty/blank prompt, and response non-leakage of token/secret/file-path substrings must be covered in `tests/test_api_runtime_registry.py`.

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
- ``tests/test_runtime_registry_services.py``

## Expected Output

- ``apps/api/main.py``
- ``docs/API_CONTRACT.md``
- ``tests/test_api_runtime_registry.py``

## Verification

.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py

## Observability Impact

Extends API inspection surfaces with request-id-bearing authenticated skeleton endpoints and explicit stub/runtime/dispatcher metadata; documents and verifies request IDs, context echo, stub status, structured error bodies, and redaction behavior so future agents can localize failures to auth, context resolution, validation, or intentional no-op execution.

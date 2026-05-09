---
estimated_steps: 29
estimated_files: 7
skills_used: []
---

# T02: Expose authenticated FastAPI skeleton endpoints and contract tests

Wire the reusable skeleton services into authenticated FastAPI endpoints and API contract tests. Executor skills_used frontmatter should include `api-design`, `tdd`, and `verify-before-complete`.

## Steps
1. Add Pydantic request/response boundary models in `apps/api/main.py` or small local helpers for `POST /runtime/chat` and authenticated metadata endpoints.
2. Add authenticated, project-scoped endpoints that depend on `get_project_context`: `GET /projects/{project_id}/models`, `GET /projects/{project_id}/memory`, `GET /projects/{project_id}/tools`, `GET /projects/{project_id}/skills`, plus `POST /projects/{project_id}/runtime/chat` if a project-prefixed canonical route is used. Also preserve the published demo contract `POST /runtime/chat` by accepting `project_id` in the body or aliasing to the same service path; document whichever shape is implemented in T03.
3. Keep route handlers thin: resolve `RequestContext`, validate bounded inputs, call T01 services, return public dictionaries, and map domain failures through the existing `ApiError`/request-id machinery.
4. Add `tests/test_runtime_registry_api.py` covering happy paths, missing auth, malformed auth, invalid token, project not found, project access denied, malformed/empty chat payload, request-id propagation, and non-leakage of tokens/secrets.
5. Run the S01+S02 backend contract suite to catch regressions in auth, project context, request IDs, and structured errors.

## Must-Haves
- [ ] Every S02 endpoint requires bearer auth and resolves the same `RequestContext` shape as S01 before returning project-scoped metadata or chat responses.
- [ ] `POST /runtime/chat` returns structured stub output containing resolved context, runtime metadata, dispatcher metadata, provider/model metadata, and a deterministic assistant message.
- [ ] API tests prove negative auth/project/input paths and verify error/request-id behavior; no endpoint returns 200 with an error body.
- [ ] No route introduces real model calls, real tool execution, skill execution, provider secret loading, memory persistence, or unbounded list output.

## Failure Modes
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| S01 auth/project dependencies | Preserve existing 401/403/404 structured errors with request IDs. | N/A; in-memory only. | Tests fail if context fields differ from `RequestContext.to_public_dict()`. |
| T01 services | Convert expected contract validation problems to `ApiError`/422 or fail tests; do not leak internals. | N/A; no network calls. | Tests assert required top-level keys and `status: stubbed`. |
| FastAPI/Pydantic validation | Return 422 with request ID for malformed payloads. | N/A. | Tests cover empty prompt/wrong body shape. |

## Load Profile
- **Shared resources**: FastAPI app state seed store and static service descriptors.
- **Per-operation cost**: One bearer-token lookup, one project-context lookup, and one in-memory service call per endpoint.
- **10x breakpoint**: FastAPI worker/request overhead appears first; no DB, provider, vector, or external API bottleneck exists in this slice.

## Negative Tests
- **Malformed inputs**: Missing body, empty/whitespace prompt, missing/unknown `project_id` for `/runtime/chat`, invalid `limit` if registry endpoints support bounds.
- **Error paths**: Missing credentials, malformed bearer header, invalid token, unknown project, and cross-project denial with `user_bob` against Alice-only project if seeded data allows.
- **Boundary conditions**: User with no projects cannot access metadata; response bodies must not contain bearer token values, provider credentials, stack traces, or file paths.

## Verification
- `.venv/bin/python -m pytest tests/test_runtime_registry_api.py`
- `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`

## Inputs

- ``apps/api/main.py``
- ``buildingagent/core/errors.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``tests/test_runtime_registry_services.py``

## Expected Output

- ``apps/api/main.py``
- ``tests/test_runtime_registry_api.py``

## Verification

`.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`

## Observability Impact

Extends the authenticated API inspection surface with request-id-bearing metadata and runtime/chat responses plus contract tests for failure paths, making CLI/Web integration failures diagnosable by comparing HTTP status, `error.code`, `requestId`, and stub metadata fields.

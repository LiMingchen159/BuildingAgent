---
estimated_steps: 48
estimated_files: 3
skills_used: []
---

# T02: Expose authenticated S02 FastAPI contracts and documentation

Wire the T01 services into authenticated FastAPI endpoints and document the additive S02 API contract for CLI/Web consumers. This task closes the slice demo by proving callers can list skeleton metadata and send a context-bearing `/runtime/chat` request through the same auth/project boundary established by S01.

Recommended executor skills: `api-design`, `tdd`, `verify-before-complete`.

Planned endpoint contract:
- `GET /projects/{project_id}/models` — authenticated project-scoped model/provider/default config metadata.
- `GET /projects/{project_id}/memory` — authenticated project-scoped memory stub metadata and empty items list.
- `GET /projects/{project_id}/tools` — authenticated project-scoped inert tool registry metadata.
- `GET /projects/{project_id}/skills` — authenticated project-scoped inert skill registry metadata.
- `POST /runtime/chat` — authenticated body `{project_id, prompt, session_id?}` returning the structured runtime stub response. Keep this path because D006 and the roadmap call out `/runtime/chat` explicitly.

Steps:
1. Add request/response adapter code in `apps/api/main.py`, reusing `get_current_user`, `get_project_context_service`, `get_project_context`, `RequestContext`, and `ApiError` patterns instead of reading seed data directly.
2. Add a bounded Pydantic request model for `/runtime/chat`; require non-empty `project_id` and `prompt`, keep `session_id` optional, and map validation failures to honest 422 responses.
3. Instantiate or dependency-inject the T01 services at the route boundary and return their JSON-friendly payloads without post-hoc mutation that would hide stub metadata.
4. Add FastAPI contract tests for successful metadata endpoints, successful stub chat, unauthenticated failures, cross-project denial, unknown project, malformed chat body, request-id propagation, and no token/secret leakage.
5. Update `docs/API_CONTRACT.md` with S02 endpoint shapes, auth model, response examples, stable error expectations, and explicit M002 stub limitations.

Must-haves:
- Every new endpoint requires bearer authentication and resolves project membership before returning project-scoped metadata.
- `/runtime/chat` response includes the same context fields as `/projects/{project_id}/context`, plus runtime/dispatcher/model/memory metadata from T01.
- Cross-project access by Alice to Bob's project returns structured 403, unknown project returns structured 404, and missing/malformed credentials retain S01's stable 401 codes.
- Documentation is additive and does not break the S01 API contract already consumed by later slices.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Bearer auth provider | Return structured 401 with stable auth code and request id | No external timeout in local/dev provider | Malformed header returns `auth_malformed_authorization` without token leakage |
| Project context service | Return structured 403/404 with project id details only | No external timeout in in-memory service | Route tests fail if context fields are missing or project scope is inconsistent |
| Runtime/registry services | Return structured 500 only for unexpected bugs; expected invalid prompt is 422 | No external timeout in stub services | API tests assert required response keys and stub status to catch malformed adapters |

Load Profile (Q6):
- **Shared resources**: FastAPI app state, seeded in-memory store, static registry descriptors.
- **Per-operation cost**: One bearer lookup, one project-context lookup, and one small in-memory metadata assembly per endpoint.
- **10x breakpoint**: TestClient/local in-memory implementation should remain cheap; future real registries will need pagination/caching, but M002 descriptor lists stay bounded.

Negative Tests (Q7):
- **Malformed inputs**: Missing `project_id`, blank `prompt`, wrong JSON types, and malformed authorization header.
- **Error paths**: Unauthenticated caller, invalid token, cross-project project id, unknown project id.
- **Boundary conditions**: User with no projects cannot chat/list project metadata for any project; memory returns an empty list with explicit project scope rather than falling back to global data.

Inputs:
- `apps/api/main.py` — S01 FastAPI composition root, auth dependencies, request-id middleware, and structured error mapping.
- `buildingagent/runtime/service.py` — T01 runtime chat stub service.
- `buildingagent/memory/service.py` — T01 project-scoped memory service skeleton.
- `buildingagent/memory/store.py` — T01 project-scoped memory stub store.
- `buildingagent/models/providers.py` — T01 provider configuration skeleton service.
- `buildingagent/models/catalog.py` — T01 model/provider metadata service.
- `buildingagent/tools/registry.py` — T01 tool registry metadata service.
- `buildingagent/skills/registry.py` — T01 skill registry metadata service.
- `tests/test_api_auth_context.py` — existing API test patterns and helper expectations.
- `docs/API_CONTRACT.md` — existing S01 downstream contract to extend additively.

Expected Output:
- `apps/api/main.py` — authenticated S02 metadata and `/runtime/chat` routes wired to T01 services.
- `tests/test_api_runtime_registries.py` — API contract tests for metadata endpoints, runtime chat, auth/project failures, validation, request IDs, and no secret leakage.
- `docs/API_CONTRACT.md` — documented additive S02 API contract and stub limitations.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/memory/store.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/models/catalog.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``tests/test_api_auth_context.py``
- ``docs/API_CONTRACT.md``

## Expected Output

- ``apps/api/main.py``
- ``tests/test_api_runtime_registries.py``
- ``docs/API_CONTRACT.md``

## Verification

`.venv/bin/python -m pytest tests/test_api_runtime_registries.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py`

## Observability Impact

Extends the API inspection surface with request-id-preserving metadata/chat endpoints. API tests must verify both success and failure payloads carry `X-Request-ID`/`error.requestId`, and successful stub chat exposes enough non-secret runtime state for future CLI/Web/debug agents to localize whether a response came from auth, context resolution, registry metadata, or runtime stub assembly.

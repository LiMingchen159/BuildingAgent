---
estimated_steps: 33
estimated_files: 3
skills_used: []
---

# T02: Expose authenticated FastAPI endpoints and API contract docs

Wire the S02 service contracts into authenticated FastAPI endpoints and document the additive API contract for CLI/Web consumers. This increment must keep HTTP handlers thin: auth/project-context resolution stays in the S01 dependencies, and domain behavior stays in the reusable services from T01.

Steps:
1. Add Pydantic request/response mapping for `POST /runtime/chat` in `apps/api/main.py`, with prompt validation and project context resolved through `get_project_context`.
2. Add authenticated metadata endpoints in `apps/api/main.py`: `GET /models`, `GET /projects/{project_id}/memory`, `GET /tools`, and `GET /skills`. Project-scoped endpoints must require a project context; global metadata endpoints still require bearer auth and should not expose secrets.
3. Instantiate or dependency-inject the S02 services through small helper dependencies, keeping route handlers as composition/mapping only.
4. Add `tests/test_api_runtime_registry.py` covering successful authenticated calls, context-bearing `/runtime/chat`, request-id propagation, unauthenticated 401, malformed prompt 422 or stable structured validation error, project not found 404, cross-project denial 403, and non-leakage of tokens/file paths/heavy dependency names.
5. Update `docs/API_CONTRACT.md` with additive endpoint documentation, request/response examples, status/error behavior, pagination/versioning stance for metadata lists, and explicit no-real-execution/no-secrets notes.
6. Re-run S01 tests alongside new S02 tests to prove existing auth/project contracts still hold.

Must-haves:
- All new non-health endpoints require bearer auth.
- Project-bearing endpoints call `get_project_context` and return the same `context` shape as S01.
- `/runtime/chat` returns a structured stub response with context, runtime, dispatcher, and model/provider metadata; it must not execute prompts, tools, skills, or model calls.
- `docs/API_CONTRACT.md` becomes the downstream contract source for S03 CLI and S04 Web.
- Existing S01 API behavior remains backward-compatible.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| Bearer authentication | Return existing structured 401 codes with request id | N/A for in-process auth | Existing malformed auth errors remain stable |
| Project context resolution | Return existing structured 403/404 codes with request id | N/A for in-memory context | Handler must not synthesize partial context |
| Runtime chat request body | Return validation error without executing prompt | N/A; no model/tool calls | Tests assert empty/oversized/wrong-type prompt failures are safe |

Load Profile:
- **Shared resources**: FastAPI app state plus static in-memory descriptors.
- **Per-operation cost**: One bearer-token lookup, optional project-context lookup, and small JSON serialization.
- **10x breakpoint**: In-memory seed lookups are fine for M002; real metadata stores will need pagination/caching before production scale.

Negative Tests:
- **Malformed inputs**: Missing auth, malformed bearer header, invalid token, empty prompt, oversized prompt, unknown project id, and unauthorized project id.
- **Error paths**: Structured 401/403/404/422 responses must include `error.requestId` and omit secrets/stack traces/file paths.
- **Boundary conditions**: `user_no_projects` sees empty project list and cannot access project-scoped memory/chat; repeated registry calls are deterministic.

Observability Impact:
- Signals added/changed: New endpoint responses inherit `X-Request-ID`; runtime chat body includes stub runtime/dispatcher/model metadata for diagnostics.
- How a future agent inspects this: Use `tests/test_api_runtime_registry.py`, existing S01 API tests, or the documented examples in `docs/API_CONTRACT.md`.
- Failure state exposed: Auth/project/validation failures return stable structured error codes with request ids, without leaking tokens or file paths.

Executor skills_used frontmatter should include `api-design`, `tdd`, and `verify-before-complete`.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/core/errors.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``docs/API_CONTRACT.md``

## Expected Output

- ``apps/api/main.py``
- ``tests/test_api_runtime_registry.py``
- ``docs/API_CONTRACT.md``

## Verification

`.venv/bin/python -m pytest tests/test_api_runtime_registry.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py && grep -n "POST /runtime/chat" docs/API_CONTRACT.md && grep -n "GET /models" docs/API_CONTRACT.md && grep -n "GET /tools" docs/API_CONTRACT.md && grep -n "GET /skills" docs/API_CONTRACT.md`

## Observability Impact

HTTP-visible diagnostics are extended through request-id-preserving success and error responses plus documented runtime/dispatcher/model stub metadata.

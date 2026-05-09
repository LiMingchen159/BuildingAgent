---
estimated_steps: 47
estimated_files: 5
skills_used: []
---

# T03: Expose authenticated skeleton APIs and document downstream contracts

Wire the T01/T02 services into authenticated FastAPI endpoints and document the contract for CLI/Web consumers. This task is retained because the current S02 pre-execution state includes T03; it must be internally consistent and explicitly creates the provider/memory skeleton files it references.

Recommended executor skills: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Confirm `buildingagent/models/providers.py` and `buildingagent/memory/service.py` provide minimal functional M002 skeleton behavior: non-secret provider/model defaults and project-scoped memory metadata with empty items.
2. Add Pydantic request models and serialization helpers to `apps/api/main.py` or small imported helpers if the executor finds `main.py` needs splitting.
3. Expose authenticated project-context metadata endpoints for model/provider, memory, tool, and skill metadata; each endpoint must resolve `RequestContext` using the existing S01 dependency and return stable `items` or metadata containers.
4. Expose `POST /runtime/chat` with body `{project_id, prompt}`; resolve context via `ProjectContextService`, call the runtime stub service, and return the structured stub result.
5. Reuse S01 structured errors/request-id middleware for auth failures, inaccessible/missing projects, and validation failures; do not invent a second error envelope.
6. Extend `docs/API_CONTRACT.md` with the S02 endpoint list, request/response examples, stub-only warnings, and downstream CLI/Web notes.
7. Add TestClient contract tests covering successful metadata and runtime responses, auth/project failures, malformed chat input, request-id propagation, and no leakage of bearer tokens/provider secrets.

Must-haves:
- Every S02 API endpoint requires bearer authentication and project context except no new public endpoints are added.
- `/runtime/chat` remains stub-only but proves the future runtime/dispatcher boundary with resolved context metadata.
- Cross-project and unknown-project failures use the same 403/404 structured error semantics as S01.
- Documentation names exact endpoints and response fields expected by S03 CLI and S04 Web.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| Auth provider / bearer token | Existing structured 401 with request ID | Not applicable; local provider | Existing malformed authorization 401 |
| Project context service | Existing structured 403/404 with project ID only | Not applicable; in-memory | Tests reject route code that bypasses `RequestContext` |
| Runtime/registry services | Convert planned domain validation failures to honest 4xx where applicable; unexpected bugs may remain 500 | Not applicable; no I/O | Tests assert response has required `items`, `context`, `runtime`, and `dispatcher` keys |

Load Profile (Q6):
- **Shared resources**: FastAPI app state seed store and immutable in-memory service data.
- **Per-operation cost**: one auth lookup, one project-context lookup, and in-memory service assembly.
- **10x breakpoint**: no external bottleneck in M002; bounded metadata lists and concise prompt handling prevent payload bloat.

Negative Tests (Q7):
- **Malformed inputs**: missing/blank `prompt`, missing/invalid `project_id`, and invalid auth header should return 4xx, not 200-with-error.
- **Error paths**: inaccessible and unknown projects must return structured 403/404 without leaking other project data.
- **Boundary conditions**: seeded users with no projects cannot retrieve metadata or chat for a project they do not belong to; request IDs are echoed on success and failure.

Inputs:
- `apps/api/main.py` — S01 FastAPI composition root and request-id middleware.
- `buildingagent/core/errors.py` — structured error shape to preserve.
- `buildingagent/projects/context.py` — project context service and domain errors.
- `buildingagent/projects/models.py` — shared `RequestContext` shape.
- `buildingagent/projects/seeds.py` — deterministic local/dev fixtures for tests.
- `buildingagent/models/providers.py` — same-task provider configuration skeleton service.
- `buildingagent/memory/service.py` — same-task project-scoped memory service skeleton.
- `buildingagent/tools/registry.py` — tool registry skeleton service from earlier task or same slice output.
- `buildingagent/skills/registry.py` — skill registry skeleton service from earlier task or same slice output.
- `buildingagent/runtime/service.py` — runtime chat skeleton service from earlier task or same slice output.
- `docs/API_CONTRACT.md` — API contract to extend additively.

Expected Output:
- `buildingagent/models/providers.py` — provider configuration skeleton explicitly created for T03 if not already present.
- `buildingagent/memory/service.py` — project-scoped memory service skeleton explicitly created for T03 if not already present.
- `apps/api/main.py` — S02 API route wiring.
- `tests/test_api_runtime_skeleton.py` — API contract tests for T03 route wiring.
- `docs/API_CONTRACT.md` — S02 API contract documentation.

## Inputs

- ``apps/api/main.py``
- ``buildingagent/core/errors.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/runtime/service.py``
- ``docs/API_CONTRACT.md``

## Expected Output

- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``apps/api/main.py``
- ``tests/test_api_runtime_skeleton.py``
- ``docs/API_CONTRACT.md``

## Verification

`.venv/bin/python -m pytest tests/test_api_runtime_skeleton.py`

## Observability Impact

Extends API-level inspection surfaces with authenticated metadata endpoints and `/runtime/chat` responses that include request IDs via existing middleware plus context/runtime/dispatcher metadata in the body. Future agents inspect failures with TestClient tests and by checking structured `error.code`/`error.requestId` responses; secrets and bearer tokens must remain redacted.

---
estimated_steps: 28
estimated_files: 8
skills_used: []
---

# T01: Implement reusable inert runtime and registry services

Create reusable, transport-agnostic skeleton services for runtime chat, model/provider catalog, project memory, tool registry, and skill registry so API routes are thin composition only. Executor skills_used frontmatter should include `api-design` and `tdd`.

## Steps
1. Expand `buildingagent/runtime/service.py` with typed request/response dataclasses or Pydantic-independent structures for deterministic stub chat, including context serialization, dispatcher metadata, selected provider/model metadata, and explicit no-real-execution reasons.
2. Complete `buildingagent/tools/registry.py` and `buildingagent/skills/registry.py` with deterministic non-executing metadata descriptors and bounded list methods; do not import or execute building-domain tool modules or skill prompt files.
3. Tighten/extend `buildingagent/models/catalog.py`, `buildingagent/models/providers.py`, `buildingagent/memory/service.py`, and `buildingagent/memory/store.py` only as needed to expose consistent project-scoped skeleton metadata while keeping provider secrets, persistence, retrieval, ranking, and vector storage out of scope.
4. Add `tests/test_runtime_registry_services.py` proving direct service behavior for seeded `RequestContext` objects, including project ID propagation, stub status fields, no secret/token fields, registry bounds, and deterministic chat output.

## Must-Haves
- [ ] Services accept an already-authorized `RequestContext` instead of resolving auth or reading seed data directly.
- [ ] Runtime chat stub returns context, runtime metadata, dispatcher metadata, provider/model selection, and a deterministic assistant message without invoking a real model.
- [ ] Tool/skill registries expose metadata only and never execute building-domain tools or load skill prompt logic.
- [ ] Memory metadata is project-scoped and empty/inert, making isolation visible without retrieval.
- [ ] Tests assert that public dictionaries do not contain bearer tokens, provider secret values, stack traces, or filesystem paths.

## Failure Modes
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `RequestContext` from S01 | Raise a typed value/contract error in service tests; HTTP mapping is handled in T02. | N/A; in-memory only. | Tests fail if required context fields are missing or not propagated. |
| Stub provider/model catalog | Return deterministic stub metadata or fail fast in tests; never call external providers. | N/A; no network calls. | Tests assert required provider/model IDs and `status: stubbed`. |

## Load Profile
- **Shared resources**: Static in-memory descriptors only.
- **Per-operation cost**: O(1) for runtime/model/memory metadata; O(n) over a tiny fixed registry for tool/skill list operations.
- **10x breakpoint**: Not expected in M002; future registries should add cursor pagination before dynamic/unbounded metadata is introduced.

## Negative Tests
- **Malformed inputs**: Empty prompt and whitespace prompt should be rejected by the runtime service contract or later by the API request model; unknown optional model/provider IDs should not trigger real provider lookup.
- **Error paths**: Service tests should prove no external network/provider/tool call is attempted.
- **Boundary conditions**: Empty memory list, fixed registry list, and repeated calls should produce deterministic output.

## Verification
- `.venv/bin/python -m pytest tests/test_runtime_registry_services.py`
- `.venv/bin/python -m pytest tests/test_project_context.py tests/test_runtime_registry_services.py` to ensure service contracts still align with S01 context shapes.

## Inputs

- ``buildingagent/projects/models.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``tests/test_project_context.py``

## Expected Output

- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/catalog.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/memory/store.py``
- ``tests/test_runtime_registry_services.py``

## Verification

`.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

## Observability Impact

Adds explicit `status`, `stub_reason`, runtime, dispatcher, provider/model, and context fields to service outputs so downstream API/CLI/Web failures can be localized to context resolution versus inert service behavior without exposing secrets.

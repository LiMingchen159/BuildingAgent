---
estimated_steps: 48
estimated_files: 8
skills_used: []
---

# T01: Create transport-agnostic runtime, registry, memory, and model skeleton services

Build the reusable domain/service layer that represents S02 capabilities without binding them to FastAPI. This task closes the core R023 skeleton work by creating typed, deterministic, in-memory metadata services for model/provider configuration, project-scoped memory stubs, tool registry stubs, skill registry stubs, and runtime chat stub assembly.

Recommended executor skills: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add package/module boundaries for runtime, memory, model/provider config, tool registry, and skill registry using simple dataclasses or Pydantic-free domain objects that accept a `RequestContext` where project scope matters.
2. Implement deterministic metadata: one or more stub providers/models, project default model metadata, memory scope/status with empty entries, tool descriptors for existing building placeholder categories marked disabled/not executable, and skill descriptors marked placeholder/disabled.
3. Implement a runtime chat service that accepts a `RequestContext` plus prompt/session metadata and returns a JSON-friendly stub response with context, `status: stubbed`, non-secret provider/model selection, dispatcher mode, tools considered/executed empty, memory scope, and a human-readable stub message.
4. Keep all execution seams explicit and inert: no provider API calls, no tool imports beyond safe metadata, no skill file execution, no filesystem scanning of untrusted skill code, no vector store, no audit persistence, and no heavy building-domain dependencies.
5. Add service-level tests that lock down stub semantics, context propagation, project-scoped memory shape, metadata stability, and absence of token/secret-like fields.

Must-haves:
- Service outputs are JSON-friendly and include `RequestContext.to_public_dict()` where downstream callers need context.
- Metadata descriptors include stable ids, names, status/availability, stub reason, and relevant permission/audit hints without claiming real enforcement.
- Runtime stub includes dispatcher/runtime/model/memory metadata and never claims a real model/tool/skill was invoked.
- Tests use tracked inline fixtures/seeded context from `buildingagent.projects.seeds`, not `.gsd/` or ignored fixtures.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Local seeded `RequestContext` and in-memory registries | Raise typed/domain validation errors or return explicit empty metadata, never fallback to global project data | No async/external timeout path in M002; keep operations in-memory and bounded | Service tests should fail if required ids/status/context fields are missing or non-JSON-friendly |

Load Profile (Q6):
- **Shared resources**: Static in-memory metadata and seeded project context.
- **Per-operation cost**: O(number of stub providers/tools/skills), expected to stay tiny in M002.
- **10x breakpoint**: Descriptor list growth would first affect response size/readability; keep bounded deterministic lists and leave pagination for future real registries if needed.

Negative Tests (Q7):
- **Malformed inputs**: Empty prompt should be rejected by the runtime service or API request model before a stub response is assembled.
- **Error paths**: Unknown/cross-project context stays outside this service and is covered in T02 via `ProjectContextService`.
- **Boundary conditions**: Empty memory entries and disabled placeholder registries still return stable `items` arrays and project scope metadata.

Inputs:
- `buildingagent/projects/models.py` — existing `RequestContext` serialization and permission scope types.
- `buildingagent/projects/seeds.py` — deterministic local/dev context fixtures for tests.
- `buildingagent/tools/building/bim_ifc_tools.py` — placeholder category names to represent as metadata without execution.
- `docs/RUNTIME_SPEC.md` — runtime lifecycle and stub boundary guidance.
- `docs/MEMORY_SPEC.md` — project-scoped memory isolation expectations.
- `docs/MODEL_CONFIGURATION_SPEC.md` — provider/model configuration metadata expectations.
- `docs/TOOL_SYSTEM_SPEC.md` — dispatcher metadata and permission/audit hint expectations.
- `docs/SKILL_SYSTEM_SPEC.md` — skill registry metadata expectations.

Expected Output:
- `buildingagent/runtime/__init__.py` — package export for runtime skeleton services.
- `buildingagent/runtime/service.py` — runtime chat stub service and JSON-friendly response assembly.
- `buildingagent/memory/__init__.py` — package export for memory skeleton services.
- `buildingagent/memory/service.py` — project-scoped memory service skeleton for M002 callers.
- `buildingagent/memory/store.py` — project-scoped memory stub store returning empty/stub metadata.
- `buildingagent/models/__init__.py` — package export for model/provider metadata services.
- `buildingagent/models/providers.py` — provider configuration skeleton service with non-secret provider/model defaults.
- `buildingagent/models/catalog.py` — deterministic model/provider configuration skeleton metadata.
- `buildingagent/tools/__init__.py` — package export for tool registry metadata.
- `buildingagent/tools/registry.py` — inert tool registry descriptors and dispatcher metadata helpers.
- `buildingagent/skills/__init__.py` — package export for skill registry metadata.
- `buildingagent/skills/registry.py` — inert skill registry descriptors.
- `tests/test_runtime_registry_services.py` — service-level contract tests for runtime, registry, memory, skill, and model skeletons.

## Inputs

- ``buildingagent/projects/models.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/tools/building/bim_ifc_tools.py``
- ``docs/RUNTIME_SPEC.md``
- ``docs/MEMORY_SPEC.md``
- ``docs/MODEL_CONFIGURATION_SPEC.md``
- ``docs/TOOL_SYSTEM_SPEC.md``
- ``docs/SKILL_SYSTEM_SPEC.md``

## Expected Output

- ``buildingagent/runtime/__init__.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/memory/__init__.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/memory/store.py``
- ``buildingagent/models/__init__.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/models/catalog.py``
- ``buildingagent/tools/__init__.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/__init__.py``
- ``buildingagent/skills/registry.py``
- ``tests/test_runtime_registry_services.py``

## Verification

`.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

## Observability Impact

Adds non-secret runtime/dispatcher/model/memory metadata in the service response so a future agent can distinguish deliberate M002 stubbing from failed execution. Service tests should verify the response exposes `status: stubbed`, dispatcher mode, selected provider/model ids, project memory scope, and zero executed tools.

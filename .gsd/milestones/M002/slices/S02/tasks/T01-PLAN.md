---
estimated_steps: 16
estimated_files: 7
skills_used: []
---

# T01: Implement deterministic runtime and registry service contracts

Complete the transport-agnostic S02 service layer so runtime, memory, model/provider, tool registry, and skill registry skeletons return deterministic, non-secret, project-scoped metadata without touching HTTP concerns or real execution.

Executor skills: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Inspect the existing S01 request-context model in `buildingagent/projects/models.py` and the current skeleton files listed below.
2. Define simple dataclass/Pydantic-compatible response structures or plain dictionaries for provider/model metadata, memory scope/status metadata, tool registry descriptors, skill registry descriptors, and runtime chat stubs.
3. Implement service/registry functions in `buildingagent/runtime/service.py`, `buildingagent/memory/service.py`, `buildingagent/models/providers.py`, `buildingagent/tools/registry.py`, and `buildingagent/skills/registry.py` that accept or include a `RequestContext` where project scoping matters.
4. Keep all outputs deterministic and explicitly stubbed using fields such as `status: stubbed`, `stub_reason`, `items`, `project_id`, provider/model IDs, dispatcher status, and serialized context.
5. Add `tests/test_runtime_registry_contracts.py` covering service determinism, context propagation, empty/list metadata shapes, no-real-execution status, and redaction/non-leakage checks. Preserve and update `tests/test_runtime_registry_services.py` as needed so the baseline service skeleton tests remain meaningful rather than redundant.

Must-haves:
- Services remain transport-agnostic and import no FastAPI symbols.
- No external model SDK, vector store, skill loader execution, tool execution, shell command, file scan, or building-domain dependency is introduced.
- Runtime chat returns a deterministic stub response for a caller-provided prompt and request context.
- Metadata descriptors are safe for CLI/Web display and contain no token/secret/path-like fields.

Failure Modes (Q5): Dependencies are in-memory `RequestContext` and static registry descriptors only; malformed or missing context should fail visibly in tests rather than being hidden. No network timeouts or malformed external responses exist in this task.

Load Profile (Q6): Shared resources are static tuples/dataclasses and caller-provided context; per-operation cost is trivial serialization. At 10x local test load, Python object allocation and response size are the only meaningful costs.

Negative Tests (Q7): Verify empty memory/registry lists remain explicit `items: []`, runtime stub metadata is deterministic for repeated calls, service outputs include the exact caller project context, and descriptors do not contain secret/token/path-like fields.

## Inputs

- ``buildingagent/projects/models.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``tests/test_project_context.py``

## Expected Output

- ``buildingagent/runtime/service.py``
- ``buildingagent/memory/service.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``tests/test_runtime_registry_contracts.py``
- ``tests/test_runtime_registry_services.py``

## Verification

.venv/bin/python -m pytest tests/test_runtime_registry_contracts.py tests/test_runtime_registry_services.py

## Observability Impact

Adds explicit `status: stubbed`, `stub_reason`, provider/model ids, dispatcher/tool/skill registry ids, memory scope metadata, and serialized request context fields to service outputs so future API/CLI/Web failures can distinguish intentionally inert skeletons from missing wiring.

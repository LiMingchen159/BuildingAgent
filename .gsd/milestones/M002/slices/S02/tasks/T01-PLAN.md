---
estimated_steps: 5
estimated_files: 6
skills_used: []
---

# T01: Implement deterministic runtime and registry service contracts

Complete the transport-agnostic S02 service layer so runtime, memory, model/provider, tool registry, and skill registry skeletons return deterministic, non-secret, project-scoped metadata without touching HTTP concerns or real execution.

Expected skills_used frontmatter: `api-design`, `tdd`, `verify-before-complete`.

Failure Modes (Q5): dependencies are in-memory `RequestContext` and static registry descriptors only; malformed or missing context should fail as normal Python type/attribute errors in tests rather than being hidden. No network timeouts or malformed external responses exist in this task.

Load Profile (Q6): shared resources are static tuples/dataclasses and caller-provided context; per-operation cost is trivial serialization. At 10x local test load, Python object allocation and response size are the only meaningful costs.

Negative Tests (Q7): verify empty memory/registry lists remain explicit `items: []`, runtime stub metadata is deterministic for repeated calls, service outputs include the exact caller project context, and descriptors do not contain secret/token/path-like fields.

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

## Verification

.venv/bin/python -m pytest tests/test_runtime_registry_contracts.py

## Observability Impact

Adds explicit `status: stubbed`, `stub_reason`, provider/model ids, dispatcher/tool/skill registry ids, and serialized request context fields to service outputs so future API/CLI/Web failures can distinguish intentionally inert skeletons from missing wiring.

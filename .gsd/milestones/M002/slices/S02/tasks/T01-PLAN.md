---
estimated_steps: 5
estimated_files: 6
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T01: Define transport-agnostic runtime and registry skeleton services

Create the transport-agnostic skeleton services and domain contracts that define what models, memory, tools, skills, dispatcher metadata, and stub runtime chat mean before any HTTP wiring is added. Expected skills: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add typed dataclasses or Pydantic-friendly domain objects for model/provider metadata, memory summary metadata, tool metadata, skill metadata, dispatcher metadata, and runtime chat request/response under `buildingagent/`.
2. Implement deterministic local/dev services that accept a `RequestContext` and return project-scoped safe metadata, with explicit flags such as `stubbed`, `execution_performed`, or equivalent wording that makes non-execution impossible to miss.
3. Implement stub runtime chat so a prompt plus `RequestContext` returns a response containing a generated/local stub message, the public context dict, dispatcher/runtime metadata, and selected/default model metadata; it must not call a provider, read untracked files, or execute building-domain tools.
4. Keep registry metadata additive and bounded; include IDs/names/descriptions/statuses but avoid provider secrets, file paths, stack traces, prompt-injection content, or raw skill file loading.
5. Add domain tests in `tests/test_runtime_registry_services.py` covering project-context echo, deterministic metadata, project isolation by context input, no execution flags, prompt validation behavior, and absence of secret/token-looking values.

Must-haves:
- Services depend on `RequestContext` rather than HTTP requests or raw seed data.
- Stub runtime/dispatcher boundaries are explicit enough for M003 to insert authorization/audit enforcement later.
- Memory metadata is project-scoped and never returns another project id when called with a given context.
- Tests are written before or alongside implementation and fail if real execution flags are omitted.

## Inputs

- ``buildingagent/projects/models.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/tools/building/bim_ifc_tools.py``
- ``buildingagent/tools/building/brick_rdf_sparql_tools.py``
- ``skills/building/README.md``

## Expected Output

- ``buildingagent/models/registry.py``
- ``buildingagent/memory/store.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/runtime/service.py``
- ``skills/building/README.md``
- ``tests/test_runtime_registry_services.py``

## Verification

`.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

## Observability Impact

Adds safe stub diagnostics at the domain boundary: runtime status, dispatcher mode, provider/tool/skill IDs, project id, and non-execution flags. Future agents can inspect failing behavior through `tests/test_runtime_registry_services.py` without running a server or external dependency.

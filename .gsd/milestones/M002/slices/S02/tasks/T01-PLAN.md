---
estimated_steps: 30
estimated_files: 7
skills_used: []
---

# T01: Implement transport-agnostic runtime and registry skeleton services

Create or complete the transport-agnostic service layer for S02 so API, CLI, and Web callers can share one deterministic skeleton contract instead of duplicating route logic. The increment must stay explicitly inert: no model calls, no skill loading/execution, no building-domain tool execution, no memory retrieval/ranking, and no persistence.

Steps:
1. Implement typed dataclass/service contracts in `buildingagent.runtime.service`, `buildingagent.tools.registry`, `buildingagent.skills.registry`, and, if useful, `buildingagent.models.catalog`, reusing the existing `ModelProviderService` and `ProjectMemoryService` shapes.
2. Make every service method accept or include a `RequestContext` where project scoping matters, and serialize through JSON-friendly `to_public_dict()` methods.
3. Add deterministic registry metadata for model/provider, memory, tools, and skills with `status: "stubbed"`, clear `stub_reason` text, and no secrets or file paths.
4. Implement a `RuntimeChatService` that validates/normalizes a bounded prompt request and returns a structured stub response with context, message ids/timestamps or deterministic placeholders, runtime status, dispatcher metadata, model selection, and an assistant message that truthfully says execution is stubbed.
5. Extend `tests/test_runtime_registry_services.py` with real assertions for the new service contracts, including prompt validation, project-scoped memory metadata, deterministic model selection, inert tool/skill registries, and non-leakage of tokens/heavy imports/file paths.

Must-haves:
- Services are transport-agnostic and importable without FastAPI.
- Runtime/tool/skill/model/memory outputs are deterministic and non-secret.
- No public method actually executes a tool, invokes a model, loads skill prompt files, retrieves memory, or imports heavy building-domain libraries.
- Tests prove services echo the S01 `RequestContext` shape where relevant and stay inside the stub boundary.

Failure Modes:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| `ProjectContextService` / seed context used by tests | Surface domain exception in tests; do not catch in service tests because S01 owns context resolution | N/A for in-memory deterministic service | Tests should fail if context serialization differs from `RequestContext.to_public_dict()` |
| Stub model/provider catalog | Return deterministic `status: stubbed`; no external connectivity | N/A; no network calls allowed | Tests fail if provider/model selection is missing required ids or leaks secrets |

Load Profile:
- **Shared resources**: In-memory static descriptors only.
- **Per-operation cost**: Constant-time serialization of small metadata lists and one bounded prompt string.
- **10x breakpoint**: Not meaningful for M002 stubs; future real registries will need pagination/caching if metadata grows.

Negative Tests:
- **Malformed inputs**: Empty/whitespace prompt, oversized prompt, and non-executable registry expectations.
- **Error paths**: Attempted real execution methods such as `execute`, `invoke`, `dispatch`, or `run` must not exist as public registry APIs.
- **Boundary conditions**: Empty memory item list, deterministic repeated calls, and prompt boundary length behavior.

Observability Impact:
- Signals added/changed: Runtime stub result includes context ids, runtime status, dispatcher status, model/provider ids, and explicit stub reason.
- How a future agent inspects this: Run `tests/test_runtime_registry_services.py` or instantiate services from `buildingagent.runtime.service`, `buildingagent.tools.registry`, `buildingagent.skills.registry`, `buildingagent.models.providers`, and `buildingagent.memory.service`.
- Failure state exposed: Validation errors from the service should identify invalid prompt shape without exposing prompt content beyond safe bounded fields.

Executor skills_used frontmatter should include `tdd` and `verify-before-complete`.

## Inputs

- ``buildingagent/projects/models.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/seeds.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``tests/test_runtime_registry_services.py``

## Expected Output

- ``buildingagent/runtime/service.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/catalog.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/memory/service.py``
- ``tests/test_runtime_registry_services.py``

## Verification

`.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

## Observability Impact

Runtime/service metadata becomes inspectable through deterministic stub fields before HTTP wiring; validation failures should be explicit and safe.

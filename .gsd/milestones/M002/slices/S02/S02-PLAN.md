# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, explicitly stubbed backend skeleton APIs for model/provider metadata, project-scoped memory, tool registry, skill registry, and runtime chat. The slice should prove that S02 capabilities reuse the S01 bearer-auth and RequestContext contract without invoking real models, tools, skills, memory retrieval, or building-domain dependencies.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- ## Must-Haves
- Authenticated callers can fetch model/provider config metadata, memory metadata/stub entries, tool registry metadata, and skill registry metadata for an accessible project using the S01 bearer token and project context contract.
- `POST /runtime/chat` accepts a project-bearing prompt, resolves the same `RequestContext` shape as `/projects/{project_id}/context`, and returns a structured stub chat response containing context, model/provider metadata, dispatcher metadata, memory scope, and an explicit no-real-execution status.
- Cross-project, unknown-project, unauthenticated, malformed auth, and malformed chat prompt failures return stable structured 4xx errors with `error.code`, `error.details`, and `error.requestId`; S02 must not introduce 200-with-error or stack-trace leakage.
- Domain modules are transport-agnostic and reusable by later CLI/Web/runtime slices; FastAPI handlers remain thin adapters around those services.
- M002 execution scope remains stubbed: no real model invocation, building-domain tool execution, skill code loading, vector store, external services, provider secrets, or heavy building dependencies.
- `docs/API_CONTRACT.md` documents the new additive S02 endpoints, request/response shapes, auth requirements, error behavior, and explicit stub limitations for S03/S04 consumers.
- ## Threat Surface
- **Abuse**: Attackers may tamper with `project_id` in metadata or chat requests to access another project, submit blank/oversized prompts, infer available tools/skills outside their membership, or treat stub dispatcher metadata as proof of real authorization. The plan keeps project resolution in `ProjectContextService`, validates chat input at the API boundary, and marks dispatcher/model/tool execution as stubbed/not executed.
- **Data exposure**: Responses may expose user/project/workspace IDs, role, permission scopes, available stub metadata, and memory scope. They must not expose bearer tokens, provider secrets, filesystem paths, stack traces, real memory contents, or building-domain data.
- **Input trust**: Bearer tokens, path/body `project_id`, and chat `prompt` are untrusted HTTP input. S02 must rely on S01 auth/context dependencies and Pydantic validation, not direct seed-store lookups in handlers.
- ## Requirement Impact
- **Requirements touched**: R023 is directly advanced by implementing Hermes-like runtime, memory, tool, skill, and model configuration skeletons. R026 is advanced by proving runtime/registry API endpoints resolve and return the same authoritative request-context shape. R015 and R016 are supported through skill/model metadata surfaces. R024, R025, and R017 remain future M003 constraints; S02 must preserve dispatcher, project-scope, and audit seams without claiming full enforcement.
- **Re-verify**: Existing S01 auth/project API tests, new service contract tests, new S02 API contract tests, request-id propagation, structured error behavior, cross-project denial, unknown-project behavior, and no-token/secret leakage in successful and error responses.
- **Decisions revisited**: Honor D001 local/dev auth provider seam, D002 slice ordering, D003 stubbed runtime/execution scope, D004 API composition/testing layout, and D006 S02 authenticated API/service shape.
- ## Verification
- `.venv/bin/python -m pytest tests/test_runtime_registry_services.py tests/test_api_runtime_registries.py tests/test_api_runtime_skeleton.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`
- `tests/test_runtime_registry_services.py` must assert transport-agnostic service outputs are project/context-bearing, explicitly stubbed, secret-free, and isolated by `project_id`.
- `tests/test_api_runtime_registries.py` and `tests/test_api_runtime_skeleton.py` must assert all S02 endpoints require auth, resolve accessible project context, reject cross-project/unknown project access with structured errors, validate malformed chat input, propagate `X-Request-ID`, and return a stub chat payload containing context plus runtime/dispatcher/model/memory metadata.

## Proof Level

- This slice proves: Contract/integration proof within the FastAPI TestClient boundary. This slice proves authenticated HTTP routing, request-context propagation, service composition, stable response/error shapes, and explicit stub semantics. It does not prove live model execution, real tool dispatch, durable memory retrieval, production auth, audit retention, CLI behavior, or Web behavior.

## Integration Closure

Upstream surfaces consumed: `apps/api/main.py` auth/context dependencies, `buildingagent.projects.context.ProjectContextService`, `buildingagent.projects.models.RequestContext`, `buildingagent.core.errors.ApiError`, seeded project fixtures, and `docs/API_CONTRACT.md`. New wiring introduced: transport-agnostic services under `buildingagent/runtime`, `buildingagent/memory`, `buildingagent/models`, `buildingagent/tools`, and `buildingagent/skills` are composed into authenticated FastAPI endpoints, including project-bearing `POST /runtime/chat`. Remaining milestone wiring: S03 CLI and S04 Web still need to consume these HTTP contracts, and S05 still needs integrated launchability/diagnostics across API/CLI/Web.

## Verification

- Runtime/API diagnostics remain local and contract-level. Every S02 endpoint must preserve S01 `X-Request-ID` propagation and structured error bodies; runtime chat stub responses should include non-secret dispatcher/runtime metadata (`mode: stub`, selected provider/model ids, tools considered, tools executed as empty, memory scope) so future agents can inspect why no real execution occurred. Responses must not echo bearer tokens, provider secrets, stack traces, or filesystem paths.

## Tasks

- [ ] **T01: Create transport-agnostic runtime, registry, memory, and model skeleton services** `est:2h`
  Build the reusable domain/service layer that represents S02 capabilities without binding them to FastAPI. This task closes the core R023 skeleton work by creating typed, deterministic, in-memory metadata services for model/provider configuration, project-scoped memory stubs, tool registry stubs, skill registry stubs, and runtime chat stub assembly.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/memory/service.py``, ``buildingagent/memory/store.py``, ``buildingagent/models/providers.py``, ``buildingagent/models/catalog.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``tests/test_runtime_registry_services.py``
  - Verify: `.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

- [ ] **T02: Expose authenticated S02 FastAPI contracts and documentation** `est:2h`
  Wire the T01 services into authenticated FastAPI endpoints and document the additive S02 API contract for CLI/Web consumers. This task closes the slice demo by proving callers can list skeleton metadata and send a context-bearing `/runtime/chat` request through the same auth/project boundary established by S01.
  - Files: ``apps/api/main.py``, ``tests/test_api_runtime_registries.py``, ``docs/API_CONTRACT.md``
  - Verify: `.venv/bin/python -m pytest tests/test_api_runtime_registries.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py`

- [ ] **T03: Expose authenticated skeleton APIs and document downstream contracts** `est:1.5h`
  Wire the T01/T02 services into authenticated FastAPI endpoints and document the contract for CLI/Web consumers. This task is retained because the current S02 pre-execution state includes T03; it must be internally consistent and explicitly creates the provider/memory skeleton files it references.
  - Files: ``buildingagent/models/providers.py``, ``buildingagent/memory/service.py``, ``apps/api/main.py``, ``tests/test_api_runtime_skeleton.py``, ``docs/API_CONTRACT.md``
  - Verify: `.venv/bin/python -m pytest tests/test_api_runtime_skeleton.py`

## Files Likely Touched

- `buildingagent/runtime/service.py`
- `buildingagent/memory/service.py`
- `buildingagent/memory/store.py`
- `buildingagent/models/providers.py`
- `buildingagent/models/catalog.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `tests/test_runtime_registry_services.py`
- `apps/api/main.py`
- `tests/test_api_runtime_registries.py`
- `docs/API_CONTRACT.md`
- `tests/test_api_runtime_skeleton.py`

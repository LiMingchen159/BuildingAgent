# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, explicitly stubbed runtime/chat, model/provider, memory, tool, and skill skeleton API contracts that reuse the S01 request-context boundary and remain transport-agnostic for later CLI/Web consumers.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- ## Must-Haves
- Authenticated callers can list project-scoped model/provider metadata through a documented API endpoint without secrets or real provider calls.
- Authenticated callers can inspect project-scoped memory metadata through a documented API endpoint that echoes the resolved S01 `RequestContext` and returns no cross-project data.
- Authenticated callers can list inert tool and skill registry metadata through documented API endpoints without importing heavy building-domain dependencies or executing skills/tools.
- Authenticated callers can submit `POST /runtime/chat` with a prompt and project id and receive a deterministic structured stub response containing the resolved context, model selection, runtime status, and dispatcher metadata.
- All new API surfaces preserve S01 request-id propagation and structured error semantics for missing credentials, malformed auth, invalid tokens, unknown projects, and cross-project denial.
- ## Threat Surface
- **Abuse**: Callers may tamper with `project_id`, send oversized/empty chat prompts, enumerate registry metadata, or try to infer unavailable projects through runtime/memory endpoints. Handlers must resolve `RequestContext` through S01 services and validate prompt shape before returning stubs.
- **Data exposure**: Responses may include user/workspace/project ids, role, permission scopes, registry names, and stub metadata. They must not include bearer tokens, provider secrets, stack traces, file paths, `.gsd` paths, or private building data.
- **Input trust**: The chat prompt is untrusted user input reaching the API/runtime boundary. M002 should echo bounded diagnostic metadata, not execute prompt content, call models, dispatch tools, read files, or persist memory.
- ## Requirement Impact
- **Requirements touched**: R015, R016, R023, R026; supports future R020/R021 consumers and preserves future R024/R025 boundaries without completing them.
- **Re-verify**: Existing S01 auth/project tests plus new service/API contract tests for runtime, registry, model, memory, request-id, and negative auth/project paths.
- **Decisions revisited**: D001, D002, D003, D004, D006, D007, D008, D009, D010, D011 are honored; none are reversed.
- ## Verification
- `.venv/bin/python -m pytest tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`
- `grep -n "POST /runtime/chat" docs/API_CONTRACT.md && grep -n "GET /models" docs/API_CONTRACT.md && grep -n "GET /tools" docs/API_CONTRACT.md && grep -n "GET /skills" docs/API_CONTRACT.md`
- ## Observability / Diagnostics
- Runtime signals: `X-Request-ID` on success/failure and structured stub fields such as `runtime.status`, `runtime.execution_mode`, `dispatcher.status`, `model.provider_id`, and context ids.
- Inspection surfaces: `docs/API_CONTRACT.md`, pytest contract failures, and TestClient responses from `/runtime/chat`, `/models`, `/projects/{project_id}/memory`, `/tools`, and `/skills`.
- Failure visibility: stable structured error codes with `error.requestId` for auth/project/validation failures; no stack traces or file paths in payloads.
- Redaction constraints: never return bearer tokens, provider API keys, environment values, local file paths, `.gsd` data, or private building-domain data.

## Proof Level

- This slice proves: Contract-level API and domain proof. The slice proves deterministic service contracts and authenticated FastAPI wiring using pytest/TestClient; it does not prove live model execution, real tool dispatch, persistent memory retrieval, streaming, audit retention, or CLI/Web integration.

## Integration Closure

Upstream S01 surfaces consumed: `apps/api/main.py` request-id/auth/project dependencies, `buildingagent.projects.context.ProjectContextService`, `buildingagent.projects.models.RequestContext`, `buildingagent.core.errors`, and `docs/API_CONTRACT.md`. New wiring introduced: transport-agnostic runtime/registry/memory/model services are composed into authenticated FastAPI endpoints, including `POST /runtime/chat`, `GET /models`, `GET /projects/{project_id}/memory`, `GET /tools`, and `GET /skills`. Remaining milestone integration: S03 CLI and S04 Web still need to call these endpoints, and M003 still needs real permission enforcement, audit persistence, memory retrieval, and actual tool/model execution.

## Verification

- Every new endpoint should inherit S01 `X-Request-ID` propagation and structured error shape. The runtime chat stub response must include non-secret context/runtime/dispatcher/model metadata so a future agent can diagnose which authenticated context and stubbed boundary handled a request. Failure-path tests must prove unauthenticated and unauthorized project requests return stable codes without leaking tokens, stack traces, file paths, or heavy building-domain imports.

## Tasks

- [ ] **T01: Implement transport-agnostic runtime and registry skeleton services** `est:1h 30m`
  Create or complete the transport-agnostic service layer for S02 so API, CLI, and Web callers can share one deterministic skeleton contract instead of duplicating route logic. The increment must stay explicitly inert: no model calls, no skill loading/execution, no building-domain tool execution, no memory retrieval/ranking, and no persistence.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``buildingagent/models/catalog.py``, ``buildingagent/models/providers.py``, ``buildingagent/memory/service.py``, ``tests/test_runtime_registry_services.py``
  - Verify: `.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

- [ ] **T02: Expose authenticated FastAPI endpoints and API contract docs** `est:2h`
  Wire the S02 service contracts into authenticated FastAPI endpoints and document the additive API contract for CLI/Web consumers. This increment must keep HTTP handlers thin: auth/project-context resolution stays in the S01 dependencies, and domain behavior stays in the reusable services from T01.
  - Files: ``apps/api/main.py``, ``tests/test_api_runtime_registry.py``, ``docs/API_CONTRACT.md``
  - Verify: `.venv/bin/python -m pytest tests/test_api_runtime_registry.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py && grep -n "POST /runtime/chat" docs/API_CONTRACT.md && grep -n "GET /models" docs/API_CONTRACT.md && grep -n "GET /tools" docs/API_CONTRACT.md && grep -n "GET /skills" docs/API_CONTRACT.md`

- [ ] **T03: Document and verify the S02 backend contract** `est:45m`
  Document the S02 API contract and run the final backend regression checks so CLI and Web executors can consume the new skeleton endpoints without reverse-engineering code. Executor skills_used frontmatter should include `api-design`, `write-docs`, and `verify-before-complete`.
  - Files: ``docs/API_CONTRACT.md``, ``tests/test_runtime_registry_api.py``, ``tests/test_api_foundation.py``, ``tests/test_project_context.py``, ``tests/test_api_auth_context.py``, ``tests/test_runtime_registry_services.py``, ``apps/api/main.py``
  - Verify: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`

## Files Likely Touched

- `buildingagent/runtime/service.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `buildingagent/models/catalog.py`
- `buildingagent/models/providers.py`
- `buildingagent/memory/service.py`
- `tests/test_runtime_registry_services.py`
- `apps/api/main.py`
- `tests/test_api_runtime_registry.py`
- `docs/API_CONTRACT.md`
- `tests/test_runtime_registry_api.py`
- `tests/test_api_foundation.py`
- `tests/test_project_context.py`
- `tests/test_api_auth_context.py`

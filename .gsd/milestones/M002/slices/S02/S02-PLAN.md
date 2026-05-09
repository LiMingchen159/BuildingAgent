# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, project-context-bearing skeleton APIs for runtime chat, project memory, tool registry, skill registry, and model/provider metadata while keeping all execution explicitly inert and reusable outside FastAPI.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- Authenticated callers can list project-scoped model/provider metadata, memory metadata, tool registry metadata, and skill registry metadata through FastAPI endpoints that all resolve the S01 `RequestContext`.
- Authenticated callers can submit `POST /runtime/chat` for an accessible project and receive a deterministic structured stub response containing prompt echo/summary, resolved context IDs, runtime status, dispatcher metadata, and selected stub provider/model metadata.
- Missing credentials, malformed credentials, invalid tokens, inaccessible projects, unknown projects, invalid list limits, and malformed chat payloads return canonical structured errors with request IDs.
- Runtime, memory, model/provider, tool, and skill behavior remains explicitly stubbed: no real model calls, no building-domain tool execution, no skill prompt loading/execution, no provider secrets, and no project memory retrieval/ranking/vector storage.
- Reusable domain services live under `buildingagent/*` and API contract documentation is updated additively in `docs/API_CONTRACT.md` for downstream S03/S04 consumers.
- Threat Surface (Q3): Abuse risks are project_id tampering, unauthenticated registry discovery, oversized/empty prompts, attempts to infer inaccessible project metadata, and attempts to trigger real provider/tool/skill execution. Data exposure is limited to non-secret seeded IDs, roles, scopes, and stub metadata; responses must not expose tokens, secrets, stack traces, file paths, memory contents, or building data. Input trust boundaries are untrusted `project_id`, list `limit`, and chat payload fields, all gated by S01 auth/context and validation.
- Requirement Impact (Q4): Directly advances R015, R016, R023, and R026. R024/R025/R017 remain compatibility constraints only: preserve dispatcher, isolation, and audit seams without claiming full M003 enforcement or audit retention. Re-verify S01 auth/project context tests, new service tests, new API tests, request-id/error-shape behavior, and API docs. Decisions honored: D001, D002, D003, D004, D006, D008, D009, and D010.
- Slice Verification: `.venv/bin/python -m pytest tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`; a TestClient smoke should log in `user_alice`, call `/models`, `/memory`, `/tools`, `/skills`, and `/runtime/chat` for `project_hkust_demo`, and assert request IDs, stub status, and context project IDs; documentation check: `grep -q "POST /runtime/chat" docs/API_CONTRACT.md && grep -q "GET /models" docs/API_CONTRACT.md && grep -q "GET /tools" docs/API_CONTRACT.md && grep -q "GET /skills" docs/API_CONTRACT.md && grep -q "GET /memory" docs/API_CONTRACT.md`.

## Proof Level

- This slice proves: Contract-level backend/API proof: authenticated HTTP and reusable service contracts with deterministic in-memory stubs and pytest/TestClient assertions. This does not prove live model execution, real tool execution, persistent memory retrieval, provider secret handling, CLI/Web integration, or M003 permission enforcement.

## Integration Closure

Upstream S01 surfaces consumed: `apps/api/main.py` auth dependencies, `buildingagent.projects.models.RequestContext`, `buildingagent.projects.context.ProjectContextService`, `buildingagent.core.errors.ApiError`, seeded local/dev fixtures, and the existing `docs/API_CONTRACT.md` error/request-id contract. New wiring introduced: reusable runtime/registry/model/memory services are instantiated behind authenticated FastAPI endpoints, including `POST /runtime/chat` and project-scoped metadata endpoints. Remaining milestone work: S03 CLI and S04 Web still need to consume these endpoints end-to-end; S05 still needs integrated launchability diagnostics and git workflow.

## Verification

- Runtime signals: stable `X-Request-ID`, canonical structured error bodies, and response fields such as `status`, `stub_reason`, `runtime.mode`, `dispatcher.status`, `provider.status`, and `model.status`. Inspection surfaces: pytest contract tests, TestClient smoke, `docs/API_CONTRACT.md`, and the authenticated metadata endpoints themselves. Redaction constraints: never include bearer token values, provider credentials, stack traces, filesystem paths, real memory contents, or Hermes source snippets in responses.

## Tasks

- [ ] **T01: Implement reusable inert runtime and registry services** `est:1.5h`
  Create reusable, transport-agnostic skeleton services for runtime chat, model/provider catalog, project memory, tool registry, and skill registry so API routes are thin composition only. Executor skills_used frontmatter should include `api-design` and `tdd`.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``buildingagent/models/catalog.py``, ``buildingagent/models/providers.py``, ``buildingagent/memory/service.py``, ``buildingagent/memory/store.py``, ``tests/test_runtime_registry_services.py``
  - Verify: `.venv/bin/python -m pytest tests/test_runtime_registry_services.py`

- [ ] **T02: Expose authenticated FastAPI skeleton endpoints and contract tests** `est:2h`
  Wire the reusable skeleton services into authenticated FastAPI endpoints and API contract tests. Executor skills_used frontmatter should include `api-design`, `tdd`, and `verify-before-complete`.
  - Files: ``apps/api/main.py``, ``tests/test_runtime_registry_api.py``, ``buildingagent/runtime/service.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``buildingagent/models/providers.py``, ``buildingagent/memory/service.py``
  - Verify: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`

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
- `buildingagent/memory/store.py`
- `tests/test_runtime_registry_services.py`
- `apps/api/main.py`
- `tests/test_runtime_registry_api.py`
- `docs/API_CONTRACT.md`
- `tests/test_api_foundation.py`
- `tests/test_project_context.py`
- `tests/test_api_auth_context.py`

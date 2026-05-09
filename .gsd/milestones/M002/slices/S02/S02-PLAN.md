# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, project-scoped skeleton APIs for model/provider metadata, memory metadata, tool registry metadata, skill registry metadata, and deterministic runtime chat without real model, memory, skill, or tool execution.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- ## Must-Haves
- Authenticated callers can list project-scoped model/provider metadata, memory metadata, tool registry metadata, and skill registry metadata, and each response includes the resolved S01 request context or project identifiers needed by downstream CLI/Web callers.
- Authenticated callers can `POST /runtime/chat` with a prompt and `project_id` path context and receive a deterministic structured stub response containing the resolved `RequestContext`, selected provider/model metadata, dispatcher/runtime status, and an explicit no-real-execution reason.
- All S02 API endpoints reject missing, malformed, invalid-token, unknown-project, and cross-project access cases through the existing structured error shape and request-id header; response bodies must not leak bearer tokens, provider secrets, stack traces, or file paths.
- Skeleton services stay transport-agnostic in `buildingagent/*` modules and do not import or execute building-domain tools, skill prompt code, external model SDKs, vector stores, or heavy building dependencies.
- `docs/API_CONTRACT.md` documents the S02 additive endpoint shapes for S03/S04 consumers.
- ## Threat Surface
- **Abuse**: Prompt submission and project-id parameters can be tampered with to attempt cross-project context resolution, privilege escalation, or accidental real execution. This slice must route all project-bearing endpoints through `get_project_context`, keep runtime/tool/skill/model behavior stubbed, and avoid dispatching user prompts to real tools/providers.
- **Data exposure**: Responses expose local/dev user/workspace/project IDs, roles, permission scopes, and non-secret registry metadata only. They must not expose bearer tokens, provider credentials, stack traces, local file paths, memory contents from other projects, or skill prompt internals.
- **Input trust**: `POST /runtime/chat` receives untrusted prompt text and optional metadata. Validation should bound/require the prompt enough for a skeleton contract and treat it as echoed diagnostic input only, never as code, file path, shell command, provider request, or tool invocation.
- ## Requirement Impact
- **Requirements touched**: R023 is directly advanced by implementing Hermes-like runtime, memory, tool, skill, and model configuration skeletons. R026 is advanced by proving the same request-context object reaches runtime/registry/memory/model API boundaries. R015 and R016 are supported by exposing skill/model configuration metadata that later CLI/Web slices can inspect. R024, R025, and R017 remain future M003 enforcement/audit requirements and must not be overclaimed here.
- **Re-verify**: S01 auth/project context contract tests plus new S02 service/API contract tests must pass together via `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_api_runtime_registry.py`.
- **Decisions revisited**: Honors D001, D002, D003, D004, D006, D007, and D008; no new structural decision is required unless implementation discovers the documented endpoint shape cannot fit the existing FastAPI/service boundary.
- ## Verification
- Add and pass `tests/test_runtime_registry_contracts.py` for transport-agnostic service contracts, deterministic stub metadata, project-scoped context serialization, and no-real-execution status.
- Add and pass `tests/test_api_runtime_registry.py` for authenticated endpoint contracts, `/runtime/chat` prompt validation, request-id propagation, cross-project denial, unknown project handling, invalid auth handling, and non-leakage of tokens/secrets/file paths.
- Run the combined regression command: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_api_runtime_registry.py`.

## Proof Level

- This slice proves: Contract/integration proof against the local FastAPI app using deterministic in-memory services and TestClient; no real model provider, vector store, skill loader, tool execution, external service, browser, or CLI runtime is required.

## Integration Closure

Consumes the S01 FastAPI composition root in `apps/api/main.py`, the `get_project_context` dependency, structured `ApiError` handling, request-id middleware, and reusable `RequestContext` serialization. Introduces new service-to-HTTP wiring for S02 endpoints and updates `docs/API_CONTRACT.md` so S03 CLI and S04 Web can consume one documented authenticated contract. End-to-end CLI/Web entrypoints, real provider execution, permission/audit enforcement depth, and live runtime loops remain for later slices/milestones.

## Verification

- Every new endpoint remains behind S01 request-id middleware and structured error handling, returns explicit `status: stubbed`/`stub_reason` metadata where execution is intentionally absent, and preserves non-secret diagnostic metadata so future agents can distinguish auth/project failures from intentionally stubbed runtime behavior.

## Tasks

- [ ] **T01: Implement deterministic runtime and registry service contracts** `est:1h`
  Complete the transport-agnostic S02 service layer so runtime, memory, model/provider, tool registry, and skill registry skeletons return deterministic, non-secret, project-scoped metadata without touching HTTP concerns or real execution.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/memory/service.py``, ``buildingagent/models/providers.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``tests/test_runtime_registry_contracts.py``
  - Verify: .venv/bin/python -m pytest tests/test_runtime_registry_contracts.py

- [ ] **T02: Expose authenticated S02 FastAPI endpoints and contract tests** `est:1h30m`
  Wire the S02 services into authenticated FastAPI endpoints and document the additive API contract for downstream CLI/Web slices. Endpoints should be thin HTTP adapters over the services from T01, reuse S01 dependencies and error handling, and keep `/runtime/chat` deterministic and explicitly stubbed.
  - Files: ``apps/api/main.py``, ``docs/API_CONTRACT.md``, ``tests/test_api_runtime_registry.py``
  - Verify: .venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_api_runtime_registry.py

- [ ] **T03: Document and smoke-test the S02 contract for downstream clients** `est:1h`
  Document the additive S02 API contract and add a final smoke-style contract test that proves the demo path downstream CLI/Web slices should consume.
  - Files: `docs/API_CONTRACT.md`, `tests/test_api_runtime_registry.py`, `tests/test_api_foundation.py`, `tests/test_project_context.py`, `tests/test_api_auth_context.py`, `tests/test_runtime_registry_services.py`
  - Verify: .venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py

## Files Likely Touched

- `buildingagent/runtime/service.py`
- `buildingagent/memory/service.py`
- `buildingagent/models/providers.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `tests/test_runtime_registry_contracts.py`
- `apps/api/main.py`
- `docs/API_CONTRACT.md`
- `tests/test_api_runtime_registry.py`
- docs/API_CONTRACT.md
- tests/test_api_runtime_registry.py
- tests/test_api_foundation.py
- tests/test_project_context.py
- tests/test_api_auth_context.py
- tests/test_runtime_registry_services.py

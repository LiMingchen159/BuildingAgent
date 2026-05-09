# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, project-scoped skeleton APIs for model/provider metadata, memory metadata, tool registry metadata, skill registry metadata, and deterministic runtime chat without real model, memory, skill, or tool execution.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- ## Must-Haves
- Authenticated callers can list project-scoped model/provider metadata, memory metadata, tool registry metadata, and skill registry metadata through S01-authenticated API boundaries.
- Authenticated callers can `POST /projects/{project_id}/runtime/chat` with a prompt and receive a deterministic structured stub response containing the resolved `RequestContext`, selected provider/model metadata, dispatcher/runtime status, and an explicit no-real-execution reason.
- All project-bearing S02 endpoints resolve the same S01 request-context object and reject missing auth, malformed auth, invalid tokens, unknown projects, and cross-project access through existing structured error shapes and request-id headers.
- Responses expose only non-secret local/dev user/workspace/project IDs, roles, permission scopes, and registry metadata; they must not leak bearer tokens, provider credentials, stack traces, or local file paths.
- Skeleton services remain transport-agnostic in `buildingagent/*` modules and do not import or execute building-domain tools, skill prompt code, external model SDKs, vector stores, shell commands, or heavy building dependencies.
- `docs/API_CONTRACT.md` documents the additive S02 endpoint shapes for S03/S04 consumers.
- ## Threat Surface
- **Abuse**: Prompt submission and project-id parameters can be tampered with to attempt cross-project context resolution, privilege escalation, or accidental real execution. All project-bearing endpoints must route through `get_project_context`, keep runtime/tool/skill/model behavior stubbed, and never dispatch user prompts to tools/providers.
- **Data exposure**: Responses may expose local/dev user/workspace/project identifiers, roles, permission scopes, and non-secret registry metadata only. They must not expose bearer tokens, provider credentials, stack traces, local file paths, memory contents from other projects, or skill prompt internals.
- **Input trust**: `POST /projects/{project_id}/runtime/chat` receives untrusted prompt text and optional metadata. Validation should require a non-empty prompt and treat it as echoed diagnostic input only, never as code, file path, shell command, provider request, or tool invocation.
- ## Requirement Impact
- **Requirements touched**: R023 is directly advanced by implementing Hermes-like runtime, memory, tool, skill, and model configuration skeletons. R026 is advanced by proving the same request-context object reaches runtime/registry/memory/model API boundaries. R015 and R016 are supported by exposing skill/model configuration metadata that later CLI/Web slices can inspect. R024, R025, and R017 remain future M003 enforcement/audit requirements and must not be overclaimed here.
- **Re-verify**: S01 auth/project context contract tests plus new S02 service/API contract tests must pass together via `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_api_runtime_registry.py`.
- **Decisions honored**: D001, D002, D003, D004, D006, D007, D008, and MEM005/MEM008 require provider-shaped auth, transport-agnostic domain services, shared project-context resolution, and no real execution in M002.
- ## Verification
- Add and pass `tests/test_runtime_registry_contracts.py` for deterministic service contracts, static non-secret metadata, project-scoped context serialization, and no-real-execution status.
- Add and pass `tests/test_runtime_registry_services.py` for the current M002 service skeleton baseline so pre-execution can verify the runtime/registry/memory/model scaffold before implementation deepens it.
- Add and pass `tests/test_api_runtime_registry.py` for authenticated endpoint contracts, `/projects/{project_id}/runtime/chat` prompt validation, request-id propagation, cross-project denial, unknown project handling, invalid auth handling, downstream smoke path, and non-leakage of tokens/secrets/file paths.
- Run the combined regression command: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`.

## Proof Level

- This slice proves: Contract/integration proof against the local FastAPI app using deterministic in-memory services and TestClient. This proves authenticated API shape, request-context propagation, and no-real-execution behavior; it does not prove real model provider calls, vector storage, skill loading, tool execution, CLI/Web clients, streaming, or production audit/permission enforcement.

## Integration Closure

Consumes the S01 FastAPI composition root in `apps/api/main.py`, the `get_project_context` dependency, structured `ApiError` handling, request-id middleware, and reusable `RequestContext` serialization. Introduces transport-agnostic S02 service contracts plus thin authenticated FastAPI wiring, then updates `docs/API_CONTRACT.md` so S03 CLI and S04 Web can consume one documented contract. End-to-end CLI/Web entrypoints, real provider execution, permission/audit enforcement depth, vector retrieval, skill loading, and live runtime loops remain for later slices/milestones.

## Verification

- S02 adds request-id-bearing authenticated metadata/chat endpoints and explicit `status: stubbed`, `stub_reason`, provider/model identifiers, dispatcher/tool/skill registry identifiers, memory scope metadata, and serialized request-context fields. Tests must verify structured errors and redaction behavior so future agents can distinguish auth failures, project-context failures, validation failures, and intentionally inert runtime behavior.

## Tasks

- [ ] **T01: Implement deterministic runtime and registry service contracts** `est:1h`
  Complete the transport-agnostic S02 service layer so runtime, memory, model/provider, tool registry, and skill registry skeletons return deterministic, non-secret, project-scoped metadata without touching HTTP concerns or real execution.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/memory/service.py``, ``buildingagent/models/providers.py``, ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``tests/test_runtime_registry_contracts.py``, ``tests/test_runtime_registry_services.py``
  - Verify: .venv/bin/python -m pytest tests/test_runtime_registry_contracts.py tests/test_runtime_registry_services.py

- [ ] **T02: Expose authenticated S02 FastAPI endpoints, docs, and smoke tests** `est:1h30m`
  Wire the S02 services into authenticated FastAPI endpoints, document the additive API contract, and add API/smoke tests for the downstream path S03 CLI and S04 Web should consume. Endpoints should be thin HTTP adapters over T01 services, reuse S01 dependencies and error handling, and keep runtime chat deterministic and explicitly stubbed.
  - Files: ``apps/api/main.py``, ``docs/API_CONTRACT.md``, ``tests/test_api_runtime_registry.py``
  - Verify: .venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_contracts.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py

- [ ] **T03: Document and smoke-test the S02 contract for downstream clients** `est:1h`
  Document the additive S02 API contract and keep a final smoke-style contract test plan visible for downstream client executors. This task owns the missing `tests/test_runtime_registry_services.py` scaffold/test artifact that caused the pre-execution blocker; if T01 already updated it, T03 should preserve it and ensure it remains aligned with the documented smoke contract.
  - Files: ``docs/API_CONTRACT.md``, ``tests/test_api_runtime_registry.py``, ``tests/test_runtime_registry_services.py``
  - Verify: .venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py

## Files Likely Touched

- `buildingagent/runtime/service.py`
- `buildingagent/memory/service.py`
- `buildingagent/models/providers.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `tests/test_runtime_registry_contracts.py`
- `tests/test_runtime_registry_services.py`
- `apps/api/main.py`
- `docs/API_CONTRACT.md`
- `tests/test_api_runtime_registry.py`

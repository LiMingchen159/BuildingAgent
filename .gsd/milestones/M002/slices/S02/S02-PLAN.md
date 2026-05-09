# S02: Runtime, registry, memory, and model skeleton APIs

**Goal:** Expose authenticated, project-context-bearing skeleton APIs for model/provider metadata, project memory metadata, tool registry metadata, skill registry metadata, and stub runtime chat. The APIs must reuse the S01 auth/request-context boundary, remain explicitly non-executing, and provide stable contracts for S03 CLI and S04 Web consumers.
**Demo:** An authenticated caller can list model/provider, memory, tool, and skill registry metadata and send a `/runtime/chat` request that returns a structured stub response containing the resolved context and dispatcher/runtime metadata.

## Must-Haves

- Authenticated callers can list project-scoped model/provider metadata, memory metadata, tool registry metadata, and skill registry metadata through API endpoints that resolve the S01 `RequestContext`.
- Authenticated callers can `POST /runtime/chat` with a selected project and prompt and receive a structured stub response containing the resolved context plus runtime/dispatcher/model metadata.
- All S02 behavior is explicitly stubbed: no LLM calls, no building-domain tool execution, no untrusted skill loading, no provider secrets, no external services, and no Hermes vendoring.
- Domain services are transport-agnostic Python modules under `buildingagent/` so S03/S04 can reuse contracts without importing FastAPI handler internals.
- API contract tests exercise success and negative paths with real assertions in `tests/test_runtime_registry_services.py` and `tests/test_api_runtime_registry.py`.

## Threat Surface

- **Abuse**: Callers may tamper with `project_id` to access another project, send malformed/empty/oversized prompts, or infer unavailable tools/providers from broad registry data. Every project-bearing operation must route through `ProjectContextService.resolve_context`, bound prompt input, and return safe metadata only.
- **Data exposure**: Safe local/dev user, workspace, project, role, permission-scope, registry ID, and stub status fields are exposed. Bearer tokens, provider secrets, stack traces, file paths, memory contents from other projects, and executable tool/skill internals must not appear in responses or errors.
- **Input trust**: Bearer auth, path/body `project_id`, and chat `prompt` are untrusted HTTP inputs. They must be validated by Pydantic/FastAPI and shared domain services before any stub runtime response is built.

## Requirement Impact

- **Requirements touched**: R015, R016, R023 are directly advanced; R026 is advanced by proving runtime/registry APIs use the same request context; R024/R025 remain future M003 enforcement requirements and must not be claimed as fully satisfied.
- **Re-verify**: S01 auth/project context tests plus new S02 API/domain tests must pass together with `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`.
- **Decisions revisited**: D001, D002, D003, D004, and D006 are honored. No structural decision beyond D006 is introduced by this plan.

## Proof Level

- This slice proves: Contract-level API integration proof using in-process FastAPI TestClient and domain-service unit tests.
- Real runtime required: No; runtime chat is an explicit stub and must report that no provider/tool/skill execution occurred.
- Human/UAT required: No; S03/S04 will provide CLI/Web user-facing integration later.

## Verification

- `.venv/bin/python -m pytest tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`
- `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`
- Test assertions must include request-id echo on at least one S02 success and one S02 structured-error response, `execution_performed == false` for chat/tool metadata, and cross-project denial for at least one metadata endpoint or chat request.

## Observability / Diagnostics

- Runtime signals: Safe stub diagnostics in responses, including runtime status, dispatcher mode, selected/default model/provider IDs, project id, and explicit `stubbed: true` or `execution_performed: false` flags.
- Inspection surfaces: `tests/test_runtime_registry_services.py`, `tests/test_api_runtime_registry.py`, S02 additions to `docs/API_CONTRACT.md`, and TestClient response bodies.
- Failure visibility: Existing S01 `X-Request-ID` propagation and canonical structured errors must apply to missing auth, invalid project, cross-project denial, and malformed chat input.
- Redaction constraints: Do not expose bearer tokens, provider secrets, stack traces, filesystem paths, raw skill file contents, or cross-project memory/data.

## Integration Closure

- Upstream surfaces consumed: `apps/api/main.py`, `buildingagent.projects.context.ProjectContextService`, `buildingagent.projects.models.RequestContext`, `buildingagent.core.errors.ApiError`, seeded local/dev project memberships, and the S01 structured error/request-id contract.
- New wiring introduced in this slice: Transport-agnostic runtime/registry/memory/model services are composed into authenticated FastAPI endpoints, including `POST /runtime/chat` and project-scoped metadata endpoints.
- What remains before the milestone is truly usable end-to-end: S03 must consume these endpoints from Typer CLI, S04 must consume them from Next.js, and S05 must run integrated launchability/diagnostic verification.

## Tasks

- [ ] **T01: Define transport-agnostic runtime and registry skeleton services** `est:1.5h`
  - Why: Establish the reusable Python contracts before HTTP wiring so CLI/Web/runtime slices do not import FastAPI handler internals or duplicate registry semantics.
  - Files: `buildingagent/models/registry.py`, `buildingagent/memory/store.py`, `buildingagent/tools/registry.py`, `buildingagent/skills/registry.py`, `buildingagent/runtime/service.py`, `skills/building/README.md`, `tests/test_runtime_registry_services.py`
  - Do: Add deterministic local/dev model/provider, memory, tool, skill, dispatcher, and runtime chat services that accept `RequestContext`, return safe project-scoped metadata, and explicitly report stub/non-execution status.
  - Verify: `.venv/bin/python -m pytest tests/test_runtime_registry_services.py`
  - Done when: Domain tests prove context echo, project-scoped memory metadata, deterministic registry metadata, prompt validation, no execution flags, and no secret/token-looking values.
- [ ] **T02: Expose authenticated skeleton APIs and contract tests** `est:2h`
  - Why: Close the slice demo by making the new skeleton services available through the authenticated API contract S03/S04 will consume.
  - Files: `apps/api/main.py`, `docs/API_CONTRACT.md`, `tests/test_api_runtime_registry.py`, `buildingagent/runtime/service.py`, `buildingagent/models/registry.py`, `buildingagent/memory/store.py`, `buildingagent/tools/registry.py`, `buildingagent/skills/registry.py`
  - Do: Add project-scoped metadata endpoints and `POST /runtime/chat`, reuse S01 request-context resolution for every project-bearing operation, validate malformed chat payloads, and document additive endpoint contracts.
  - Verify: `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py`
  - Done when: Authenticated TestClient calls can list all skeleton metadata and send stub chat with context/runtime/dispatcher metadata, while missing auth, unknown project, cross-project denial, and malformed chat inputs return structured errors.

## Files Likely Touched

- `buildingagent/models/registry.py`
- `buildingagent/memory/store.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `buildingagent/runtime/service.py`
- `skills/building/README.md`
- `tests/test_runtime_registry_services.py`
- `apps/api/main.py`
- `docs/API_CONTRACT.md`
- `tests/test_api_runtime_registry.py`

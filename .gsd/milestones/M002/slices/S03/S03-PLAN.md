# S03: Authenticated CLI primary loop

**Goal:** Implement the authenticated Typer CLI primary loop for M002: local/dev login, non-secret session/project selection state, project listing/selection, model/tool/skill metadata inspection, and stub chat that resolves and prints the same `RequestContext` IDs/scopes used by the backend/domain contract.
**Demo:** From the terminal, a developer can run `buildingagent login`, choose/list/use a project, inspect model/tool/skill metadata, and send a stub chat command that prints the same context IDs returned by the backend contract.

## Must-Haves

- ## Must-Haves
- `buildingagent login`, `buildingagent logout`, `buildingagent project list`, `buildingagent project use <project_id>`, `buildingagent model list`, `buildingagent skills list`, `buildingagent tools list`, and `buildingagent chat` are implemented through Typer and covered by CLI tests.
- CLI auth/project/runtime behavior reuses `LocalDevAuthProvider`, `ProjectContextService`, `RequestContext.to_public_dict()`, seed fixtures, and skeleton runtime/registry/model services rather than reading seed data ad hoc or creating a parallel authorization model.
- Local CLI session/project selection state is non-secret by design where possible, isolated to a configurable state directory for tests, and normal CLI output never prints local/dev bearer tokens.
- Stub chat resolves the selected project context and prints the same `user_id`, `workspace_id`, `project_id`, role, and permission scopes that backend contract tests expect, along with explicit stub/runtime/model metadata.
- Negative paths are covered: unauthenticated commands, invalid users, no selected project, unknown/unauthorized project IDs, and token redaction.
- ## Threat Surface
- **Abuse**: A user can tamper with local CLI state files, pass unknown `user_id`/`project_id` values, replay local/dev tokens, or try to select projects outside membership. The CLI must fail closed through the shared provider/context service and must not treat local state as authorization proof.
- **Data exposure**: Local/dev token material and filesystem paths are the sensitive surfaces. Normal command output and structured errors may show non-secret context IDs/scopes but must not print tokens, stack traces, absolute machine paths, or provider secrets.
- **Input trust**: CLI arguments/options (`user_id`, `project_id`, chat prompt, state-dir/env overrides) are untrusted user input reaching local state files and domain services; tests must cover malformed/empty/unauthorized values.
- ## Requirement Impact
- **Requirements touched**: R021 is directly owned by this slice; R026 is advanced by proving the request-context object at the CLI entry point; R023 is consumed/surfaced through skeleton runtime/model/tool/skill metadata; R009/R010 specifications are implemented for the M002 CLI subset.
- **Re-verify**: CLI command parsing, login/logout, project selection, registry metadata, stub chat context parity, token redaction, and existing S01/S02 service tests.
- **Decisions revisited**: D001, D002, D003, D004, D006, D012. D012 is honored by using local shared services with a backend-client-compatible seam while S02 API runtime endpoints remain unavailable.
- ## Verification
- Add and pass `.venv/bin/python -m pytest tests/test_cli_auth_project.py tests/test_cli_registries.py tests/test_cli_chat.py`.
- Keep existing foundation proof passing with `.venv/bin/python -m pytest tests/test_project_context.py tests/test_runtime_registry_services.py`.
- Add CLI contract documentation in `docs/CLI_CONTRACT.md` describing implemented commands, state location, redaction rules, and the local-adapter vs future HTTP-client seam.
- ## Observability / Diagnostics
- Runtime signals: deterministic CLI exit codes and human-readable, redacted error messages for auth/project/chat failures.
- Inspection surfaces: `buildingagent project list`, `buildingagent project use`, generated test state directories, and `docs/CLI_CONTRACT.md`.
- Failure visibility: missing login, invalid token, no selected project, unknown project, and cross-project denial are surfaced as distinct messages without tracebacks in normal CLI output.
- Redaction constraints: never print bearer tokens, API keys, stack traces, absolute local paths, or untrusted file contents.

## Proof Level

- This slice proves: Contract/integration proof at the local CLI boundary: pytest/Runner tests exercise real Typer commands against shared local/dev domain services and verify request-context parity, session-state behavior, redacted errors, registry metadata, and stub chat output. This does not prove live HTTP API integration because S02 runtime API endpoints are skipped; the CLI backend seam preserves that later S05 integration path.

## Integration Closure

Consumes the S01 shared `AuthProvider`, `ProjectContextService`, seed data, and `RequestContext.to_public_dict()` contracts directly, and consumes the S02-compatible model/memory/runtime/registry skeleton service boundaries locally because S02 HTTP endpoint wiring was skipped. Introduces a CLI backend-adapter seam so later S05 can swap or add an HTTP backend client without changing Typer command behavior. Remaining milestone end-to-end work: S04 Web UI and S05 documented launch diagnostics must still prove API/CLI/Web together.

## Verification

- CLI commands should expose actionable, redacted failure messages for missing login, invalid/unauthorized project selection, missing selected project, and stub chat failures. Local session inspection is via CLI state files and `buildingagent project list`/`buildingagent project use`; tokens must not be printed in normal output, errors, or tests.

## Tasks

- [ ] **T01: Build Typer login and project-selection state loop** `est:2h`
  Create the Typer CLI composition root and local session-state boundary, then implement and test local/dev login, logout, project listing, and project selection commands. This closes the authenticated CLI entry-point and project-context selection half of R021 while preserving the shared S01 auth/context model.
  - Files: ``pyproject.toml``, ``buildingagent/cli/__init__.py``, ``buildingagent/cli/app.py``, ``buildingagent/cli/session.py``, ``buildingagent/cli/backend.py``, ``tests/test_cli_auth_project.py``, ``buildingagent/auth/provider.py``, ``buildingagent/projects/context.py``, ``buildingagent/projects/seeds.py``
  - Verify: `.venv/bin/python -m pytest tests/test_cli_auth_project.py tests/test_project_context.py`

- [ ] **T02: Expose model, tool, and skill metadata commands** `est:2h`
  Implement concrete inert tool and skill registry metadata services and wire the CLI model/tool/skill inspection commands through the local backend adapter. This makes the CLI expose the M002 skeleton registries without executing tools, loading skill prompts, or introducing provider secrets.
  - Files: ``buildingagent/tools/registry.py``, ``buildingagent/skills/registry.py``, ``buildingagent/models/providers.py``, ``buildingagent/cli/app.py``, ``buildingagent/cli/backend.py``, ``tests/test_cli_registries.py``, ``tests/test_runtime_registry_services.py``
  - Verify: `.venv/bin/python -m pytest tests/test_cli_registries.py tests/test_runtime_registry_services.py`

- [ ] **T03: Wire stub chat and document the CLI contract** `est:2h`
  Implement the deterministic runtime chat stub service and the `buildingagent chat` CLI command, then document the resulting CLI contract. This closes the S03 demo by proving a terminal user can send a prompt through the selected authenticated context and see the same context IDs/scopes that the backend/domain contract resolves.
  - Files: ``buildingagent/runtime/service.py``, ``buildingagent/cli/app.py``, ``buildingagent/cli/backend.py``, ``tests/test_cli_chat.py``, ``docs/CLI_CONTRACT.md``, ``buildingagent/models/providers.py``, ``buildingagent/projects/context.py``
  - Verify: `.venv/bin/python -m pytest tests/test_cli_chat.py tests/test_cli_auth_project.py tests/test_cli_registries.py tests/test_runtime_registry_services.py`

## Files Likely Touched

- `pyproject.toml`
- `buildingagent/cli/__init__.py`
- `buildingagent/cli/app.py`
- `buildingagent/cli/session.py`
- `buildingagent/cli/backend.py`
- `tests/test_cli_auth_project.py`
- `buildingagent/auth/provider.py`
- `buildingagent/projects/context.py`
- `buildingagent/projects/seeds.py`
- `buildingagent/tools/registry.py`
- `buildingagent/skills/registry.py`
- `buildingagent/models/providers.py`
- `tests/test_cli_registries.py`
- `tests/test_runtime_registry_services.py`
- `buildingagent/runtime/service.py`
- `tests/test_cli_chat.py`
- `docs/CLI_CONTRACT.md`

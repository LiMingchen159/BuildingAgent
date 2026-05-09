---
estimated_steps: 12
estimated_files: 7
skills_used: []
---

# T03: Wire stub chat and document the CLI contract

Implement the deterministic runtime chat stub service and the `buildingagent chat` CLI command, then document the resulting CLI contract. This closes the S03 demo by proving a terminal user can send a prompt through the selected authenticated context and see the same context IDs/scopes that the backend/domain contract resolves.

Steps:
1. Implement `buildingagent/runtime/service.py` as an inert `RuntimeChatService` with typed request/response helpers or dataclasses; it must accept an already authorized `RequestContext`, a prompt string, and model selection metadata, and return a deterministic stub response with no provider calls or tool execution.
2. Extend `buildingagent/cli/backend.py` with a chat method that resolves selected project context, calls `ModelProviderService.default_selection()`, and calls `RuntimeChatService`.
3. Add `buildingagent chat` to `buildingagent/cli/app.py`; support prompt input as an argument/option suitable for tests, require login and selected project, and print response text plus `user_id`, `workspace_id`, `project_id`, role, permission scopes, provider/model IDs, and stub status.
4. Add `tests/test_cli_chat.py` covering happy path context parity, missing login, no selected project, empty prompt rejection, unauthorized tampered project state, and token redaction.
5. Write `docs/CLI_CONTRACT.md` with implemented commands, local/dev assumptions, state/redaction rules, verification command, and the backend-adapter seam for future HTTP integration.

Must-haves:
- Chat output proves request-context parity with `ProjectContextService.resolve_context(...).to_public_dict()`.
- The runtime service remains explicitly stubbed and does not expose real model/tool execution.
- Empty prompt and invalid/tampered project state fail with actionable, redacted messages.
- Documentation is additive and does not claim live backend/runtime integration beyond the local shared-service adapter.

## Inputs

- ``buildingagent/runtime/service.py``
- ``buildingagent/cli/app.py``
- ``buildingagent/cli/backend.py``
- ``buildingagent/models/providers.py``
- ``buildingagent/projects/context.py``
- ``docs/CLI_SPEC.md``
- ``docs/API_CONTRACT.md``

## Expected Output

- ``buildingagent/runtime/service.py``
- ``buildingagent/cli/app.py``
- ``buildingagent/cli/backend.py``
- ``tests/test_cli_chat.py``
- ``docs/CLI_CONTRACT.md``

## Verification

`.venv/bin/python -m pytest tests/test_cli_chat.py tests/test_cli_auth_project.py tests/test_cli_registries.py tests/test_runtime_registry_services.py`

## Observability Impact

Adds the primary CLI runtime diagnostic surface: stub chat output includes context IDs/scopes and model/runtime stub metadata, while negative paths return redacted CLI errors instead of tracebacks or leaked token/state details.

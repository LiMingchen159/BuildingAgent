---
estimated_steps: 12
estimated_files: 7
skills_used: []
---

# T02: Expose model, tool, and skill metadata commands

Implement concrete inert tool and skill registry metadata services and wire the CLI model/tool/skill inspection commands through the local backend adapter. This makes the CLI expose the M002 skeleton registries without executing tools, loading skill prompts, or introducing provider secrets.

Steps:
1. Replace docstring-only tool/skill registry placeholders with deterministic descriptor dataclasses/services in `buildingagent/tools/registry.py` and `buildingagent/skills/registry.py`; keep them explicitly inert and non-executing.
2. Extend `buildingagent/cli/backend.py` and `buildingagent/cli/app.py` with `model list`, `tools list`, and `skills list` commands that require login plus selected project context and call `ModelProviderService`, `ToolRegistryService`, and `SkillRegistryService`.
3. Print stable tables or JSON-like summaries containing IDs, names, status, and stub reasons, plus context IDs where useful; do not print tokens or claim real execution/configuration.
4. Add/extend service tests as needed so S02 skeleton tests still prove inert modules have no public execution/dispatch/run functions.
5. Add CLI tests in `tests/test_cli_registries.py` for authenticated listing, missing selected project, context parity, and non-secret output.

Must-haves:
- Registry commands fail closed when not logged in or when no project is selected.
- Tool/skill/model listing uses the same selected `RequestContext` as project selection.
- Tool and skill registry modules remain metadata-only and do not expose execution entry points.
- Tests verify deterministic output and redaction.

## Inputs

- ``buildingagent/cli/app.py``
- ``buildingagent/cli/backend.py``
- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/models/providers.py``
- ``tests/test_runtime_registry_services.py``

## Expected Output

- ``buildingagent/tools/registry.py``
- ``buildingagent/skills/registry.py``
- ``buildingagent/cli/app.py``
- ``buildingagent/cli/backend.py``
- ``tests/test_cli_registries.py``
- ``tests/test_runtime_registry_services.py``

## Verification

`.venv/bin/python -m pytest tests/test_cli_registries.py tests/test_runtime_registry_services.py`

## Observability Impact

Adds visible CLI inspection surfaces for stubbed model/tool/skill state and explicit failure messages for missing selected project, which helps diagnose context-selection problems before chat/runtime commands run.

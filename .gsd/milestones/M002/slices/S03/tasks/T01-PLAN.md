---
estimated_steps: 13
estimated_files: 9
skills_used: []
---

# T01: Build Typer login and project-selection state loop

Create the Typer CLI composition root and local session-state boundary, then implement and test local/dev login, logout, project listing, and project selection commands. This closes the authenticated CLI entry-point and project-context selection half of R021 while preserving the shared S01 auth/context model.

Steps:
1. Add the minimal CLI dependency and script entry point in `pyproject.toml` (`typer` and a `buildingagent` console script pointing at the CLI app/callback).
2. Create `buildingagent/cli/app.py`, `buildingagent/cli/session.py`, `buildingagent/cli/backend.py`, and `buildingagent/cli/__init__.py` with a Typer app, configurable state directory, safe JSON session persistence, and a local backend adapter that uses `LocalDevAuthProvider`, `ProjectContextService`, and `LOCAL_DEV_SEED_STORE`.
3. Implement `login`, `logout`, `project list`, and `project use <project_id>` with deterministic local/dev behavior; default login may use `user_alice`, and tests should be able to override user/state directory without touching real home directories.
4. Ensure command output shows user/project/context metadata but never prints bearer tokens or absolute state-file paths.
5. Add CLI tests using Typer's CliRunner in `tests/test_cli_auth_project.py` for happy paths and failure paths.

Must-haves:
- `buildingagent login` writes local session state only after provider-backed authentication succeeds.
- `buildingagent logout` clears local state idempotently.
- `buildingagent project list` requires login and lists only memberships returned by `ProjectContextService`.
- `buildingagent project use <project_id>` resolves the shared request context and rejects unknown or unauthorized projects with redacted errors.
- Tests isolate state in temp directories and assert token redaction.

## Inputs

- ``pyproject.toml``
- ``docs/CLI_SPEC.md``
- ``docs/API_CONTRACT.md``
- ``buildingagent/auth/provider.py``
- ``buildingagent/projects/context.py``
- ``buildingagent/projects/models.py``
- ``buildingagent/projects/seeds.py``

## Expected Output

- ``pyproject.toml``
- ``buildingagent/cli/__init__.py``
- ``buildingagent/cli/app.py``
- ``buildingagent/cli/session.py``
- ``buildingagent/cli/backend.py``
- ``tests/test_cli_auth_project.py``

## Verification

`.venv/bin/python -m pytest tests/test_cli_auth_project.py tests/test_project_context.py`

## Observability Impact

Adds redacted CLI error/output conventions and a test-isolated state directory mechanism so future agents can reproduce auth/project-selection failures without inspecting secrets or real home directories.

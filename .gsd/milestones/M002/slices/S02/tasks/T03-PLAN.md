---
estimated_steps: 16
estimated_files: 3
skills_used: []
---

# T03: Document and smoke-test the S02 contract for downstream clients

Document the additive S02 API contract and keep a final smoke-style contract test plan visible for downstream client executors. This task owns the missing `tests/test_runtime_registry_services.py` scaffold/test artifact that caused the pre-execution blocker; if T01 already updated it, T03 should preserve it and ensure it remains aligned with the documented smoke contract.

Executor skills: `api-design`, `write-docs`, `tdd`, `verify-before-complete`.

Steps:
1. Update `docs/API_CONTRACT.md` with endpoint paths, request/response examples, auth/project scoping, stub/no-execution guarantees, status codes, and additive-only versioning.
2. Add or extend smoke tests so `user_alice` logs in, selects an accessible project, calls all metadata endpoints, posts runtime chat, and sees the same context fields consistently across responses.
3. Keep `tests/test_runtime_registry_services.py` meaningful within current M002 scope: service skeleton tests should verify deterministic project-scoped stub metadata and no building-domain execution.
4. Assert responses and service outputs do not contain bearer tokens, provider API keys, secret references, stack traces, or file paths.
5. Run the full M002 backend contract command.

Must-haves:
- Documentation is concrete enough for S03 CLI and S04 Web executors to implement clients without guessing paths or response keys.
- The smoke path demonstrates authenticated metadata plus context-bearing stub chat routed through runtime/dispatcher boundaries.
- `tests/test_runtime_registry_services.py` exists as a non-empty, meaningful pytest file and is listed as this task's expected output to satisfy pre-execution dependency analysis.
- Final verification includes S01 and S02 tests so new API wiring does not regress the authenticated foundation.

Failure Modes (Q5): Documentation/implementation drift is caught by smoke assertions on documented response keys and context fields.

Load Profile (Q6): Fixed sequence of local in-process TestClient calls against immutable seed data plus direct service tests.

Negative Tests (Q7): Retain T02 negative API tests for blank prompt and auth/project failures; full command includes S01 structured error tests and service redaction checks.

## Inputs

- ``docs/API_CONTRACT.md``
- ``apps/api/main.py``
- ``tests/test_api_runtime_registry.py``
- ``tests/test_api_foundation.py``
- ``tests/test_project_context.py``
- ``tests/test_api_auth_context.py``
- ``tests/test_runtime_registry_services.py``

## Expected Output

- ``docs/API_CONTRACT.md``
- ``tests/test_api_runtime_registry.py``
- ``tests/test_runtime_registry_services.py``

## Verification

.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_api_runtime_registry.py

## Observability Impact

Documents and verifies the contract-level diagnostics that downstream API clients should rely on: request IDs, context echo, stub status, and redaction guarantees.

---
estimated_steps: 24
estimated_files: 7
skills_used: []
---

# T03: Document and verify the S02 backend contract

Document the S02 API contract and run the final backend regression checks so CLI and Web executors can consume the new skeleton endpoints without reverse-engineering code. Executor skills_used frontmatter should include `api-design`, `write-docs`, and `verify-before-complete`.

## Steps
1. Extend `docs/API_CONTRACT.md` with S02 endpoint sections for model/provider metadata, memory metadata, tool registry metadata, skill registry metadata, and `POST /runtime/chat`.
2. Include request examples, response shape summaries, `status: stubbed`/`stub_reason` semantics, non-secret guarantees, and representative structured 401/403/404/422 errors.
3. Cross-check examples against `tests/test_runtime_registry_api.py`; update docs or tests only to resolve true contract mismatches.
4. Run the full backend contract suite covering S01 and S02.
5. Leave explicit notes that real model execution, tool execution, skill loading, memory retrieval, provider secrets, and audit retention remain out of M002/S02.

## Must-Haves
- [ ] `docs/API_CONTRACT.md` is the downstream-facing source of truth for S02 CLI/Web consumers.
- [ ] Documentation is additive and does not break or remove S01 login/project/context contracts.
- [ ] Full pytest command proves S01 regressions and S02 contracts together.
- [ ] Docs state the proof level truthfully: authenticated stub contract only, not live runtime integration.

## Failure Modes
| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| S02 API tests | Update implementation or docs until command passes; do not document untested shapes. | N/A for local pytest. | Examples must match tested keys and status/error semantics. |
| S01 regression tests | Treat failures as blockers because S02 must not weaken auth/context foundation. | N/A for local pytest. | Preserve existing structured error and context shapes. |

## Negative Tests
- **Malformed inputs**: Documented 422 behavior for invalid chat bodies must match API tests.
- **Error paths**: Documented 401/403/404 behavior must match S01/S02 API tests and include request IDs.
- **Boundary conditions**: No docs should imply real execution, persisted memory, provider secrets, or cross-project visibility.

## Verification
- `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`
- `grep -q "POST /runtime/chat" docs/API_CONTRACT.md && grep -q "GET /models" docs/API_CONTRACT.md && grep -q "GET /tools" docs/API_CONTRACT.md && grep -q "GET /skills" docs/API_CONTRACT.md && grep -q "GET /memory" docs/API_CONTRACT.md`

## Inputs

- ``docs/API_CONTRACT.md``
- ``tests/test_runtime_registry_api.py``
- ``tests/test_api_foundation.py``
- ``tests/test_project_context.py``
- ``tests/test_api_auth_context.py``
- ``tests/test_runtime_registry_services.py``
- ``apps/api/main.py``

## Expected Output

- ``docs/API_CONTRACT.md``
- ``tests/test_runtime_registry_api.py``

## Verification

`.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py tests/test_runtime_registry_services.py tests/test_runtime_registry_api.py`

## Observability Impact

Creates the documented diagnostic contract and final regression command for future agents consuming or debugging S02.

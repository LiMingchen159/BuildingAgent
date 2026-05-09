---
estimated_steps: 20
estimated_files: 4
skills_used:
  - api-design
  - tdd
  - verify-before-complete
---

# T01: Establish FastAPI test harness and structured error primitives

Create the Python API/test foundation and canonical response/error primitives so later tasks can build real authenticated endpoints without inventing contract shape.

Expected `skills_used` frontmatter for executor: `api-design`, `tdd`, `verify-before-complete`.

Steps:
1. Add a minimal tracked Python project/test configuration using FastAPI, pytest, httpx, and any needed ASGI test transport; do not introduce external services or secrets.
2. Add package markers where needed so `apps.api.main` and `buildingagent.*` modules import cleanly from tests.
3. Implement the FastAPI app composition root with a public `GET /health` endpoint and middleware/helper support for request IDs.
4. Implement a canonical structured API error helper/model that emits `{ "error": { "code", "message", "details", "requestId" } }` and never exposes stack traces or tokens.
5. Add focused tests proving `/health` works, request IDs are stable/echoed, and a sample structured error can be rendered with the canonical shape.

Must-haves:
- Framework setup is tracked and reproducible from repository files.
- `GET /health` requires no authentication and returns a small status payload suitable for later local diagnostics.
- Structured error shape and request-id behavior are centralized for reuse by auth/context endpoints.

Failure Modes (Q5):
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|-----------------------|
| ASGI/FastAPI test client | fail tests with explicit assertion output | not applicable to in-process tests | assert JSON shape and status code before downstream tasks rely on it |

Negative Tests (Q7):
- Malformed inputs: missing request id header should cause the app to generate one; supplied `X-Request-ID` should be echoed safely.
- Error paths: a test-only or direct helper assertion should prove structured errors include machine-readable codes and request IDs.
- Boundary conditions: empty details should serialize as an object, not `null` or omitted if the contract chooses a stable shape.

## Inputs

- ``README.md``
- ``docs/AUTH_ACCESS_CONTROL_SPEC.md``
- ``docs/ENTRYPOINTS_SPEC.md``
- ``apps/api/.gitkeep``
- ``buildingagent/.gitkeep``
- ``tests/.gitkeep``

## Expected Output

- ``pyproject.toml``
- ``apps/__init__.py``
- ``apps/api/__init__.py``
- ``apps/api/main.py``
- ``buildingagent/__init__.py``
- ``buildingagent/core/errors.py``
- ``tests/test_api_foundation.py``

## Verification

`python -m pytest tests/test_api_foundation.py`

## Observability Impact

Adds the first runtime inspection surface (`GET /health`) and request-id/error primitives that future agents can use to localize API failures without reading server internals.

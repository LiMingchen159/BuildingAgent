---
sliceId: S01
uatType: artifact-driven
verdict: PASS
date: 2026-05-09T11:38:40Z
---

# UAT Result — S01

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Public health endpoint is unauthenticated | runtime | PASS | TestClient `GET /health` without `Authorization`, with `X-Request-ID: uat-health-001`, returned status `200`, body `{'status': 'ok'}`, and response header `x-request-id: uat-health-001`. |
| Missing credentials fail with structured 401 | runtime | PASS | TestClient `GET /auth/me` without `Authorization`, with `X-Request-ID: uat-auth-401`, returned status `401`; canonical `error` object included code `auth_missing_credentials` and requestId `uat-auth-401`; response text did not include token, traceback, file path, or `.py` leak markers checked by the runner. |
| Local/dev login returns deterministic bearer token | runtime | PASS | TestClient `POST /auth/dev-login` with `{'user_id':'user_alice'}` and `X-Request-ID: uat-login-001` returned status `200`, token type `bearer`, user id `user_alice`, `user.is_local_dev: true`, deterministic local/dev token, and request-id echo. |
| Authenticated `/auth/me` returns current user metadata | runtime | PASS | TestClient `GET /auth/me` with `Authorization: Bearer dev-token-alice` and `X-Request-ID: uat-me-001` returned status `200`, user id `user_alice`, email `alice@example.local`, display name `Alice Developer`, `user.is_local_dev: true`, and request-id echo. This `is_local_dev` field is the documented local/dev metadata marker in `docs/API_CONTRACT.md`. |
| Authenticated project list is bounded and evolvable | runtime | PASS | TestClient `GET /projects` and `GET /projects?limit=1` with Alice's bearer token returned status `200`; body included `items` and `pagination`; first item included project identifier (`id`), workspace id, name, role, and permission scopes; `limit=1` returned one item with `{'limit': 1, 'next_cursor': '1', 'has_more': True}`. |
| Project context resolves user/workspace/project/role/scopes | runtime | PASS | Using Alice's returned project `project_hkust_demo`, TestClient `GET /projects/project_hkust_demo/context` with `X-Request-ID: uat-context-001` returned status `200`; `context` contained user_id `user_alice`, workspace_id `workspace_demo`, project_id `project_hkust_demo`, role `owner`, permission_scopes list, and request-id echo. |
| Malformed and invalid bearer headers fail safely | runtime | PASS | TestClient `GET /auth/me` with `Authorization: Basic abc` returned `401` / `auth_malformed_authorization`; `Authorization: Bearer unknown-token` returned `401` / `auth_invalid_token`; response text did not echo `Basic abc`, `unknown-token`, traceback, file paths, or `.py` markers. |
| Unknown and inaccessible projects are honest failures | runtime | PASS | TestClient `GET /projects/not-a-real-project/context` as Alice returned `404` / `project_not_found` with requestId `uat-proj-404`. Bob-only project `project_uc_berkeley_demo` requested as Alice returned `403` / `project_access_denied` with requestId `uat-proj-403`. Both used canonical structured error shape. |
| No-projects boundary user returns an empty list, not an error | runtime | PASS | TestClient `GET /projects` with `Authorization: Bearer dev-token-no-projects` returned status `200`, body `{'items': [], 'pagination': {'limit': 50, 'next_cursor': None, 'has_more': False}}`. |
| Regression test suite from slice close | runtime | PASS | `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` exited `0` with `26 passed in 3.58s`. |

## Overall Verdict

PASS — all 10 automatable S01 UAT checks passed, including `/auth/me` local/dev metadata via the documented `user.is_local_dev` marker.

## Notes

Evidence was collected with `gsd_exec` run `d71812b1-7d48-45a1-b8a5-a0b64b15c35d`; full stdout is stored at `.gsd/exec/d71812b1-7d48-45a1-b8a5-a0b64b15c35d.stdout`. No product-code change was required: inspection showed `apps/api/main.py` already serializes `is_local_dev` in `serialize_user`, `tests/test_api_auth_context.py` asserts it for both dev-login and `/auth/me`, and `docs/API_CONTRACT.md` documents it as the local/dev marker. The previous UAT runner incorrectly looked only for provider-name fields such as `auth_provider`/`provider` and missed the existing documented marker.
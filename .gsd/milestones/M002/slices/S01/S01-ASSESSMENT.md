---
sliceId: S01
uatType: artifact-driven
verdict: PASS
date: 2026-05-09T12:00:00Z
---

# UAT Result — S01

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Preconditions: required S01 implementation, contract, UAT, and summary artifacts exist | artifact | PASS | `gsd_exec` run `9588fc25-bc31-4f95-ab36-94772c28492a` checked `apps/api/main.py`, `buildingagent/auth/provider.py`, `buildingagent/projects/context.py`, `docs/API_CONTRACT.md`, `S01-UAT.md`, and `S01-SUMMARY.md`; output began with `FILES_OK`. |
| Public health endpoint is unauthenticated | runtime | PASS | TestClient `GET /health` without auth and `X-Request-ID: uat-health-001` returned `status=200`, body `{"status":"ok"}`, and request-id echo. Evidence: `health:PASS status=200 request_id=uat-health-001`. |
| Missing credentials fail with structured 401 | runtime | PASS | TestClient `GET /auth/me` without auth and `X-Request-ID: uat-auth-401` returned 401 with `error.code = auth_missing_credentials`, `error.requestId = uat-auth-401`, and no token/traceback leakage. Evidence: `missing_credentials:PASS status=401 request_id=uat-auth-401`. |
| Local/dev login returns deterministic bearer token | runtime | PASS | TestClient `POST /auth/dev-login` with `{"user_id":"user_alice"}` and `X-Request-ID: uat-login-001` returned 200 with `token_type = bearer`, `user.id = user_alice`, and request-id echo. Evidence: `dev_login:PASS status=200 request_id=uat-login-001`. |
| Authenticated `/auth/me` returns current user metadata | runtime | PASS | TestClient `GET /auth/me` with `Authorization: Bearer dev-token-alice` and `X-Request-ID: uat-me-001` returned 200 with `user.id = user_alice`, email metadata, `is_local_dev = true`, and request-id echo. Evidence: `auth_me:PASS status=200 request_id=uat-me-001`. |
| Authenticated project list is bounded and evolvable | runtime | PASS | TestClient `GET /projects` for Alice returned 200 with `items` and `pagination`; each item included project id, workspace id, name, role, and permission scopes. `GET /projects?limit=1` returned 200 with at most one item and pagination metadata. Evidence: `projects_list:PASS status=200 request_id=uat-projects-001` and `projects_limit:PASS status=200`. |
| Project context resolves user/workspace/project/role/scopes | runtime | PASS | TestClient requested `/projects/{project_id}/context` for an Alice project with `X-Request-ID: uat-context-001`; response status was 200 and `context` included `user_id`, `workspace_id`, `project_id`, `role`, and `permission_scopes`, with requested project id echoed. Evidence: `project_context:PASS status=200 request_id=uat-context-001`. |
| Malformed and invalid bearer headers fail safely | runtime | PASS | TestClient `GET /auth/me` with `Authorization: Basic abc` returned 401 `auth_malformed_authorization`; `Authorization: Bearer unknown-token` returned 401 `auth_invalid_token`. Smoke assertions confirmed submitted credentials were not echoed. Evidence: `malformed_auth:PASS status=401` and `invalid_token:PASS status=401`. |
| Unknown and inaccessible projects are honest failures | runtime | PASS | TestClient `GET /projects/not-a-real-project/context` for Alice returned 404 `project_not_found` with request id `uat-project-not-found`; a seeded Bob-only project requested by Alice returned 403 `project_access_denied` with request id `uat-project-denied`. Evidence: `project_not_found:PASS status=404 request_id=uat-project-not-found` and `project_access_denied:PASS status=403 request_id=uat-project-denied`. |
| No-projects boundary user returns an empty list, not an error | runtime | PASS | TestClient `GET /projects` with `Authorization: Bearer dev-token-no-projects` returned 200 with `items: []` and pagination metadata. Evidence: `no_projects:PASS status=200`. |
| Existing automated test evidence still passes | runtime | PASS | Fresh verification in this UAT ran `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py`; output: `26 passed in 3.21s`, exit code 0. |

## Overall Verdict

PASS — All artifact-driven and runtime-contract UAT checks passed against the local FastAPI TestClient and required S01 artifacts were present.

## Notes

Evidence command: `gsd_exec` run `9588fc25-bc31-4f95-ab36-94772c28492a` exited 0. Full stdout is stored at `.gsd/exec/9588fc25-bc31-4f95-ab36-94772c28492a.stdout`; stderr was empty. An earlier UAT harness attempt (`4aa8836e-dece-45a5-b092-ab3fd01571c0`) failed after pytest passed because the smoke script imported a non-existent `SEEDS` symbol; the script was corrected to import `LOCAL_DEV_SEED_STORE`, then the full UAT was rerun successfully. No human-only checks remain for this artifact-driven UAT.

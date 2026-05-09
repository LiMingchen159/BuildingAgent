# S01: Authenticated API and project context contract — UAT

**Milestone:** M002
**Written:** 2026-05-09T11:30:43.552Z

# S01 UAT: Authenticated API and Project Context Contract

## UAT Type

Contract/in-process API acceptance for the local/dev FastAPI backend using seeded non-secret data and FastAPI TestClient or equivalent HTTP client. This UAT verifies request/response shape, authentication boundaries, project-context resolution, structured failures, and request-id propagation without external services.

## Preconditions

1. Work from the repository root `/mnt/d/Git_project/BuildingAgent`.
2. Use the project Python environment because the base container lacks `python` and system `pytest`.
3. The S01 implementation files are present, including `apps/api/main.py`, `buildingagent/auth/provider.py`, `buildingagent/projects/context.py`, and `docs/API_CONTRACT.md`.
4. Seeded local/dev users exist:
   - `user_alice` with token `dev-token-alice` and at least one project membership.
   - `user_bob` with a different accessible project set.
   - `user_no_projects` with no project memberships.

## Acceptance Test Cases

### 1. Public health endpoint is unauthenticated

Steps:
1. Send `GET /health` without an `Authorization` header and with `X-Request-ID: uat-health-001`.
2. Inspect the response.

Expected outcome:
- Status is `200`.
- Body is `{"status":"ok"}`.
- Response includes `X-Request-ID: uat-health-001`.
- No authentication is required for this endpoint.

### 2. Missing credentials fail with structured 401

Steps:
1. Send `GET /auth/me` without an `Authorization` header and with `X-Request-ID: uat-auth-401`.
2. Inspect the response.

Expected outcome:
- Status is `401`.
- Body has the canonical shape `{"error":{"code", "message", "details", "requestId"}}`.
- `error.code` is `auth_missing_credentials`.
- `error.requestId` is `uat-auth-401`.
- The response does not include tokens, stack traces, or file paths.

### 3. Local/dev login returns deterministic bearer token

Steps:
1. Send `POST /auth/dev-login` with JSON `{"user_id":"user_alice"}` and `X-Request-ID: uat-login-001`.
2. Inspect the response.

Expected outcome:
- Status is `200`.
- Response includes `access_token`, `token_type`, and `user`.
- `token_type` is `bearer`.
- `user.id` is `user_alice`.
- Response includes `X-Request-ID: uat-login-001`.

### 4. Authenticated `/auth/me` returns current user metadata

Steps:
1. Use `Authorization: Bearer dev-token-alice`.
2. Send `GET /auth/me` with `X-Request-ID: uat-me-001`.

Expected outcome:
- Status is `200`.
- Body includes `user.id = user_alice`, email/display metadata, and local/dev marker.
- Response includes `X-Request-ID: uat-me-001`.

### 5. Authenticated project list is bounded and evolvable

Steps:
1. Use `Authorization: Bearer dev-token-alice`.
2. Send `GET /projects` with `X-Request-ID: uat-projects-001`.
3. Send `GET /projects?limit=1`.

Expected outcome:
- Status is `200` for both requests.
- Body contains `items` and `pagination`.
- Each item includes project id, workspace id, name, role, and permission scopes.
- `limit=1` returns at most one project and pagination metadata communicates whether more data exists.

### 6. Project context resolves user/workspace/project/role/scopes

Steps:
1. Use one project id returned by `GET /projects` for `user_alice`.
2. Send `GET /projects/{project_id}/context` with `Authorization: Bearer dev-token-alice` and `X-Request-ID: uat-context-001`.

Expected outcome:
- Status is `200`.
- Body contains `context.user_id`, `context.workspace_id`, `context.project_id`, `context.role`, and `context.permission_scopes`.
- `context.project_id` matches the requested project.
- Response includes `X-Request-ID: uat-context-001`.

### 7. Malformed and invalid bearer headers fail safely

Steps:
1. Send `GET /auth/me` with `Authorization: Basic abc`.
2. Send `GET /auth/me` with `Authorization: Bearer unknown-token`.

Expected outcome:
- Malformed scheme returns `401` with `error.code = auth_malformed_authorization`.
- Unknown bearer token returns `401` with `error.code = auth_invalid_token`.
- Neither response echoes the submitted token.

### 8. Unknown and inaccessible projects are honest failures

Steps:
1. Use `Authorization: Bearer dev-token-alice`.
2. Request `GET /projects/not-a-real-project/context`.
3. Request a seeded project that exists but is not accessible to Alice.

Expected outcome:
- Unknown project returns `404` with `error.code = project_not_found`.
- Existing but inaccessible project returns `403` with `error.code = project_access_denied`.
- Both errors use the canonical structured error shape and include request IDs.

### 9. No-projects boundary user returns an empty list, not an error

Steps:
1. Use `Authorization: Bearer dev-token-no-projects`.
2. Send `GET /projects`.

Expected outcome:
- Status is `200`.
- Body contains `items: []` and valid pagination metadata.
- The user can authenticate even without project memberships, but cannot resolve arbitrary project context.

## Automated Evidence Produced During Slice Close

- `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` exited `0` with `26 passed in 3.21s` after the final file change.
- TestClient smoke verified `/health`, unauthenticated `/auth/me` 401, `POST /auth/dev-login`, `GET /projects`, and `GET /projects/{project_id}/context`, including request-id echoing and project context fields.

## Not Proven By This UAT

- Live uvicorn server startup/shutdown under real network conditions.
- CLI login/project-selection integration; owned by S03.
- Web login/project-selection integration; owned by S04.
- Runtime/chat, memory, tool, skill, model/provider, dispatcher, or audit-log behavior; owned by later M002/M003 slices.
- Production identity provider, OAuth/SSO, password flows, external user onboarding, or persistent database migrations.
- Performance under load, multi-process deployment behavior, or long-term audit/metrics retention.


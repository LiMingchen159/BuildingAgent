# BuildingAgent API Contract

This document captures the M002/S01 local-development API contract for downstream CLI and web executors. It is intentionally additive-only for now; breaking changes should introduce a documented migration path before callers depend on them.

## Authentication

All non-health endpoints require `Authorization: Bearer <token>` except the explicit local/dev helper `POST /auth/dev-login`.

Seeded local/dev users can obtain deterministic, non-secret tokens with:

```http
POST /auth/dev-login
Content-Type: application/json

{"user_id":"user_alice"}
```

Response `200`:

```json
{
 "access_token": "dev-token-alice",
 "token_type": "bearer",
 "user": {
 "id": "user_alice",
 "email": "alice@example.local",
 "display_name": "Alice Developer",
 "is_local_dev": true
 }
}
```

Known seeded tokens are deterministic local/dev fixtures, not production secrets:

- `user_alice` → `dev-token-alice`
- `user_bob` → `dev-token-bob`
- `user_no_projects` → `dev-token-no-projects`

Unknown local/dev users return `404` with `error.code = "dev_login_user_not_found"`.

## Request IDs and Errors

Every response includes `X-Request-ID`. If the caller supplies `X-Request-ID`, the API echoes it; otherwise the API generates one.

Structured errors use one canonical shape:

```json
{
 "error": {
 "code": "auth_invalid_token",
 "message": "Bearer token is missing or invalid.",
 "details": {},
 "requestId": "req_..."
 }
}
```

Auth failures are `401` and use stable codes:

- `auth_missing_credentials` — no `Authorization` header.
- `auth_malformed_authorization` — wrong scheme, empty token, or malformed bearer header.
- `auth_invalid_token` — bearer token is well-formed but unknown/invalid.

Project access failures use stable codes:

- `project_not_found` (`404`) — requested project id is unknown.
- `project_access_denied` (`403`) — authenticated user lacks membership in the requested project.
- `invalid_project_limit` (`422`) — `GET /projects` limit is outside the documented bounds.

Error bodies never include bearer token values, stack traces, or file paths.

## Endpoints

### `GET /health`

Unauthenticated health check.

Response `200`:

```json
{"status":"ok"}
```

### `GET /auth/me`

Requires bearer auth. Returns the current user metadata.

Response `200`:

```json
{
 "user": {
 "id": "user_alice",
 "email": "alice@example.local",
 "display_name": "Alice Developer",
 "is_local_dev": true
 }
}
```

### `GET /projects?limit=<n>`

Requires bearer auth. Lists projects accessible to the current user. The list is bounded even for in-memory seeds.

- Default `limit`: `50`
- Max `limit`: `100`
- Response shape: `items` plus `pagination`

Response `200` example:

```json
{
 "items": [
 {
 "id": "project_hkust_demo",
 "workspace_id": "workspace_demo",
 "name": "HKUST Building Demo",
 "role": "owner",
 "permission_scopes": ["project:read", "project:write", "chat:use", "memory:read"]
 }
 ],
 "pagination": {
 "limit":1,
 "next_cursor": "1",
 "has_more": true
 }
}
```

### `GET /projects/{project_id}/context`

Requires bearer auth and project membership. Returns the reusable request-context shape for the selected project.

Response `200`:

```json
{
 "context": {
 "user_id": "user_alice",
 "workspace_id": "workspace_demo",
 "project_id": "project_mtrc_elements",
 "role": "engineer",
 "permission_scopes": ["project:read", "chat:use", "memory:read"]
 }
}
```

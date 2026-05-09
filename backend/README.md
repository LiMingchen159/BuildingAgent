# BuildingAgent Backend

Local FastAPI-compatible backend for the S01 authenticated project chat tracer bullet.

## Development seed credentials

These credentials are committed intentionally for local development and tests only:

- Email: `owner@buildingagent.local`
- Password: `buildingagent-dev-password`
- Project: `prj_demo_building` (`Demo Building Project`)

Do not reuse these credentials outside the local S01 stack. API responses, audit events, and diagnostics must not expose password hashes or bearer tokens.

## API contract

All endpoints live under `/api/v1` and return canonical errors:

```json
{"error":{"code":"invalid_token","message":"Bearer token is invalid","requestId":"req_..."}}
```

List endpoints accept `limit` and cap it at 100 for the initial SQLite load profile. Protected endpoints require `Authorization: Bearer <token>` from `POST /api/v1/auth/login`.

## Verification

```bash
python -m pytest tests/test_auth_project_chat.py tests/test_health_and_audit.py
python - <<'PY'
from app.main import app
import json
open('openapi.json','w').write(json.dumps(app.openapi(), indent=2))
PY
test -s openapi.json
```

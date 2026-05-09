# BuildingAgent

BuildingAgent is an offline-first local tracer bullet for a building-project agent shell. The current S01 slice proves one end-to-end loop: a seeded owner logs in, selects the seeded Demo Building Project, sends a chat message, and receives a deterministic placeholder assistant reply that is persisted and audited by the backend.

S01 is intentionally local. It does not call an external LLM, identity provider, vector database, or cloud service, and it does not require provider API keys.

## What works in S01

- Local backend with SQLite persistence, seeded users, seeded projects, bearer-token sessions, project membership checks, chat persistence, health/status endpoints, and audit events.
- Local Web UI with login, project picker, and project chat pages that call the backend contract.
- Local CLI with the same login, project selection, chat send, and chat history flow.
- Repository-level smoke verification that starts a disposable backend, exercises the real API, and checks negative authorization paths.

## What remains after S01

- S02 will add registries and broader shell pages.
- S03 will add runtime, tool, skill, and gateway placeholders.
- S04 will finish final package polish and mock building data.

The S01 chat response is a deterministic placeholder. Real model/provider integration is deliberately out of scope for this slice.

## Requirements

- Python 3.10+
- Node.js and npm for the Web UI checks
- No external secrets or provider accounts

Install Python dependencies only if you want to run the backend with the standard ASGI server:

```bash
python -m pip install fastapi uvicorn pytest
```

The repository also includes a tiny local compatibility surface for the S01 tests and smoke script, so `scripts/smoke_s01.py` can still run in the dependency-light agent environment without `uvicorn`.

Install Web dependencies once:

```bash
cd web
npm install
```

## Seeded local account

Use this account for the backend, Web UI, and CLI:

```text
Email: owner@buildingagent.local
Password: buildingagent-dev-password
Project: Demo Building Project
Project ID: prj_demo_building
```

The backend also seeds a private project for authorization-denial checks. That project must not appear in the seeded owner's project list.

## Local runtime state

By default, the backend SQLite database is created under the backend directory as `buildingagent.sqlite3`. Override it when you want isolated disposable state:

```bash
BUILDINGAGENT_DB_PATH=/tmp/buildingagent.sqlite3 python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The CLI stores local session state in your user config directory by default. Override it for tests or disposable demos:

```bash
BUILDINGAGENT_CLI_SESSION_PATH=/tmp/buildingagent-session.json python -m buildingagent_cli.main login --email owner@buildingagent.local --password buildingagent-dev-password
```

Do not commit generated SQLite databases, CLI session files, frontend build output, dependency directories, virtualenvs, or logs.

## Run the backend

From the repository root:

```bash
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Useful inspection endpoints:

```bash
curl http://127.0.0.1:8000/api/v1/health
curl http://127.0.0.1:8000/api/v1/status
```

## Run the Web UI

In another terminal:

```bash
cd web
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 npm run dev
```

Open the local Next.js URL, log in with the seeded account, select Demo Building Project, and send a chat message.

## Run the CLI

In another terminal:

```bash
cd cli
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 python -m buildingagent_cli.main login --email owner@buildingagent.local --password buildingagent-dev-password
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 python -m buildingagent_cli.main project list
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 python -m buildingagent_cli.main project use "Demo Building Project"
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 python -m buildingagent_cli.main chat send "What is the project status?"
BUILDINGAGENT_API_URL=http://127.0.0.1:8000 python -m buildingagent_cli.main chat history
```

The CLI prints user and assistant messages but must not print bearer tokens or password hashes.

## Verification

Run all S01 checks in the same order future agents should use:

```bash
python scripts/run_s01_checks.py
```

That helper runs backend tests, CLI tests, Web tests, Web build, and the integrated smoke check.

Run only the integrated smoke check:

```bash
python scripts/smoke_s01.py
```

By default the smoke script starts an owned backend on `127.0.0.1:8000` with a temporary SQLite database and terminates it when the check finishes. To target a backend you already started:

```bash
python scripts/smoke_s01.py --use-existing-backend --base-url http://127.0.0.1:8000
```

The smoke check verifies real API behavior: health, wrong credentials, anonymous denial, invalid-token denial, seeded login, project list/select, private-project denial, empty-message rejection, deterministic chat reply/history, audit events, and status counts. Failures include the failing phase, HTTP status, and a safe response body.

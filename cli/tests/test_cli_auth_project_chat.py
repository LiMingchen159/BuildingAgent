from __future__ import annotations

import contextlib
import io
import json
import os
import pathlib
import sys
import urllib.error
from typing import Any
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient

from app.main import app
from app.seed import DEMO_PROJECT_ID, DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD, PRIVATE_PROJECT_ID
from buildingagent_cli import client as cli_client
from buildingagent_cli import main as cli_main
from buildingagent_cli.session import load_session


class FakeHttpResponse:
    def __init__(self, status: int, body: Any):
        self.status = status
        self._raw = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self._raw


class RawHttpResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return b"not json"


def make_urlopen(test_client: TestClient):
    def fake_urlopen(request, timeout=5):
        parsed = urlparse(request.full_url)
        path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        headers = dict(request.headers)
        body = json.loads(request.data.decode("utf-8")) if request.data else None
        method = request.get_method()
        if method == "GET":
            response = test_client.get(path, headers=headers)
        elif method == "POST":
            response = test_client.post(path, json=body, headers=headers)
        else:
            raise AssertionError(method)
        payload = response.json()
        if response.status_code >= 400:
            raise urllib.error.HTTPError(request.full_url, response.status_code, "error", {}, io.BytesIO(json.dumps(payload).encode("utf-8")))
        return FakeHttpResponse(response.status_code, payload)

    return fake_urlopen


def run_cli(argv: list[str]) -> tuple[int, str, str]:
    out = io.StringIO()
    err = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cli_main.main(argv)
    return code, out.getvalue(), err.getvalue()


def configure(monkeypatch, tmp_path):
    os.environ["BUILDINGAGENT_DB_PATH"] = str(tmp_path / "backend.sqlite3")
    os.environ["BUILDINGAGENT_CLI_SESSION_PATH"] = str(tmp_path / "session.json")
    os.environ["BUILDINGAGENT_API_URL"] = "http://backend.test"
    c = TestClient(app)
    monkeypatch.setattr(cli_client.urllib.request, "urlopen", make_urlopen(c))
    return c


def assert_no_secret_text(*chunks: str) -> None:
    combined = "\n".join(chunks)
    assert "bag_s01_" not in combined
    assert "passwordHash" not in combined
    assert "pbkdf2" not in combined
    assert DEV_OWNER_PASSWORD not in combined


def login_and_select(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    assert "Logged in as Demo Owner" in out
    code, out, err = run_cli(["project", "use", "Demo Building Project"])
    assert code == 0, err
    assert f"Selected project: Demo Building Project ({DEMO_PROJECT_ID})" in out
    return out, err


def test_login_project_use_chat_send_and_history_round_trip(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)

    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    assert "Logged in as Demo Owner" in out
    assert_no_secret_text(out, err)
    state = load_session()
    assert state.access_token.startswith("bag_s01_")
    assert state.selected_project_id is None

    code, out, err = run_cli(["project", "list"])
    assert code == 0, err
    assert f"{DEMO_PROJECT_ID}\tDemo Building Project" in out
    assert PRIVATE_PROJECT_ID not in out

    code, out, err = run_cli(["project", "use", DEMO_PROJECT_ID])
    assert code == 0, err
    assert "Selected project: Demo Building Project" in out
    assert load_session().selected_project_id == DEMO_PROJECT_ID

    code, out, err = run_cli(["chat", "send", "What is the project status?"])
    assert code == 0, err
    assert "user: What is the project status?" in out
    assert f"assistant: BuildingAgent placeholder reply for {DEMO_PROJECT_ID}: received 27 characters." in out
    assert_no_secret_text(out, err)

    code, out, err = run_cli(["chat", "history"])
    assert code == 0, err
    assert "user: What is the project status?" in out
    assert "assistant: BuildingAgent placeholder reply" in out


def test_project_use_accepts_exact_project_name(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    code, out, err = run_cli(["project", "use", "Demo Building Project"])
    assert code == 0, err
    assert load_session().selected_project_id == DEMO_PROJECT_ID


def test_chat_requires_login_and_selected_project(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    code, out, err = run_cli(["chat", "history"])
    assert code == 2
    assert "Run `buildingagent login` first" in err

    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    code, out, err = run_cli(["chat", "history"])
    assert code == 2
    assert "No selected project" in err


def test_negative_missing_empty_message_unknown_project_and_login_failure(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", "wrong"])
    assert code == 2
    assert "invalid_credentials" in err
    assert_no_secret_text(out, err)

    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    code, out, err = run_cli(["project", "use", "Missing Project"])
    assert code == 1
    assert "project not found or not accessible" in err

    code, out, err = run_cli(["chat", "send"])
    assert code == 2
    assert "chat message cannot be empty" in err
    code, out, err = run_cli(["chat", "send", "   "])
    assert code == 2
    assert "chat message cannot be empty" in err


def test_corrupt_session_requires_relogin(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    pathlib.Path(os.environ["BUILDINGAGENT_CLI_SESSION_PATH"]).write_text("not-json", encoding="utf-8")
    code, out, err = run_cli(["project", "list"])
    assert code == 2
    assert "corrupt" in err


def test_backend_unavailable_preserves_prior_session_state(monkeypatch, tmp_path):
    login_and_select(monkeypatch, tmp_path)
    before = pathlib.Path(os.environ["BUILDINGAGENT_CLI_SESSION_PATH"]).read_text(encoding="utf-8")

    def unavailable(request, timeout=5):
        raise urllib.error.URLError("refused")

    monkeypatch.setattr(cli_client.urllib.request, "urlopen", unavailable)
    code, out, err = run_cli(["chat", "history"])
    assert code == 1
    assert "Backend is unavailable" in err
    after = pathlib.Path(os.environ["BUILDINGAGENT_CLI_SESSION_PATH"]).read_text(encoding="utf-8")
    assert after == before


def test_invalid_token_and_wrong_project_use_backend_errors(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    session_file = pathlib.Path(os.environ["BUILDINGAGENT_CLI_SESSION_PATH"])
    session_file.write_text(json.dumps({"accessToken": "bag_s01_invalid", "selectedProjectId": DEMO_PROJECT_ID}), encoding="utf-8")
    code, out, err = run_cli(["project", "list"])
    assert code == 2
    assert "invalid_token" in err

    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 0, err
    session_file.write_text(json.dumps({"accessToken": load_session().access_token, "selectedProjectId": PRIVATE_PROJECT_ID}), encoding="utf-8")
    code, out, err = run_cli(["chat", "history"])
    assert code == 2
    assert "project_forbidden" in err
    assert "Private Building Project" not in err


def test_malformed_json_response_reports_safe_error(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)

    def malformed(request, timeout=5):
        return RawHttpResponse()

    monkeypatch.setattr(cli_client.urllib.request, "urlopen", malformed)
    code, out, err = run_cli(["login", "--email", DEV_OWNER_EMAIL, "--password", DEV_OWNER_PASSWORD])
    assert code == 1
    assert "malformed-response" in err
    assert_no_secret_text(out, err)

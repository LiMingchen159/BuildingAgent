from __future__ import annotations

import argparse
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_EMAIL = "owner@buildingagent.local"
DEFAULT_PASSWORD = "buildingagent-dev-password"
DEMO_PROJECT_ID = "prj_demo_building"
PRIVATE_PROJECT_ID = "prj_private_building"


@dataclass
class SmokeContext:
    base_url: str
    owned_process: subprocess.Popen[str] | None
    temp_dir: pathlib.Path | None
    token: str | None = None
    project_id: str | None = None


class SmokeFailure(Exception):
    def __init__(self, step: str, message: str):
        super().__init__(f"[{step}] {message}")
        self.step = step
        self.message = message


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the S01 integrated backend smoke check.")
    parser.add_argument("--base-url", default=os.environ.get("BUILDINGAGENT_API_URL", DEFAULT_BASE_URL), help="Existing backend URL to target. Default: %(default)s")
    parser.add_argument("--use-existing-backend", action="store_true", help="Do not start an owned backend process; target --base-url directly.")
    parser.add_argument("--timeout", type=float, default=10.0, help="Seconds to wait for an owned backend to become healthy.")
    args = parser.parse_args(argv)

    ctx = SmokeContext(base_url=args.base_url.rstrip("/"), owned_process=None, temp_dir=None)
    try:
        if not args.use_existing_backend:
            start_owned_backend(ctx, args.timeout)
        wait_for_health(ctx, args.timeout)
        run_smoke(ctx)
    except SmokeFailure as exc:
        print(f"SMOKE FAIL {exc}", file=sys.stderr)
        return 1
    finally:
        cleanup(ctx)

    print("SMOKE PASS S01 integrated auth/project/chat/audit contract verified.")
    return 0


def start_owned_backend(ctx: SmokeContext, timeout: float) -> None:
    step = "start-backend"
    temp_dir = pathlib.Path(tempfile.mkdtemp(prefix="buildingagent-s01-smoke-"))
    db_path = temp_dir / "smoke.sqlite3"
    log_path = temp_dir / "backend.log"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND)
    env["BUILDINGAGENT_DB_PATH"] = str(db_path)
    port = ctx.base_url.rsplit(":", 1)[-1]
    if not port.isdigit():
        raise SmokeFailure(step, f"owned backend requires a localhost base URL with an explicit numeric port; got {ctx.base_url}")
    log_file = log_path.open("w", encoding="utf-8")
    command = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port]
    if not module_available("uvicorn", env):
        command = [sys.executable, "-u", str(pathlib.Path(__file__).resolve()), "--serve-fallback", port]
    try:
        process = subprocess.Popen(
            command,
            cwd=str(BACKEND),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except FileNotFoundError as exc:
        log_file.close()
        raise SmokeFailure(step, "Python executable was not found while starting the backend") from exc
    ctx.owned_process = process
    ctx.temp_dir = temp_dir
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            log_file.close()
            safe_log = safe_text(log_path.read_text(encoding="utf-8", errors="replace")[-1200:]) if log_path.exists() else ""
            raise SmokeFailure(step, f"backend exited early with code {process.returncode}; log={safe_log!r}; db={db_path}; log_path={log_path}")
        try:
            response = request_json(ctx, "GET", "/api/v1/health", expected=(200,), step=step)
            if response.get("status") == "ok":
                log_file.close()
                return
        except SmokeFailure:
            time.sleep(0.2)
    log_file.close()
    raise SmokeFailure(step, f"backend did not become healthy within {timeout:.1f}s; db={db_path}; log_path={log_path}")


def module_available(module_name: str, env: dict[str, str]) -> bool:
    result = subprocess.run(
        [sys.executable, "-c", f"import {module_name}"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.returncode == 0


def cleanup(ctx: SmokeContext) -> None:
    if ctx.owned_process and ctx.owned_process.poll() is None:
        ctx.owned_process.terminate()
        try:
            ctx.owned_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            ctx.owned_process.kill()
            ctx.owned_process.wait(timeout=3)


def wait_for_health(ctx: SmokeContext, timeout: float) -> None:
    step = "health"
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        try:
            body = request_json(ctx, "GET", "/api/v1/health", expected=(200,), step=step)
            assert_equal(step, body.get("status"), "ok", "health status")
            assert_equal(step, body.get("database"), "ok", "database status")
            return
        except SmokeFailure as exc:
            last_error = exc.message
            time.sleep(0.2)
    raise SmokeFailure(step, f"backend unavailable at {ctx.base_url}: {last_error}")


def run_smoke(ctx: SmokeContext) -> None:
    wrong_login = request_json(ctx, "POST", "/api/v1/auth/login", {"email": DEFAULT_EMAIL, "password": "wrong"}, expected=(401,), step="wrong-credentials")
    assert_error_code("wrong-credentials", wrong_login, "invalid_credentials")

    anonymous = request_json(ctx, "GET", "/api/v1/projects", expected=(401,), step="anonymous-projects")
    assert_error_code("anonymous-projects", anonymous, "auth_required")

    invalid_token = request_json(ctx, "GET", f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers={"Authorization": "Bearer invalid"}, expected=(401,), step="invalid-token")
    assert_error_code("invalid-token", invalid_token, "invalid_token")

    login = request_json(ctx, "POST", "/api/v1/auth/login", {"email": DEFAULT_EMAIL, "password": DEFAULT_PASSWORD}, expected=(200,), step="login")
    token = require_str("login", login, "accessToken")
    if not token.startswith("bag_s01_"):
        raise SmokeFailure("login", "access token did not use the expected local S01 prefix")
    if "password" in json.dumps(login).lower() or "hash" in json.dumps(login).lower():
        raise SmokeFailure("login", "login response exposed password material")
    ctx.token = token

    auth_headers = {"Authorization": f"Bearer {token}"}
    projects = request_json(ctx, "GET", "/api/v1/projects", headers=auth_headers, expected=(200,), step="project-list")
    project_rows = projects.get("projects")
    if not isinstance(project_rows, list):
        raise SmokeFailure("project-list", "projects was not a list")
    demo = next((p for p in project_rows if isinstance(p, dict) and p.get("id") == DEMO_PROJECT_ID), None)
    if demo is None or demo.get("name") != "Demo Building Project":
        raise SmokeFailure("project-list", f"Demo Building Project missing from authorized projects: {safe_text(projects)}")
    if any(isinstance(p, dict) and p.get("id") == PRIVATE_PROJECT_ID for p in project_rows):
        raise SmokeFailure("project-list", "private project leaked into owner project list")
    ctx.project_id = DEMO_PROJECT_ID

    selected = request_json(ctx, "POST", f"/api/v1/projects/{DEMO_PROJECT_ID}/select", headers=auth_headers, expected=(200,), step="project-select")
    selected_project = selected.get("selectedProject")
    if not isinstance(selected_project, dict) or selected_project.get("id") != DEMO_PROJECT_ID:
        raise SmokeFailure("project-select", f"unexpected selected project body: {safe_text(selected)}")

    missing_project = request_json(ctx, "GET", "/api/v1/projects/prj_missing/chat", headers=auth_headers, expected=(404,), step="missing-project")
    assert_error_code("missing-project", missing_project, "project_not_found")

    wrong_project = request_json(ctx, "GET", f"/api/v1/projects/{PRIVATE_PROJECT_ID}/chat", headers=auth_headers, expected=(403,), step="wrong-project")
    assert_error_code("wrong-project", wrong_project, "project_forbidden")

    missing_message = request_json(ctx, "POST", f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", {"message": "   "}, headers=auth_headers, expected=(400,), step="empty-message")
    assert_error_code("empty-message", missing_message, "empty_chat_message")

    message = "S01 smoke chat"
    chat = request_json(ctx, "POST", f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", {"message": message}, headers=auth_headers, expected=(200,), step="chat-send")
    messages = require_messages("chat-send", chat)
    expected_reply = f"BuildingAgent placeholder reply for {DEMO_PROJECT_ID}: received {len(message)} characters."
    if [m.get("role") for m in messages] != ["user", "assistant"]:
        raise SmokeFailure("chat-send", f"expected user+assistant messages, got {safe_text(messages)}")
    assert_equal("chat-send", messages[0].get("content"), message, "user message")
    assert_equal("chat-send", messages[1].get("content"), expected_reply, "assistant reply")

    history = request_json(ctx, "GET", f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=auth_headers, expected=(200,), step="chat-history")
    history_messages = require_messages("chat-history", history)
    if not any(m.get("role") == "assistant" and m.get("content") == expected_reply for m in history_messages):
        raise SmokeFailure("chat-history", f"deterministic assistant reply missing from history: {safe_text(history_messages)}")

    audit = request_json(ctx, "GET", f"/api/v1/projects/{DEMO_PROJECT_ID}/audit-events", headers=auth_headers, expected=(200,), step="audit-events")
    events = audit.get("events")
    if not isinstance(events, list):
        raise SmokeFailure("audit-events", "events was not a list")
    actions = {e.get("action") for e in events if isinstance(e, dict)}
    for required in {"auth.login", "project.list", "project.select", "chat.create", "project.access"}:
        if required not in actions:
            raise SmokeFailure("audit-events", f"missing audit action {required}; actions={sorted(str(a) for a in actions)}")
    if any("password" in json.dumps(event).lower() or "token" in json.dumps(event).lower() for event in events):
        raise SmokeFailure("audit-events", "audit response exposed password or token material")

    status = request_json(ctx, "GET", "/api/v1/status", expected=(200,), step="status")
    counts = status.get("counts")
    if not isinstance(counts, dict) or counts.get("chatMessages", 0) < 2 or counts.get("auditEvents", 0) < 5:
        raise SmokeFailure("status", f"status counts did not reflect smoke activity: {safe_text(status)}")


def request_json(ctx: SmokeContext, method: str, path: str, payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None, expected: tuple[int, ...] = (200,), step: str = "request") -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        req_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{ctx.base_url}{path}", data=body, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
    except TimeoutError as exc:
        raise SmokeFailure(step, f"request timed out: {method} {path}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(step, f"backend unavailable for {method} {path}: {exc.reason}") from exc
    except OSError as exc:
        raise SmokeFailure(step, f"request failed for {method} {path}: {exc}") from exc

    response_text = raw.decode("utf-8", errors="replace")
    safe_body = response_text[:1200]
    if status not in expected:
        raise SmokeFailure(step, f"{method} {path} returned {status}, expected {expected}; body={safe_text(safe_body)}")
    try:
        decoded = json.loads(response_text or "{}")
    except json.JSONDecodeError as exc:
        raise SmokeFailure(step, f"{method} {path} returned non-JSON status {status}; body={safe_text(safe_body)}") from exc
    if not isinstance(decoded, dict):
        raise SmokeFailure(step, f"{method} {path} returned non-object JSON status {status}; body={safe_text(safe_body)}")
    return decoded


def require_str(step: str, body: dict[str, Any], key: str) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value:
        raise SmokeFailure(step, f"missing string field {key}: {safe_text(body)}")
    return value


def require_messages(step: str, body: dict[str, Any]) -> list[dict[str, Any]]:
    messages = body.get("messages")
    if not isinstance(messages, list) or any(not isinstance(m, dict) for m in messages):
        raise SmokeFailure(step, f"messages was not a list of objects: {safe_text(body)}")
    return messages


def assert_error_code(step: str, body: dict[str, Any], expected_code: str) -> None:
    error = body.get("error")
    if not isinstance(error, dict) or error.get("code") != expected_code:
        raise SmokeFailure(step, f"expected error code {expected_code}; body={safe_text(body)}")


def assert_equal(step: str, actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise SmokeFailure(step, f"unexpected {label}: expected {expected!r}, got {actual!r}")


def safe_text(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, default=str)
    for secret in (DEFAULT_PASSWORD,):
        text = text.replace(secret, "<redacted>")
    return text


def run_fallback_server(port: int) -> int:
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import urlparse

    from app.main import app

    app._startup()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._handle("GET")

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._handle("POST")

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - BaseHTTPRequestHandler API
            print(f"fallback-server {self.address_string()} {format % args}")

        def _handle(self, method: str) -> None:
            try:
                length = int(self.headers.get("Content-Length", "0") or "0")
                raw = self.rfile.read(length) if length else b""
                payload = json.loads(raw.decode("utf-8")) if raw else None
                headers = {key: value for key, value in self.headers.items()}
                parsed = urlparse(self.path)
                response = app.handle(method, parsed.path + (f"?{parsed.query}" if parsed.query else ""), headers=headers, json_body=payload)
                body = json.dumps(response.json()).encode("utf-8")
                self.send_response(response.status_code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:  # noqa: BLE001 - safe fallback diagnostic
                body = json.dumps({"error": {"code": "fallback_server_error", "message": str(exc), "requestId": "fallback"}}).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"fallback-server listening on 127.0.0.1:{port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    if "--serve-fallback" in sys.argv:
        index = sys.argv.index("--serve-fallback")
        raise SystemExit(run_fallback_server(int(sys.argv[index + 1])))
    raise SystemExit(main())

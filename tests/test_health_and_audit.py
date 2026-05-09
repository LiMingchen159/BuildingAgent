from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app
from app.seed import DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD, DEMO_PROJECT_ID, PRIVATE_PROJECT_ID


def client(tmp_path):
    os.environ["BUILDINGAGENT_DB_PATH"] = str(tmp_path / "test.sqlite3")
    return TestClient(app)


def login(c, email=DEV_OWNER_EMAIL, password=DEV_OWNER_PASSWORD):
    response = c.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["accessToken"]


def authz(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_health_and_status_expose_runtime_diagnostics_without_secrets(tmp_path):
    c = client(tmp_path)
    health = c.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "ok"
    assert health.json()["requestId"].startswith("req_")

    status = c.get("/api/v1/status")
    assert status.status_code == 200
    body = status.json()
    assert body["counts"]["users"] >= 2
    assert body["counts"]["projects"] >= 2
    assert "password" not in status.text.lower()
    assert "bag_s01" not in status.text


def test_audit_events_record_login_project_chat_and_denials_with_redacted_details(tmp_path):
    c = client(tmp_path)
    token = login(c)
    assert c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/select", headers=authz(token)).status_code == 200
    assert c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": "audit me"}).status_code == 200
    assert c.get(f"/api/v1/projects/{PRIVATE_PROJECT_ID}/chat", headers=authz(token)).status_code == 403

    events = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/audit-events", headers=authz(token))
    assert events.status_code == 200
    body = events.json()
    actions = [event["action"] for event in body["events"]]
    assert "auth.login" in actions
    assert "project.select" in actions
    assert "chat.create" in actions
    assert "project.access" in actions
    assert any(event["outcome"] == "denied" for event in body["events"])
    serialized = events.text.lower()
    assert "password" not in serialized
    assert "token" not in serialized
    assert "authorization" not in serialized


def test_list_endpoints_are_capped_for_s01_load_profile(tmp_path):
    c = client(tmp_path)
    token = login(c)
    for i in range(3):
        assert c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": f"msg {i}"}).status_code == 200

    chat = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat?limit=500", headers=authz(token))
    assert chat.status_code == 200
    assert chat.json()["limit"] == 100

    audit = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/audit-events?limit=500", headers=authz(token))
    assert audit.status_code == 200
    assert audit.json()["limit"] == 100


def test_status_surfaces_sqlite_failures_without_stack_traces(tmp_path, monkeypatch):
    c = client(tmp_path)

    def broken_connect():
        raise OSError("disk disappeared")

    monkeypatch.setattr("app.api.connect", broken_connect)
    status = c.get("/api/v1/status")
    assert status.status_code == 500
    assert status.json()["error"]["code"] == "internal_error"
    assert "traceback" not in status.text.lower()

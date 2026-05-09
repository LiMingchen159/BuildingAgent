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
    body = response.json()
    assert body["tokenType"] == "bearer"
    assert body["accessToken"].startswith("bag_s01_")
    assert "password" not in str(body).lower()
    return body["accessToken"]


def authz(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_seeded_owner_login_me_project_select_and_chat_round_trip(tmp_path):
    c = client(tmp_path)
    token = login(c)

    me = c.get("/api/v1/auth/me", headers=authz(token))
    assert me.status_code == 200
    assert me.json()["user"]["email"] == DEV_OWNER_EMAIL
    assert "passwordHash" not in str(me.json())

    projects = c.get("/api/v1/projects", headers=authz(token))
    assert projects.status_code == 200
    assert [p["id"] for p in projects.json()["projects"]] == [DEMO_PROJECT_ID]

    selected = c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/select", headers=authz(token))
    assert selected.status_code == 200
    assert selected.json()["selectedProject"]["name"] == "Demo Building Project"

    first_history = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token))
    assert first_history.status_code == 200
    assert first_history.json()["messages"] == []

    chat = c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": "What is the project status?"})
    assert chat.status_code == 200, chat.text
    messages = chat.json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "What is the project status?"
    assert messages[1]["content"] == f"BuildingAgent placeholder reply for {DEMO_PROJECT_ID}: received 27 characters."

    history = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token))
    assert [m["role"] for m in history.json()["messages"]] == ["user", "assistant"]


def test_repeated_chat_appends_two_messages_each_time(tmp_path):
    c = client(tmp_path)
    token = login(c)
    for text in ["first", "second"]:
        response = c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": text})
        assert response.status_code == 200
    history = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token))
    assert [m["role"] for m in history.json()["messages"]] == ["user", "assistant", "user", "assistant"]
    assert [m["content"] for m in history.json()["messages"] if m["role"] == "user"] == ["first", "second"]


def test_login_and_token_negative_cases_use_canonical_error_envelope(tmp_path):
    c = client(tmp_path)
    empty = c.post("/api/v1/auth/login", json={"email": "", "password": ""})
    assert empty.status_code == 400
    assert empty.json()["error"]["code"] == "empty_credentials"
    assert empty.json()["error"]["requestId"].startswith("req_")

    failed = c.post("/api/v1/auth/login", json={"email": DEV_OWNER_EMAIL, "password": "wrong"})
    assert failed.status_code == 401
    assert failed.json()["error"]["code"] == "invalid_credentials"

    missing = c.get("/api/v1/projects")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "auth_required"

    malformed = c.get("/api/v1/projects", headers={"Authorization": "Bearer not-a-real-token"})
    assert malformed.status_code == 401
    assert malformed.json()["error"]["code"] == "invalid_token"
    assert "traceback" not in malformed.text.lower()


def test_project_permission_and_validation_fail_before_project_data_access(tmp_path):
    c = client(tmp_path)
    token = login(c)

    malformed = c.get("/api/v1/projects/not valid/chat", headers=authz(token))
    assert malformed.status_code == 400
    assert malformed.json()["error"]["code"] == "invalid_project_id"

    missing = c.get("/api/v1/projects/prj_missing/chat", headers=authz(token))
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "project_not_found"

    private = c.get(f"/api/v1/projects/{PRIVATE_PROJECT_ID}/chat", headers=authz(token))
    assert private.status_code == 403
    assert private.json()["error"]["code"] == "project_forbidden"
    assert "Private Building Project" not in private.text


def test_chat_rejects_empty_and_oversized_messages_without_partial_writes(tmp_path):
    c = client(tmp_path)
    token = login(c)

    empty = c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": "   "})
    assert empty.status_code == 400
    assert empty.json()["error"]["code"] == "empty_chat_message"

    huge = c.post(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token), json={"message": "x" * 4001})
    assert huge.status_code == 413
    assert huge.json()["error"]["code"] == "chat_message_too_large"

    history = c.get(f"/api/v1/projects/{DEMO_PROJECT_ID}/chat", headers=authz(token))
    assert history.status_code == 200
    assert history.json()["messages"] == []

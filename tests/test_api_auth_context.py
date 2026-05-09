from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app


def auth_header(token: str = "dev-token-alice") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def assert_structured_error(response, code: str, status_code: int) -> None:
    assert response.status_code == status_code
    body = response.json()
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["details"] is not None
    assert body["error"]["requestId"] == response.headers["X-Request-ID"]


def test_dev_login_returns_seeded_token_and_user_metadata() -> None:
    client = TestClient(create_app())

    response = client.post("/auth/dev-login", json={"user_id": "user_alice"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"]
    assert response.json() == {
        "access_token": "dev-token-alice",
        "token_type": "bearer",
        "user": {
            "id": "user_alice",
            "email": "alice@example.local",
            "display_name": "Alice Developer",
            "is_local_dev": True,
        },
    }


def test_auth_me_returns_current_seeded_user() -> None:
    client = TestClient(create_app())

    response = client.get("/auth/me", headers=auth_header())

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "id": "user_alice",
            "email": "alice@example.local",
            "display_name": "Alice Developer",
            "is_local_dev": True,
        }
    }


def test_projects_are_bounded_and_include_pagination_metadata() -> None:
    client = TestClient(create_app())

    response = client.get("/projects?limit=1", headers=auth_header())

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == [
        {
            "id": "project_hkust_demo",
            "workspace_id": "workspace_demo",
            "name": "HKUST Building Demo",
            "role": "owner",
            "permission_scopes": [
                "project:read",
                "project:write",
                "chat:use",
                "memory:read",
            ],
        }
    ]
    assert body["pagination"] == {"limit": 1, "next_cursor": "1", "has_more": True}


def test_project_context_returns_selected_project_context_only() -> None:
    client = TestClient(create_app())

    response = client.get("/projects/project_mtrc_elements/context", headers=auth_header())

    assert response.status_code == 200
    assert response.json() == {
        "context": {
            "user_id": "user_alice",
            "workspace_id": "workspace_demo",
            "project_id": "project_mtrc_elements",
            "role": "engineer",
            "permission_scopes": ["project:read", "chat:use", "memory:read"],
        }
    }


@pytest.mark.parametrize(
    ("headers", "code"),
    [
        ({}, "auth_missing_credentials"),
        ({"Authorization": "Basic dev-token-alice"}, "auth_malformed_authorization"),
        ({"Authorization": "Bearer "}, "auth_malformed_authorization"),
        ({"Authorization": "Bearer unknown-token"}, "auth_invalid_token"),
    ],
)
def test_auth_failures_return_structured_401(headers: dict[str, str], code: str) -> None:
    client = TestClient(create_app())

    response = client.get("/auth/me", headers=headers)

    assert_structured_error(response, code=code, status_code=401)
    assert "unknown-token" not in response.text


def test_cross_project_denial_returns_structured_403() -> None:
    client = TestClient(create_app())

    response = client.get("/projects/project_uc_berkeley_demo/context", headers=auth_header())

    assert_structured_error(response, code="project_access_denied", status_code=403)
    assert response.json()["error"]["details"] == {"project_id": "project_uc_berkeley_demo"}


def test_unknown_project_returns_structured_404() -> None:
    client = TestClient(create_app())

    response = client.get("/projects/project_missing/context", headers=auth_header())

    assert_structured_error(response, code="project_not_found", status_code=404)


@pytest.mark.parametrize("limit", [0, 101])
def test_projects_reject_invalid_limits_with_honest_4xx(limit: int) -> None:
    client = TestClient(create_app())

    response = client.get(f"/projects?limit={limit}", headers=auth_header())

    assert_structured_error(response, code="invalid_project_limit", status_code=422)


def test_dev_login_unknown_user_returns_structured_404() -> None:
    client = TestClient(create_app())

    response = client.post("/auth/dev-login", json={"user_id": "user_missing"})

    assert_structured_error(response, code="dev_login_user_not_found", status_code=404)

import json

from fastapi.testclient import TestClient

from apps.api.main import create_app
from buildingagent.core.errors import ApiError, api_error_response


def test_health_returns_status_and_generates_request_id() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers.get("X-Request-ID")


def test_health_echoes_supplied_request_id() -> None:
    client = TestClient(create_app())

    response = client.get("/health", headers={"X-Request-ID": "req-test-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req-test-123"


def test_structured_error_uses_canonical_shape_and_request_id() -> None:
    error = ApiError(
        code="sample_error",
        message="Sample failure",
        status_code=418,
        details={"reason": "teapot"},
    )

    response = api_error_response(error, request_id="req-error-1")
    body_text = response.body.decode()

    assert response.status_code == 418
    assert response.headers["X-Request-ID"] == "req-error-1"
    assert json.loads(body_text) == {
        "error": {
            "code": "sample_error",
            "message": "Sample failure",
            "details": {"reason": "teapot"},
            "requestId": "req-error-1",
        }
    }
    assert "Traceback" not in body_text
    assert "token" not in body_text.lower()
    assert "/mnt/" not in body_text


def test_structured_error_serializes_empty_details_as_object() -> None:
    error = ApiError(code="empty_details", message="No details", status_code=400)

    response = api_error_response(error, request_id="req-empty-1")

    assert response.status_code == 400
    assert json.loads(response.body.decode()) == {
        "error": {
            "code": "empty_details",
            "message": "No details",
            "details": {},
            "requestId": "req-empty-1",
        }
    }

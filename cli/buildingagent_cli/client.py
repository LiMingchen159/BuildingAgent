from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
BASE_URL_ENV = "BUILDINGAGENT_API_URL"
TIMEOUT_ENV = "BUILDINGAGENT_CLI_TIMEOUT_SECONDS"


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, request_id: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.request_id = request_id


class BackendUnavailableError(Exception):
    pass


class MalformedResponseError(Exception):
    pass


@dataclass(frozen=True)
class ApiClient:
    base_url: str | None = None
    timeout_seconds: float | None = None

    def __post_init__(self) -> None:
        if self.base_url is None:
            object.__setattr__(self, "base_url", os.environ.get(BASE_URL_ENV, DEFAULT_BASE_URL).rstrip("/"))
        if self.timeout_seconds is None:
            raw_timeout = os.environ.get(TIMEOUT_ENV, "5")
            try:
                timeout = float(raw_timeout)
            except ValueError:
                timeout = 5.0
            object.__setattr__(self, "timeout_seconds", timeout)

    def login(self, email: str, password: str) -> dict[str, Any]:
        return self._request("POST", "/api/v1/auth/login", json_body={"email": email, "password": password})

    def list_projects(self, token: str) -> dict[str, Any]:
        return self._request("GET", "/api/v1/projects", token=token)

    def select_project(self, token: str, project_id: str) -> dict[str, Any]:
        safe_project_id = urllib.parse.quote(project_id, safe="")
        return self._request("POST", f"/api/v1/projects/{safe_project_id}/select", token=token)

    def chat_send(self, token: str, project_id: str, message: str) -> dict[str, Any]:
        safe_project_id = urllib.parse.quote(project_id, safe="")
        return self._request("POST", f"/api/v1/projects/{safe_project_id}/chat", token=token, json_body={"message": message})

    def chat_history(self, token: str, project_id: str) -> dict[str, Any]:
        safe_project_id = urllib.parse.quote(project_id, safe="")
        return self._request("GET", f"/api/v1/projects/{safe_project_id}/chat", token=token)

    def _request(self, method: str, path: str, token: str | None = None, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None
        headers = {"Accept": "application/json"}
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(f"{self.base_url}{path}", data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return _decode_json_response(response.status, response.read())
        except urllib.error.HTTPError as exc:
            parsed = _decode_error_body(exc.code, exc.read())
            raise ApiError(exc.code, parsed["code"], parsed["message"], parsed.get("requestId")) from exc
        except TimeoutError as exc:
            raise BackendUnavailableError("Backend request timed out; prior CLI session state was preserved.") from exc
        except (urllib.error.URLError, OSError) as exc:
            raise BackendUnavailableError("Backend is unavailable; check BUILDINGAGENT_API_URL and try again.") from exc


def _decode_json_response(status_code: int, raw: bytes) -> dict[str, Any]:
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MalformedResponseError("Malformed response from backend.") from exc
    if not isinstance(decoded, dict):
        raise MalformedResponseError("Malformed response from backend.")
    return decoded


def _decode_error_body(status_code: int, raw: bytes) -> dict[str, str | None]:
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MalformedResponseError("Malformed response from backend.") from exc
    error = decoded.get("error") if isinstance(decoded, dict) else None
    if not isinstance(error, dict):
        raise MalformedResponseError("Malformed response from backend.")
    code = error.get("code")
    message = error.get("message")
    request_id = error.get("requestId")
    if not isinstance(code, str) or not isinstance(message, str):
        raise MalformedResponseError("Malformed response from backend.")
    return {"code": code, "message": message, "requestId": request_id if isinstance(request_id, str) else None}

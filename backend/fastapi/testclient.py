from __future__ import annotations

from typing import Any


class TestClient:
    def __init__(self, app: Any):
        self.app = app
        if hasattr(app, "_startup"):
            app._startup()

    def get(self, path: str, headers: dict[str, str] | None = None):
        return self.app.handle("GET", path, headers=headers)

    def post(self, path: str, json: Any | None = None, headers: dict[str, str] | None = None):
        return self.app.handle("POST", path, headers=headers, json_body=json)

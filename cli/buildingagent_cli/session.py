from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_SESSION_PATH = Path.home() / ".config" / "buildingagent" / "session.json"
SESSION_PATH_ENV = "BUILDINGAGENT_CLI_SESSION_PATH"


class SessionError(Exception):
    """Raised when the local CLI session cannot be trusted."""


@dataclass(frozen=True)
class SessionState:
    access_token: str
    selected_project_id: str | None = None

    def with_project(self, project_id: str) -> "SessionState":
        return SessionState(access_token=self.access_token, selected_project_id=project_id)


def session_path() -> Path:
    configured = os.environ.get(SESSION_PATH_ENV)
    return Path(configured).expanduser() if configured else DEFAULT_SESSION_PATH


def load_session(path: Path | None = None) -> SessionState:
    target = path or session_path()
    try:
        raw = target.read_text(encoding="utf-8")
        data = json.loads(raw)
    except FileNotFoundError as exc:
        raise SessionError("Not logged in. Run `buildingagent login` first.") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise SessionError("Local session file is corrupt or unreadable; please re-login.") from exc

    token = data.get("accessToken") if isinstance(data, dict) else None
    project_id = data.get("selectedProjectId") if isinstance(data, dict) else None
    allowed_keys = {"accessToken", "selectedProjectId"}
    if not isinstance(data, dict) or not isinstance(token, str) or not token.strip() or any(key not in allowed_keys for key in data):
        raise SessionError("Local session file is corrupt or unreadable; please re-login.")
    if project_id is not None and (not isinstance(project_id, str) or not project_id.strip()):
        raise SessionError("Local session file is corrupt or unreadable; please re-login.")
    return SessionState(access_token=token, selected_project_id=project_id)


def save_session(state: SessionState, path: Path | None = None) -> None:
    target = path or session_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {"accessToken": state.access_token}
    if state.selected_project_id:
        payload["selectedProjectId"] = state.selected_project_id
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    os.replace(temporary, target)

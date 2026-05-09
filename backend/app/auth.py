from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request

from .db import connect, token_expiry, utc_now

PASSWORD_SALT = "buildingagent-s01-dev-salt"
TOKEN_PREFIX = "bag_s01_"


def hash_password(password: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), PASSWORD_SALT.encode("utf-8"), 120_000)
    return "pbkdf2_sha256$120000$" + digest.hex()


def verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), password_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: str) -> str:
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute(
            "INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (hash_token(token), user_id, utc_now(), token_expiry()),
        )
        conn.commit()
    return token


def bearer_from_request(request: Request) -> str:
    value = request.headers.get("authorization", "")
    if not value.startswith("Bearer "):
        raise HTTPException(401, {"error": {"code": "auth_required", "message": "Bearer token is required", "requestId": request.state.request_id}})
    token = value.removeprefix("Bearer ").strip()
    if not token or len(token) > 256 or not token.startswith(TOKEN_PREFIX):
        raise HTTPException(401, {"error": {"code": "invalid_token", "message": "Bearer token is invalid", "requestId": request.state.request_id}})
    return token


def current_user(request: Request) -> dict[str, Any]:
    token = bearer_from_request(request)
    now = datetime.now(timezone.utc)
    with connect() as conn:
        row = conn.execute(
            """
            SELECT users.id, users.email, users.display_name, users.workspace_id, sessions.selected_project_id, sessions.expires_at
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            """,
            (hash_token(token),),
        ).fetchone()
    if not row:
        raise HTTPException(401, {"error": {"code": "invalid_token", "message": "Bearer token is invalid", "requestId": request.state.request_id}})
    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at < now:
        raise HTTPException(401, {"error": {"code": "invalid_token", "message": "Bearer token is expired", "requestId": request.state.request_id}})
    return dict(row)


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "workspaceId": row["workspace_id"],
        "selectedProjectId": row.get("selected_project_id"),
    }

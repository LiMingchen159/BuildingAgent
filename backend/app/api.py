from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from . import auth
from .db import connect, init_db, transaction, utc_now
from .seed import DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD, DEMO_PROJECT_ID

API_PREFIX = "/api/v1"
MAX_CHAT_MESSAGE_CHARS = 4000
MAX_LIST_LIMIT = 100

router = APIRouter()


def request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if existing:
        return existing
    incoming = request.headers.get("x-request-id")
    rid = incoming if incoming and len(incoming) <= 80 else f"req_{uuid.uuid4().hex}"
    request.state.request_id = rid
    return rid


def error_response(request: Request, status_code: int, code: str, message: str):
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message, "requestId": request_id(request)}})


def fail(request: Request, status_code: int, code: str, message: str) -> None:
    raise HTTPException(status_code, {"error": {"code": code, "message": message, "requestId": request_id(request)}})


def audit(conn: sqlite3.Connection, request: Request, action: str, outcome: str, actor_user_id: str | None = None, project_id: str | None = None, details: dict[str, Any] | None = None) -> None:
    safe_details = details or {}
    for forbidden in ("password", "token", "accessToken", "passwordHash", "authorization"):
        safe_details.pop(forbidden, None)
    conn.execute(
        "INSERT INTO audit_events(id, request_id, actor_user_id, project_id, action, outcome, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (f"aud_{uuid.uuid4().hex}", request_id(request), actor_user_id, project_id, action, outcome, json.dumps(safe_details, sort_keys=True), utc_now()),
    )


def require_user(request: Request) -> dict[str, Any]:
    request_id(request)
    try:
        return auth.current_user(request)
    except HTTPException as exc:
        with connect() as conn:
            audit(conn, request, "auth.required", "denied", details={"reason": exc.detail.get("error", {}).get("code", "invalid_auth") if isinstance(exc.detail, dict) else "invalid_auth"})
            conn.commit()
        raise


def validate_project_id(request: Request, project_id: str) -> None:
    if not project_id.startswith("prj_") or len(project_id) > 80 or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for ch in project_id):
        fail(request, 400, "invalid_project_id", "Project id is malformed")


def require_membership(conn: sqlite3.Connection, request: Request, user: dict[str, Any], project_id: str, permission: str) -> sqlite3.Row:
    validate_project_id(request, project_id)
    project = conn.execute("SELECT id, name, workspace_id, created_at FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        audit(conn, request, "project.access", "denied", actor_user_id=user["id"], project_id=project_id, details={"reason": "project_not_found"})
        conn.commit()
        fail(request, 404, "project_not_found", "Project was not found")
    membership = conn.execute(
        """
        SELECT memberships.user_id, memberships.project_id, roles.name AS role_name, roles.permissions
        FROM memberships JOIN roles ON roles.id = memberships.role_id
        WHERE memberships.user_id = ? AND memberships.project_id = ?
        """,
        (user["id"], project_id),
    ).fetchone()
    permissions = json.loads(membership["permissions"]) if membership else []
    if not membership or permission not in permissions:
        audit(conn, request, "project.access", "denied", actor_user_id=user["id"], project_id=project_id, details={"reason": "forbidden", "permission": permission})
        conn.commit()
        fail(request, 403, "project_forbidden", "You do not have access to this project")
    return project


def public_project(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "workspaceId": row["workspace_id"], "createdAt": row["created_at"]}


def public_message(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "projectId": row["project_id"], "role": row["role"], "content": row["content"], "createdAt": row["created_at"]}


def public_audit(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "requestId": row["request_id"],
        "actorUserId": row["actor_user_id"],
        "projectId": row["project_id"],
        "action": row["action"],
        "outcome": row["outcome"],
        "details": json.loads(row["details"]),
        "createdAt": row["created_at"],
    }


@router.get("/health")
def health(request: Request):
    request_id(request)
    try:
        with connect() as conn:
            conn.execute("SELECT 1").fetchone()
        db = "ok"
        status = "ok"
    except sqlite3.Error:
        db = "error"
        status = "degraded"
    return {"status": status, "database": db, "requestId": request_id(request)}


@router.get("/status")
def status(request: Request):
    request_id(request)
    try:
        with connect() as conn:
            counts = {
                "users": conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"],
                "projects": conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()["c"],
                "chatMessages": conn.execute("SELECT COUNT(*) AS c FROM chat_messages").fetchone()["c"],
                "auditEvents": conn.execute("SELECT COUNT(*) AS c FROM audit_events").fetchone()["c"],
            }
        return {"status": "ok", "database": "ok", "counts": counts, "requestId": request_id(request)}
    except sqlite3.Error:
        return error_response(request, 503, "database_unavailable", "Database status check failed")


@router.post("/auth/login")
def login(request: Request, payload: dict[str, Any] = Body(default={})):
    request_id(request)
    email = str((payload or {}).get("email", "")).strip().lower()
    password = str((payload or {}).get("password", ""))
    if not email or not password:
        with connect() as conn:
            audit(conn, request, "auth.login", "denied", details={"reason": "empty_credentials", "emailProvided": bool(email)})
            conn.commit()
        fail(request, 400, "empty_credentials", "Email and password are required")
    with connect() as conn:
        row = conn.execute("SELECT id, email, display_name, workspace_id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not auth.verify_password(password, row["password_hash"]):
            audit(conn, request, "auth.login", "denied", actor_user_id=row["id"] if row else None, details={"reason": "invalid_credentials", "emailProvided": True})
            conn.commit()
            fail(request, 401, "invalid_credentials", "Email or password is incorrect")
        token = auth.create_session(row["id"])
    with connect() as conn:
        audit(conn, request, "auth.login", "success", actor_user_id=row["id"], details={"email": row["email"]})
        conn.commit()
    public = auth.public_user(dict(row) | {"selected_project_id": None})
    return {"accessToken": token, "tokenType": "bearer", "user": public}


@router.get("/auth/me")
def me(request: Request, user: dict[str, Any] = Depends(require_user)):
    return {"user": auth.public_user(user)}


@router.get("/projects")
def projects(request: Request, user: dict[str, Any] = Depends(require_user), limit: int = Query(50, ge=1, le=MAX_LIST_LIMIT)):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT projects.id, projects.name, projects.workspace_id, projects.created_at
            FROM projects JOIN memberships ON memberships.project_id = projects.id
            WHERE memberships.user_id = ?
            ORDER BY projects.created_at, projects.id
            LIMIT ?
            """,
            (user["id"], min(limit, MAX_LIST_LIMIT)),
        ).fetchall()
        audit(conn, request, "project.list", "success", actor_user_id=user["id"], details={"count": len(rows)})
        conn.commit()
    return {"projects": [public_project(row) for row in rows], "limit": min(limit, MAX_LIST_LIMIT)}


@router.post("/projects/{project_id}/select")
def select_project(project_id: str, request: Request, user: dict[str, Any] = Depends(require_user)):
    with transaction() as conn:
        project = require_membership(conn, request, user, project_id, "project:select")
        token = auth.bearer_from_request(request)
        conn.execute("UPDATE sessions SET selected_project_id = ? WHERE token_hash = ?", (project_id, auth.hash_token(token)))
        audit(conn, request, "project.select", "success", actor_user_id=user["id"], project_id=project_id)
        return {"selectedProject": public_project(project)}


@router.get("/projects/{project_id}/chat")
def chat_history(project_id: str, request: Request, user: dict[str, Any] = Depends(require_user), limit: int = Query(50, ge=1, le=MAX_LIST_LIMIT)):
    with connect() as conn:
        require_membership(conn, request, user, project_id, "chat:read")
        rows = conn.execute(
            "SELECT id, project_id, role, content, created_at FROM chat_messages WHERE project_id = ? ORDER BY sequence LIMIT ?",
            (project_id, min(limit, MAX_LIST_LIMIT)),
        ).fetchall()
    return {"messages": [public_message(row) for row in rows], "limit": min(limit, MAX_LIST_LIMIT)}


@router.post("/projects/{project_id}/chat")
def create_chat(project_id: str, request: Request, payload: dict[str, Any] = Body(default={}), user: dict[str, Any] = Depends(require_user)):
    content = str((payload or {}).get("message", ""))
    if not content.strip():
        fail(request, 400, "empty_chat_message", "Chat message cannot be empty")
    if len(content) > MAX_CHAT_MESSAGE_CHARS:
        fail(request, 413, "chat_message_too_large", "Chat message is too large")
    reply = f"BuildingAgent placeholder reply for {project_id}: received {len(content.strip())} characters."
    with transaction() as conn:
        require_membership(conn, request, user, project_id, "chat:write")
        now = utc_now()
        next_sequence = conn.execute("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM chat_messages WHERE project_id = ?", (project_id,)).fetchone()["next_sequence"]
        user_message = (f"msg_{uuid.uuid4().hex}", project_id, user["id"], "user", content.strip(), now, next_sequence)
        assistant_message = (f"msg_{uuid.uuid4().hex}", project_id, None, "assistant", reply, utc_now(), next_sequence + 1)
        conn.execute(
            "INSERT INTO chat_messages(id, project_id, user_id, role, content, created_at, sequence) VALUES (?, ?, ?, ?, ?, ?, ?)",
            user_message,
        )
        conn.execute(
            "INSERT INTO chat_messages(id, project_id, user_id, role, content, created_at, sequence) VALUES (?, ?, ?, ?, ?, ?, ?)",
            assistant_message,
        )
        audit(conn, request, "chat.create", "success", actor_user_id=user["id"], project_id=project_id, details={"messageChars": len(content.strip()), "assistantReply": "deterministic_placeholder"})
        rows = conn.execute("SELECT id, project_id, role, content, created_at FROM chat_messages WHERE id IN (?, ?) ORDER BY CASE role WHEN 'user' THEN 0 ELSE 1 END", (user_message[0], assistant_message[0])).fetchall()
    return {"messages": [public_message(row) for row in rows]}


@router.get("/projects/{project_id}/audit-events")
def audit_events(project_id: str, request: Request, user: dict[str, Any] = Depends(require_user), limit: int = Query(50, ge=1, le=MAX_LIST_LIMIT)):
    with connect() as conn:
        require_membership(conn, request, user, project_id, "audit:read")
        rows = conn.execute(
            "SELECT id, request_id, actor_user_id, project_id, action, outcome, details, created_at FROM audit_events WHERE project_id = ? OR actor_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
            (project_id, user["id"], min(limit, MAX_LIST_LIMIT)),
        ).fetchall()
    return {"events": [public_audit(row) for row in rows], "limit": min(limit, MAX_LIST_LIMIT)}


def startup() -> None:
    init_db()


def dev_credentials() -> dict[str, str]:
    return {"email": DEV_OWNER_EMAIL, "password": DEV_OWNER_PASSWORD, "projectId": DEMO_PROJECT_ID}

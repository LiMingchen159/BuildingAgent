from __future__ import annotations

import json
import sqlite3

from .auth import hash_password
from .db import utc_now

DEV_OWNER_EMAIL = "owner@buildingagent.local"
DEV_OWNER_PASSWORD = "buildingagent-dev-password"
WORKSPACE_ID = "ws_default"
OWNER_ID = "usr_owner"
OUTSIDER_ID = "usr_outsider"
DEMO_PROJECT_ID = "prj_demo_building"
PRIVATE_PROJECT_ID = "prj_private_building"
ADMIN_ROLE_ID = "role_admin"
VIEWER_ROLE_ID = "role_viewer"


def seed_dev_data(conn: sqlite3.Connection) -> None:
    now = utc_now()
    conn.execute("INSERT OR IGNORE INTO workspaces(id, name, created_at) VALUES (?, ?, ?)", (WORKSPACE_ID, "Default Workspace", now))
    conn.execute(
        "INSERT OR IGNORE INTO roles(id, name, permissions) VALUES (?, ?, ?)",
        (ADMIN_ROLE_ID, "owner_admin", json.dumps(["project:read", "project:select", "chat:read", "chat:write", "audit:read"])),
    )
    conn.execute(
        "INSERT OR IGNORE INTO roles(id, name, permissions) VALUES (?, ?, ?)",
        (VIEWER_ROLE_ID, "viewer", json.dumps(["project:read", "chat:read"])),
    )
    conn.execute(
        "INSERT OR IGNORE INTO users(id, workspace_id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (OWNER_ID, WORKSPACE_ID, DEV_OWNER_EMAIL, "Demo Owner", hash_password(DEV_OWNER_PASSWORD), now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO users(id, workspace_id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (OUTSIDER_ID, WORKSPACE_ID, "outsider@buildingagent.local", "Outsider User", hash_password("outsider-dev-password"), now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO projects(id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)",
        (DEMO_PROJECT_ID, WORKSPACE_ID, "Demo Building Project", now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO projects(id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)",
        (PRIVATE_PROJECT_ID, WORKSPACE_ID, "Private Building Project", now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO memberships(user_id, project_id, role_id, created_at) VALUES (?, ?, ?, ?)",
        (OWNER_ID, DEMO_PROJECT_ID, ADMIN_ROLE_ID, now),
    )
    conn.execute(
        "INSERT OR IGNORE INTO memberships(user_id, project_id, role_id, created_at) VALUES (?, ?, ?, ?)",
        (OUTSIDER_ID, PRIVATE_PROJECT_ID, ADMIN_ROLE_ID, now),
    )

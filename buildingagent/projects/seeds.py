"""Deterministic non-secret local/dev seed data."""

from __future__ import annotations

from buildingagent.projects.models import Membership, Project, SeedStore, User, Workspace

_OWNER_SCOPES = ("project:read", "project:write", "chat:use", "memory:read")
_ENGINEER_SCOPES = ("project:read", "chat:use", "memory:read")
_VIEWER_SCOPES = ("project:read", "memory:read")

LOCAL_DEV_SEED_STORE = SeedStore(
    users=(
        User(
            id="user_alice",
            email="alice@example.local",
            display_name="Alice Developer",
            is_local_dev=True,
        ),
        User(
            id="user_bob",
            email="bob@example.local",
            display_name="Bob Operator",
            is_local_dev=True,
        ),
        User(
            id="user_no_projects",
            email="noproj@example.local",
            display_name="No Projects User",
            is_local_dev=True,
        ),
    ),
    workspaces=(
        Workspace(id="workspace_demo", name="Workspace A"),
    ),
    projects=(
        Project(
            id="project_hkust_demo",
            workspace_id="workspace_demo",
            name="HKUST Building Demo",
        ),
        Project(
            id="project_mtrc_elements",
            workspace_id="workspace_demo",
            name="MTRC ELEMENTS",
        ),
        Project(
            id="project_uc_berkeley_demo",
            workspace_id="workspace_demo",
            name="UC Berkeley Demo",
        ),
    ),
    memberships=(
        Membership(
            user_id="user_alice",
            workspace_id="workspace_demo",
            project_id="project_hkust_demo",
            role="owner",
            permission_scopes=_OWNER_SCOPES,
        ),
        Membership(
            user_id="user_alice",
            workspace_id="workspace_demo",
            project_id="project_mtrc_elements",
            role="engineer",
            permission_scopes=_ENGINEER_SCOPES,
        ),
        Membership(
            user_id="user_bob",
            workspace_id="workspace_demo",
            project_id="project_uc_berkeley_demo",
            role="viewer",
            permission_scopes=_VIEWER_SCOPES,
        ),
    ),
    token_to_user_id={
        "dev-token-alice": "user_alice",
        "dev-token-bob": "user_bob",
        "dev-token-no-projects": "user_no_projects",
    },
)

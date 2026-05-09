"""Typed shared project and request-context domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Role = Literal["owner", "admin", "engineer", "operator", "viewer", "external_reviewer", "developer"]
PermissionScope = Literal[
    "project:read",
    "project:write",
    "chat:use",
    "memory:read",
    "memory:write",
    "settings:read",
    "settings:write",
]


@dataclass(frozen=True)
class User:
    """A deterministic local/dev user.

    Token material is intentionally not stored on or represented by the user;
    the provider owns token lookup so user reprs remain safe for diagnostics.
    """

    id: str
    email: str
    display_name: str
    is_local_dev: bool = True


@dataclass(frozen=True)
class Workspace:
    id: str
    name: str


@dataclass(frozen=True)
class Project:
    id: str
    workspace_id: str
    name: str


@dataclass(frozen=True)
class Membership:
    user_id: str
    workspace_id: str
    project_id: str
    role: Role
    permission_scopes: tuple[PermissionScope, ...]


@dataclass(frozen=True)
class RequestContext:
    user_id: str
    workspace_id: str
    project_id: str
    role: Role
    permission_scopes: tuple[PermissionScope, ...]

    def to_public_dict(self) -> dict[str, object]:
        """Serialize with predictable JSON-friendly containers."""

        return {
            "user_id": self.user_id,
            "workspace_id": self.workspace_id,
            "project_id": self.project_id,
            "role": self.role,
            "permission_scopes": list(self.permission_scopes),
        }


@dataclass(frozen=True)
class SeedStore:
    """Small immutable in-memory seed store for local/dev contracts."""

    users: tuple[User, ...]
    workspaces: tuple[Workspace, ...]
    projects: tuple[Project, ...]
    memberships: tuple[Membership, ...]
    token_to_user_id: dict[str, str]
    users_by_id: dict[str, User] = field(init=False)
    workspaces_by_id: dict[str, Workspace] = field(init=False)
    projects_by_id: dict[str, Project] = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "users_by_id", {user.id: user for user in self.users})
        object.__setattr__(
            self,
            "workspaces_by_id",
            {workspace.id: workspace for workspace in self.workspaces},
        )
        object.__setattr__(
            self,
            "projects_by_id",
            {project.id: project for project in self.projects},
        )

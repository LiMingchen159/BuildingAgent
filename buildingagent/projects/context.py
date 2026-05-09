"""Project membership and request-context resolution services."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from buildingagent.projects.models import Membership, Project, RequestContext, SeedStore


@dataclass(frozen=True)
class ProjectDomainError(Exception):
    """Typed domain error that can be mapped to HTTP errors by routes."""

    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.details is None:  # type: ignore[comparison-overlap]
            object.__setattr__(self, "details", {})


class ProjectAccessDeniedError(ProjectDomainError):
    """Raised when auth or project membership validation fails."""


class ProjectNotFoundError(ProjectDomainError):
    """Raised when a requested project identifier is empty or unknown."""


class ProjectContextService:
    """Resolve project access through a reusable domain-layer boundary."""

    def __init__(self, seed_store: SeedStore) -> None:
        self._seed_store = seed_store

    def list_accessible_projects(self, user_id: str) -> list[Project]:
        """Return projects a user can access without leaking other projects."""

        if not user_id or user_id not in self._seed_store.users_by_id:
            return []

        projects: list[Project] = []
        for membership in self._memberships_for_user(user_id):
            project = self._seed_store.projects_by_id.get(membership.project_id)
            if project is not None:
                projects.append(project)
        return projects

    def resolve_context(self, user_id: str, project_id: str) -> RequestContext:
        """Build a request context only when project exists and membership allows it."""

        project = self._project_or_raise(project_id)
        membership = self._membership_for_user_and_project(user_id, project.id)
        if membership is None:
            raise ProjectAccessDeniedError(
                code="project_access_denied",
                message="User does not have access to the requested project.",
                details={"project_id": project.id},
            )

        return RequestContext(
            user_id=membership.user_id,
            workspace_id=membership.workspace_id,
            project_id=membership.project_id,
            role=membership.role,
            permission_scopes=membership.permission_scopes,
        )

    def _project_or_raise(self, project_id: str) -> Project:
        if not project_id:
            raise ProjectNotFoundError(
                code="project_not_found",
                message="Project was not found.",
                details={"project_id": project_id},
            )

        project = self._seed_store.projects_by_id.get(project_id)
        if project is None:
            raise ProjectNotFoundError(
                code="project_not_found",
                message="Project was not found.",
                details={"project_id": project_id},
            )
        return project

    def _memberships_for_user(self, user_id: str) -> list[Membership]:
        return [
            membership
            for membership in self._seed_store.memberships
            if membership.user_id == user_id
        ]

    def _membership_for_user_and_project(
        self,
        user_id: str,
        project_id: str,
    ) -> Membership | None:
        for membership in self._memberships_for_user(user_id):
            if membership.project_id == project_id:
                return membership
        return None

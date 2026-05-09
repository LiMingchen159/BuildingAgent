"""Project-scoped memory service skeleton for M002.

The service exposes the future memory boundary without retrieval, ranking,
vector storage, persistence, or cross-project sharing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from buildingagent.projects.models import RequestContext

MemoryStatus = Literal["stubbed"]


@dataclass(frozen=True)
class MemoryScope:
    """Non-secret description of the memory namespace selected by context."""

    workspace_id: str
    project_id: str
    user_id: str
    status: MemoryStatus
    isolation: str

    def to_public_dict(self) -> dict[str, object]:
        return {
            "workspace_id": self.workspace_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "status": self.status,
            "isolation": self.isolation,
        }


class ProjectMemoryService:
    """Return empty project-scoped memory metadata for skeleton callers."""

    def describe_project_memory(self, context: RequestContext) -> dict[str, object]:
        """Serialize the memory skeleton for an already authorized project context."""

        scope = MemoryScope(
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            status="stubbed",
            isolation="project-scoped",
        )
        return {
            "context": context.to_public_dict(),
            "scope": scope.to_public_dict(),
            "items": [],
            "status": "stubbed",
            "stub_reason": "M002 exposes the memory boundary without retrieval, ranking, or persistence.",
        }

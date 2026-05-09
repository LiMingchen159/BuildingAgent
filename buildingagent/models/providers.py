"""Model/provider configuration skeletons for M002.

This module intentionally exposes deterministic, non-secret provider metadata only.
It does not load API keys, test connectivity, or invoke model providers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from buildingagent.projects.models import RequestContext

ProviderStatus = Literal["stubbed"]


@dataclass(frozen=True)
class ModelProviderDescriptor:
    """Safe provider metadata suitable for API, CLI, and Web skeletons."""

    id: str
    name: str
    status: ProviderStatus
    default_model_id: str
    configured: bool
    secret_required: bool
    stub_reason: str

    def to_public_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "default_model_id": self.default_model_id,
            "configured": self.configured,
            "secret_required": self.secret_required,
            "stub_reason": self.stub_reason,
        }


@dataclass(frozen=True)
class ModelDescriptor:
    """Safe model metadata without provider credentials or live capability claims."""

    id: str
    provider_id: str
    name: str
    status: ProviderStatus
    supports_streaming: bool
    stub_reason: str

    def to_public_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "provider_id": self.provider_id,
            "name": self.name,
            "status": self.status,
            "supports_streaming": self.supports_streaming,
            "stub_reason": self.stub_reason,
        }


class ModelProviderService:
    """Return project-scoped provider/model configuration skeleton metadata."""

    _providers = (
        ModelProviderDescriptor(
            id="local-dev-stub",
            name="Local/dev stub provider",
            status="stubbed",
            default_model_id="stub-chat-model",
            configured=False,
            secret_required=False,
            stub_reason="M002 proves provider configuration boundaries without real model calls or secrets.",
        ),
    )
    _models = (
        ModelDescriptor(
            id="stub-chat-model",
            provider_id="local-dev-stub",
            name="Stub Chat Model",
            status="stubbed",
            supports_streaming=False,
            stub_reason="M002 runtime responses are deterministic stubs only.",
        ),
    )

    def list_project_models(self, context: RequestContext) -> dict[str, object]:
        """Serialize the project-scoped model/provider skeleton contract."""

        default_provider = self._providers[0]
        return {
            "context": context.to_public_dict(),
            "providers": [provider.to_public_dict() for provider in self._providers],
            "models": [model.to_public_dict() for model in self._models],
            "default_provider_id": default_provider.id,
            "default_model_id": default_provider.default_model_id,
            "status": "stubbed",
        }

    def default_selection(self, context: RequestContext) -> dict[str, object]:
        """Return the selected provider/model pair for runtime stub responses."""

        provider = self._providers[0]
        model = self._models[0]
        return {
            "context": context.to_public_dict(),
            "provider": provider.to_public_dict(),
            "model": model.to_public_dict(),
        }

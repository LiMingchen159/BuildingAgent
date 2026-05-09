"""Contract tests for the current M002 runtime/registry service skeletons.

These tests intentionally stay inside the skeleton boundary: they verify deterministic,
project-scoped, non-secret metadata without invoking models, tools, skills, storage,
or building-domain logic.
"""

from __future__ import annotations

import importlib

from buildingagent.memory.service import ProjectMemoryService
from buildingagent.models.providers import ModelProviderService
from buildingagent.projects.context import ProjectContextService
from buildingagent.projects.seeds import LOCAL_DEV_SEED_STORE


def _alice_hkust_context():
    return ProjectContextService(LOCAL_DEV_SEED_STORE).resolve_context(
        "user_alice",
        "project_hkust_demo",
    )


def _assert_no_sensitive_strings(payload: object) -> None:
    rendered = repr(payload).lower()
    forbidden_fragments = (
        "dev-token",
        "api_key",
        "apikey",
        "traceback",
        "/mnt/",
        "c:\\",
        "ifcopenshell",
        "rdflib",
    )
    for fragment in forbidden_fragments:
        assert fragment not in rendered


def test_project_memory_service_returns_empty_project_scoped_stub_metadata() -> None:
    context = _alice_hkust_context()
    service = ProjectMemoryService()

    result = service.describe_project_memory(context)

    assert result["status"] == "stubbed"
    assert result["items"] == []
    assert result["context"] == context.to_public_dict()
    assert result["scope"] == {
        "workspace_id": "workspace_demo",
        "project_id": "project_hkust_demo",
        "user_id": "user_alice",
        "status": "stubbed",
        "isolation": "project-scoped",
    }
    assert "retrieval" in str(result["stub_reason"]).lower()
    _assert_no_sensitive_strings(result)


def test_model_provider_service_returns_deterministic_non_secret_stub_selection() -> None:
    context = _alice_hkust_context()
    service = ModelProviderService()

    first = service.list_project_models(context)
    second = service.list_project_models(context)
    selection = service.default_selection(context)

    assert first == second
    assert first["context"] == context.to_public_dict()
    assert first["status"] == "stubbed"
    assert first["default_provider_id"] == "local-dev-stub"
    assert first["default_model_id"] == "stub-chat-model"
    assert first["providers"] == [
        {
            "id": "local-dev-stub",
            "name": "Local/dev stub provider",
            "status": "stubbed",
            "default_model_id": "stub-chat-model",
            "configured": False,
            "secret_required": False,
            "stub_reason": "M002 proves provider configuration boundaries without real model calls or secrets.",
        }
    ]
    assert first["models"][0]["id"] == "stub-chat-model"
    assert first["models"][0]["supports_streaming"] is False
    assert selection["provider"]["id"] == first["default_provider_id"]
    assert selection["model"]["id"] == first["default_model_id"]
    _assert_no_sensitive_strings(first)
    _assert_no_sensitive_strings(selection)


def test_runtime_tool_and_skill_modules_remain_inert_skeletons() -> None:
    runtime_module = importlib.import_module("buildingagent.runtime.service")
    tool_module = importlib.import_module("buildingagent.tools.registry")
    skill_module = importlib.import_module("buildingagent.skills.registry")

    assert "structured stub response" in (runtime_module.__doc__ or "")
    assert "placeholder metadata" in (tool_module.__doc__ or "")
    assert "does not load or execute" in (skill_module.__doc__ or "")

    for module in (runtime_module, tool_module, skill_module):
        public_names = {name for name in dir(module) if not name.startswith("_")}
        assert "execute" not in public_names
        assert "dispatch" not in public_names
        assert "invoke" not in public_names
        assert "run" not in public_names

import pytest

from buildingagent.auth.provider import LocalDevAuthProvider
from buildingagent.projects.context import (
    ProjectAccessDeniedError,
    ProjectContextService,
    ProjectNotFoundError,
)
from buildingagent.projects.seeds import LOCAL_DEV_SEED_STORE


def test_valid_seeded_token_resolves_local_dev_user_without_exposing_token() -> None:
    provider = LocalDevAuthProvider(LOCAL_DEV_SEED_STORE)

    user = provider.authenticate_bearer_token("dev-token-alice")

    assert user.id == "user_alice"
    assert user.email == "alice@example.local"
    assert user.display_name == "Alice Developer"
    assert user.is_local_dev is True
    assert "token" not in repr(user).lower()


@pytest.mark.parametrize("token", ["", "unknown-token"])
def test_invalid_or_empty_token_is_rejected_with_stable_domain_error(token: str) -> None:
    provider = LocalDevAuthProvider(LOCAL_DEV_SEED_STORE)

    with pytest.raises(ProjectAccessDeniedError) as exc_info:
        provider.authenticate_bearer_token(token)

    assert exc_info.value.code == "auth_invalid_token"
    assert exc_info.value.details == {}
    if token:
        assert token not in str(exc_info.value)


def test_project_listing_returns_only_user_memberships() -> None:
    service = ProjectContextService(LOCAL_DEV_SEED_STORE)

    projects = service.list_accessible_projects("user_alice")

    assert [project.id for project in projects] == ["project_hkust_demo", "project_mtrc_elements"]
    assert "project_uc_berkeley_demo" not in {project.id for project in projects}


def test_project_listing_for_user_without_memberships_returns_empty_list() -> None:
    service = ProjectContextService(LOCAL_DEV_SEED_STORE)

    assert service.list_accessible_projects("user_no_projects") == []


def test_resolve_context_returns_required_request_context_shape() -> None:
    service = ProjectContextService(LOCAL_DEV_SEED_STORE)

    context = service.resolve_context("user_alice", "project_hkust_demo")

    assert context.user_id == "user_alice"
    assert context.workspace_id == "workspace_demo"
    assert context.project_id == "project_hkust_demo"
    assert context.role == "owner"
    assert context.permission_scopes == (
        "project:read",
        "project:write",
        "chat:use",
        "memory:read",
    )
    assert context.to_public_dict() == {
        "user_id": "user_alice",
        "workspace_id": "workspace_demo",
        "project_id": "project_hkust_demo",
        "role": "owner",
        "permission_scopes": [
            "project:read",
            "project:write",
            "chat:use",
            "memory:read",
        ],
    }


@pytest.mark.parametrize("project_id", ["", "project_missing"])
def test_missing_or_empty_project_id_fails_distinctly_from_auth(project_id: str) -> None:
    service = ProjectContextService(LOCAL_DEV_SEED_STORE)

    with pytest.raises(ProjectNotFoundError) as exc_info:
        service.resolve_context("user_alice", project_id)

    assert exc_info.value.code == "project_not_found"
    assert exc_info.value.details == {"project_id": project_id}


def test_cross_project_context_resolution_is_denied_in_domain_layer() -> None:
    service = ProjectContextService(LOCAL_DEV_SEED_STORE)

    with pytest.raises(ProjectAccessDeniedError) as exc_info:
        service.resolve_context("user_alice", "project_uc_berkeley_demo")

    assert exc_info.value.code == "project_access_denied"
    assert exc_info.value.details == {"project_id": "project_uc_berkeley_demo"}
    assert "user_alice" not in str(exc_info.value)

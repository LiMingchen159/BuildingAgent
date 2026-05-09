"""Seeded local/dev bearer-token authentication provider."""

from __future__ import annotations

from typing import Protocol

from buildingagent.projects.context import ProjectAccessDeniedError
from buildingagent.projects.models import SeedStore, User


class AuthProvider(Protocol):
    """Provider seam for replacing local/dev identity later."""

    def authenticate_bearer_token(self, token: str) -> User:
        """Resolve a bearer token to a user or raise a typed auth error."""


class LocalDevAuthProvider:
    """Resolve deterministic, non-secret local/dev bearer tokens."""

    def __init__(self, seed_store: SeedStore) -> None:
        self._seed_store = seed_store

    def authenticate_bearer_token(self, token: str) -> User:
        normalized_token = token.strip() if token else ""
        if not normalized_token:
            raise ProjectAccessDeniedError(
                code="auth_invalid_token",
                message="Bearer token is missing or invalid.",
            )

        user_id = self._seed_store.token_to_user_id.get(normalized_token)
        if user_id is None:
            raise ProjectAccessDeniedError(
                code="auth_invalid_token",
                message="Bearer token is missing or invalid.",
            )

        user = self._seed_store.users_by_id.get(user_id)
        if user is None:
            raise ProjectAccessDeniedError(
                code="auth_invalid_token",
                message="Bearer token is missing or invalid.",
            )

        return user

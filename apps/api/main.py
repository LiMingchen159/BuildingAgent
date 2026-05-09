"""FastAPI composition root for the BuildingAgent API."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, Request
from pydantic import BaseModel, Field
from starlette.responses import Response

from buildingagent.auth.provider import LocalDevAuthProvider
from buildingagent.core.errors import ApiError, REQUEST_ID_HEADER, api_error_response
from buildingagent.projects.context import (
    ProjectAccessDeniedError,
    ProjectContextService,
    ProjectNotFoundError,
)
from buildingagent.projects.models import Project, RequestContext, SeedStore, User
from buildingagent.projects.seeds import LOCAL_DEV_SEED_STORE

REQUEST_ID_SCOPE_KEY = "request_id"
MAX_PROJECT_LIMIT = 100
DEFAULT_PROJECT_LIMIT = 50


class DevLoginRequest(BaseModel):
    """Explicit local/dev login request body."""

    user_id: str = Field(min_length=1)


def serialize_user(user: User) -> dict[str, object]:
    """Serialize safe caller-facing user metadata."""

    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "is_local_dev": user.is_local_dev,
    }


def serialize_project(project: Project, context: RequestContext) -> dict[str, object]:
    """Serialize a project with the caller's project-scoped role and scopes."""

    return {
        "id": project.id,
        "workspace_id": project.workspace_id,
        "name": project.name,
        "role": context.role,
        "permission_scopes": list(context.permission_scopes),
    }


def get_request_id(request: Request) -> str:
    """Return the request id assigned by middleware for this request."""

    request_id = request.scope.get(REQUEST_ID_SCOPE_KEY)
    if isinstance(request_id, str) and request_id:
        return request_id
    return generate_request_id()


def generate_request_id() -> str:
    """Generate an opaque request id suitable for correlating diagnostics."""

    return f"req_{uuid4().hex}"


def resolve_request_id(request: Request) -> str:
    """Use a caller-supplied request id when present, otherwise generate one."""

    supplied = request.headers.get(REQUEST_ID_HEADER)
    if supplied and supplied.strip():
        return supplied.strip()
    return generate_request_id()


def get_seed_store(request: Request) -> SeedStore:
    """Return the configured local/dev seed store."""

    return request.app.state.seed_store


def get_auth_provider(
    seed_store: Annotated[SeedStore, Depends(get_seed_store)],
) -> LocalDevAuthProvider:
    """Build the auth provider dependency behind the provider seam."""

    return LocalDevAuthProvider(seed_store)


def get_project_context_service(
    seed_store: Annotated[SeedStore, Depends(get_seed_store)],
) -> ProjectContextService:
    """Build the project-context service dependency."""

    return ProjectContextService(seed_store)


def extract_bearer_token(request: Request) -> str:
    """Extract a well-formed bearer token before provider resolution."""

    authorization = request.headers.get("Authorization")
    if authorization is None or not authorization.strip():
        raise ApiError(
            code="auth_missing_credentials",
            message="Authorization credentials are required.",
            status_code=401,
            details={"scheme": "Bearer"},
        )

    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise ApiError(
            code="auth_malformed_authorization",
            message="Authorization header must use the Bearer token scheme.",
            status_code=401,
            details={"scheme": "Bearer"},
        )

    return parts[1].strip()


def get_current_user(
    token: Annotated[str, Depends(extract_bearer_token)],
    auth_provider: Annotated[LocalDevAuthProvider, Depends(get_auth_provider)],
) -> User:
    """Resolve the authenticated user from the bearer token."""

    try:
        return auth_provider.authenticate_bearer_token(token)
    except ProjectAccessDeniedError as exc:
        raise ApiError(
            code=exc.code,
            message=exc.message,
            status_code=401,
            details=dict(exc.details),
        ) from exc


def get_project_context(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ProjectContextService, Depends(get_project_context_service)],
) -> RequestContext:
    """Resolve request context for an authenticated project route."""

    try:
        return service.resolve_context(current_user.id, project_id)
    except ProjectNotFoundError as exc:
        raise ApiError(
            code=exc.code,
            message=exc.message,
            status_code=404,
            details=dict(exc.details),
        ) from exc
    except ProjectAccessDeniedError as exc:
        raise ApiError(
            code=exc.code,
            message=exc.message,
            status_code=403,
            details=dict(exc.details),
        ) from exc


def bounded_project_limit(limit: int = DEFAULT_PROJECT_LIMIT) -> int:
    """Validate and cap project list page size with a stable API error."""

    if limit < 1 or limit > MAX_PROJECT_LIMIT:
        raise ApiError(
            code="invalid_project_limit",
            message=f"Project list limit must be between 1 and {MAX_PROJECT_LIMIT}.",
            status_code=422,
            details={"min": 1, "max": MAX_PROJECT_LIMIT, "limit": limit},
        )
    return limit


def create_app(seed_store: SeedStore = LOCAL_DEV_SEED_STORE) -> FastAPI:
    """Create and configure the FastAPI app."""

    app = FastAPI(title="BuildingAgent API")
    app.state.seed_store = seed_store

    @app.middleware("http")
    async def request_id_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = resolve_request_id(request)
        request.scope[REQUEST_ID_SCOPE_KEY] = request_id
        try:
            response = await call_next(request)
        except ApiError as exc:
            response = api_error_response(exc, request_id=request_id)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/auth/dev-login")
    async def dev_login(
        payload: Annotated[DevLoginRequest, Body()],
        seed_store: Annotated[SeedStore, Depends(get_seed_store)],
    ) -> dict[str, object]:
        user = seed_store.users_by_id.get(payload.user_id)
        if user is None:
            raise ApiError(
                code="dev_login_user_not_found",
                message="Local/dev user was not found.",
                status_code=404,
                details={"user_id": payload.user_id},
            )

        token = next(
            (
                candidate_token
                for candidate_token, user_id in seed_store.token_to_user_id.items()
                if user_id == user.id
            ),
            None,
        )
        if token is None:
            raise ApiError(
                code="dev_login_token_not_configured",
                message="Local/dev user does not have a configured token.",
                status_code=404,
                details={"user_id": payload.user_id},
            )

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": serialize_user(user),
        }

    @app.get("/auth/me")
    async def auth_me(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> dict[str, object]:
        return {"user": serialize_user(current_user)}

    @app.get("/projects")
    async def list_projects(
        current_user: Annotated[User, Depends(get_current_user)],
        service: Annotated[ProjectContextService, Depends(get_project_context_service)],
        limit: Annotated[int, Depends(bounded_project_limit)],
    ) -> dict[str, object]:
        accessible_projects = service.list_accessible_projects(current_user.id)
        page_projects = accessible_projects[:limit]
        items = [
            serialize_project(project, service.resolve_context(current_user.id, project.id))
            for project in page_projects
        ]
        next_cursor = str(limit) if len(accessible_projects) > limit else None
        return {
            "items": items,
            "pagination": {
                "limit": limit,
                "next_cursor": next_cursor,
                "has_more": next_cursor is not None,
            },
        }

    @app.get("/projects/{project_id}/context")
    async def project_context(
        context: Annotated[RequestContext, Depends(get_project_context)],
    ) -> dict[str, object]:
        return {"context": context.to_public_dict()}

    return app


app = create_app()

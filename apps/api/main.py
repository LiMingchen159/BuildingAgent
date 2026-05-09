"""FastAPI composition root for the BuildingAgent API."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.responses import Response

from buildingagent.core.errors import ApiError, REQUEST_ID_HEADER, api_error_response

REQUEST_ID_SCOPE_KEY = "request_id"


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


def create_app() -> FastAPI:
    """Create and configure the FastAPI app."""

    app = FastAPI(title="BuildingAgent API")

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

    return app


app = create_app()

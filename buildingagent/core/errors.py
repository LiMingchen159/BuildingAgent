"""Structured API error primitives shared by HTTP endpoints."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi.responses import JSONResponse

REQUEST_ID_HEADER = "X-Request-ID"


@dataclass(frozen=True)
class ApiError(Exception):
    """A safe, machine-readable API error.

    The public representation intentionally contains only stable caller-facing
    fields: no stack traces, bearer tokens, file paths, or exception reprs.
    """

    code: str
    message: str
    status_code: int = 400
    details: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.details is None:  # type: ignore[comparison-overlap]
            object.__setattr__(self, "details", {})


def api_error_body(error: ApiError, request_id: str) -> dict[str, Any]:
    """Return the canonical structured error body."""

    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "details": dict(error.details),
            "requestId": request_id,
        }
    }


def api_error_response(error: ApiError, request_id: str) -> JSONResponse:
    """Render an ApiError as a FastAPI/Starlette response."""

    return JSONResponse(
        status_code=error.status_code,
        content=api_error_body(error, request_id),
        headers={REQUEST_ID_HEADER: request_id},
    )

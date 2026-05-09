from __future__ import annotations

import sqlite3
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .api import API_PREFIX, router, startup

app = FastAPI(title="BuildingAgent Backend", version="0.1.0")
app.include_router(router, prefix=API_PREFIX)


def on_startup() -> None:
    startup()


app.on_event("startup")(on_startup)


def _request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if existing:
        return existing
    incoming = request.headers.get("x-request-id")
    rid = incoming if incoming and len(incoming) <= 80 else f"req_{uuid.uuid4().hex}"
    request.state.request_id = rid
    return rid


def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail, headers=exc.headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error", "message": str(exc.detail or "Request failed"), "requestId": _request_id(request)}},
        headers=exc.headers,
    )


def sqlite_exception_handler(request: Request, exc: sqlite3.Error):
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "database_unavailable", "message": "Database operation failed", "requestId": _request_id(request)}},
    )


def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Internal server error", "requestId": _request_id(request)}},
    )


app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(sqlite3.Error, sqlite_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.responses import FileResponse, JSONResponse

from flowent_api.settings_store import (
    LocalSettingsStoreError,
    read_local_settings_snapshot,
    save_local_settings_snapshot,
)

INVALID_SETTINGS_MESSAGE = (
    "Settings could not be saved because the data format is not valid."
)


def error_message_from(error: Exception, fallback: str) -> str:
    if isinstance(error, LocalSettingsStoreError):
        return error.user_message
    return fallback


def unwrap_settings_snapshot(value: Any) -> Any:
    if isinstance(value, dict) and "settings" in value:
        return value["settings"]
    return value


def frontend_static_directory() -> Path:
    configured_directory = os.environ.get("FLOWENT_STATIC_DIR")
    if configured_directory:
        return Path(configured_directory)
    return Path(__file__).resolve().parents[3] / "frontend" / "dist"


def create_app() -> FastAPI:
    app = FastAPI(title="Flowent")
    app.state.static_directory = frontend_static_directory()

    @app.get("/api/settings")
    async def get_settings() -> JSONResponse:
        try:
            result = read_local_settings_snapshot()
            if result["status"] == "missing":
                return JSONResponse({"saved": False, "settings": None})
            return JSONResponse({"saved": True, "settings": result["settings"]})
        except Exception as error:
            return JSONResponse(
                {
                    "error": error_message_from(
                        error,
                        "Saved settings could not be loaded.",
                    )
                },
                status_code=500,
            )

    async def save_settings(request: Request) -> JSONResponse:
        try:
            body = await request.json()
        except Exception:
            return JSONResponse(
                {"error": INVALID_SETTINGS_MESSAGE},
                status_code=400,
            )

        try:
            settings = save_local_settings_snapshot(unwrap_settings_snapshot(body))
            return JSONResponse({"saved": True, "settings": settings})
        except Exception as error:
            status_code = (
                400
                if isinstance(error, LocalSettingsStoreError)
                and error.kind == "invalid-settings"
                else 500
            )
            return JSONResponse(
                {"error": error_message_from(error, INVALID_SETTINGS_MESSAGE)},
                status_code=status_code,
            )

    app.put("/api/settings")(save_settings)
    app.post("/api/settings")(save_settings)

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str) -> Response:
        static_directory = Path(app.state.static_directory).resolve()
        index_file = static_directory / "index.html"

        if not index_file.exists():
            return JSONResponse(
                {"error": "Flowent is not ready to open."},
                status_code=404,
            )

        requested_file = (static_directory / path).resolve()
        if requested_file.is_file() and requested_file.is_relative_to(static_directory):
            return FileResponse(requested_file)

        return FileResponse(index_file)

    return app


app = create_app()

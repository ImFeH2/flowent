from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from flowent.access import AccessControlMiddleware
from flowent.config import Config
from flowent.events import event_bus
from flowent.logging import setup_logging
from flowent.runtime import bootstrap_runtime, shutdown_runtime

config = Config()
setup_logging(config)

DEFAULT_STATIC_DIR = Path(__file__).parent / "static"


def frontend_static_directory() -> Path:
    configured_directory = os.environ.get("FLOWENT_STATIC_DIR")
    if configured_directory:
        return Path(configured_directory)
    repository_frontend_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
    if repository_frontend_dist.is_dir():
        return repository_frontend_dist
    return DEFAULT_STATIC_DIR


@asynccontextmanager
async def lifespan(app: FastAPI):
    from flowent.access import (
        initialize_live_access_signature,
        refresh_live_access_signature,
    )

    loop = asyncio.get_running_loop()
    event_bus.set_loop(loop)

    bootstrap_runtime()
    initialize_live_access_signature()

    stop_event = asyncio.Event()

    async def watch_access_state() -> None:
        while True:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=1.0)
                return
            except TimeoutError:
                if refresh_live_access_signature():
                    await event_bus.close_all(
                        code=4001, reason="Access session updated"
                    )

    access_watch_task = asyncio.create_task(watch_access_state())

    yield

    stop_event.set()
    await access_watch_task
    shutdown_runtime()


def create_app(*, serve_frontend: bool = True) -> FastAPI:
    from flowent.access import ensure_session_signing_secret
    from flowent.settings import get_settings, save_settings

    settings = get_settings()
    if ensure_session_signing_secret(settings):
        save_settings(settings)
    session_secret = (
        config.SESSION_SECRET.strip() or settings.access.session_signing_secret
    )

    app = FastAPI(
        title=config.APP_NAME,
        debug=config.DEBUG,
        lifespan=lifespan,
    )
    app.add_middleware(AccessControlMiddleware)
    app.add_middleware(
        SessionMiddleware,
        secret_key=session_secret,
        session_cookie=config.SESSION_COOKIE_NAME,
        max_age=config.SESSION_MAX_AGE_SECONDS,
        same_site="lax",
        https_only=False,
    )

    from flowent.routes import router

    app.include_router(router)
    static_dir = frontend_static_directory().resolve(strict=False)

    if serve_frontend and static_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=static_dir / "assets"),
            name="assets",
        )

        @app.get("/{path:path}")
        async def spa_fallback(path: str) -> FileResponse:
            file = (static_dir / path).resolve(strict=False)
            if file.is_file() and file.is_relative_to(static_dir):
                return FileResponse(file)
            return FileResponse(static_dir / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, reload=config.DEBUG)

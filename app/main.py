from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.access import AccessControlMiddleware
from app.config import Config
from app.events import event_bus
from app.logging import setup_logging
from app.runtime import bootstrap_runtime, shutdown_runtime

config = Config()
setup_logging(config)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.access import (
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
    from app.access import ensure_session_signing_secret
    from app.settings import get_settings, save_settings

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

    from app.routes import router

    app.include_router(router)

    if serve_frontend and STATIC_DIR.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=STATIC_DIR / "assets"),
            name="assets",
        )

        @app.get("/{path:path}")
        async def spa_fallback(path: str) -> FileResponse:
            file = STATIC_DIR / path
            if file.is_file() and file.is_relative_to(STATIC_DIR):
                return FileResponse(file)
            return FileResponse(STATIC_DIR / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, reload=config.DEBUG)

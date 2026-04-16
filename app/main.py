from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import Config
from app.events import event_bus
from app.logging import setup_logging
from app.runtime import bootstrap_runtime, shutdown_runtime

config = Config()
setup_logging(config)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    event_bus.set_loop(loop)

    bootstrap_runtime()

    yield

    shutdown_runtime()


def create_app(*, serve_frontend: bool = True) -> FastAPI:
    app = FastAPI(
        title=config.APP_NAME,
        debug=config.DEBUG,
        lifespan=lifespan,
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

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from app.config import Config
from app.events import event_bus
from app.logging import setup_logging
from app.registry import registry

config = Config()
setup_logging(config)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    event_bus.set_loop(loop)

    yield

    logger.info("Shutting down — terminating all agents")
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=5.0)
    registry.reset()
    logger.info("All agents terminated")


app = FastAPI(
    title=config.APP_NAME,
    debug=config.DEBUG,
    lifespan=lifespan,
)

from app.routes import router  # noqa: E402

app.include_router(router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, reload=config.DEBUG)

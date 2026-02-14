from __future__ import annotations

import asyncio
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from app.agent import Agent
from app.events import event_bus
from app.logging import setup_logging
from app.models import AgentConfig, Permissions, Role
from app.providers.dynamic import DynamicProvider
from app.registry import registry
from app.settings import Settings

settings = Settings()
setup_logging(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    event_bus.set_loop(loop)

    cwd = os.path.normpath(os.path.abspath(os.getcwd()))

    steward_config = AgentConfig(
        task_prompt="You are the Steward. Wait for human messages and coordinate task execution.",
        role=Role.STEWARD,
        permissions=Permissions(
            allowed_paths=[cwd],
            writable_paths=[cwd],
        ),
        name="Steward",
    )

    provider = DynamicProvider()
    steward = Agent(config=steward_config, provider=provider)
    registry.register(steward)

    steward.start()
    logger.info("Steward started: {}", steward.uuid)

    yield

    logger.info("Shutting down — terminating all agents")
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=5.0)
    registry.reset()
    logger.info("All agents terminated")


app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

from app.router import router  # noqa: E402

app.include_router(router)

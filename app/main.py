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
from app.providers.registry import create_provider
from app.registry import registry
from app.settings import Settings
from app.user_settings import get_user_settings, find_provider

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

    user_settings = get_user_settings()
    model_settings = user_settings.model
    provider_cfg = find_provider(model_settings, model_settings.active_provider)

    if provider_cfg:
        provider = create_provider(
            provider_type=provider_cfg.provider_type,
            api_base_url=provider_cfg.api_base_url,
            api_key=provider_cfg.api_key,
            model=model_settings.active_model,
        )
    else:
        provider = create_provider(
            provider_type="openai",
            api_base_url="https://openrouter.ai/api/v1",
            model=model_settings.active_model,
        )

    steward = Agent(config=steward_config, provider=provider)
    registry.register(steward)

    from app import router as router_module

    router_module.STEWARD_ID = steward.uuid

    steward.start()
    logger.info("Steward started: {}", steward.uuid)
    logger.debug("Settings: {}", settings)

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

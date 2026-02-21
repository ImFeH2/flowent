from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.config import Config
from app.events import event_bus
from app.logging import setup_logging
from app.registry import registry

config = Config()
setup_logging(config)

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    event_bus.set_loop(loop)

    from app.agent import Agent
    from app.models import Event, EventType, NodeConfig, NodeType

    steward_cfg = NodeConfig(
        node_type=NodeType.STEWARD,
        tools=["send", "idle", "todo", "list_connections", "exit"],
    )
    steward = Agent(steward_cfg, uuid="steward")
    registry.register(steward)
    steward.start()

    conductor_cfg = NodeConfig(
        node_type=NodeType.CONDUCTOR,
        tools=[
            "spawn",
            "connect",
            "send",
            "idle",
            "todo",
            "list_connections",
            "exit",
        ],
    )
    conductor = Agent(conductor_cfg, uuid="conductor")
    registry.register(conductor)
    conductor.start()

    steward.add_connection("conductor")
    conductor.add_connection("steward")

    event_bus.emit(
        Event(
            type=EventType.NODE_CONNECTED,
            agent_id="steward",
            data={"a": "steward", "b": "conductor"},
        )
    )

    logger.info("Steward and Conductor started, initial connection established")

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

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str) -> FileResponse:
        file = STATIC_DIR / path
        if file.is_file() and file.is_relative_to(STATIC_DIR):
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, reload=config.DEBUG)

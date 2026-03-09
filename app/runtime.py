from __future__ import annotations

from loguru import logger

from app.events import event_bus
from app.registry import registry

SYSTEM_NODE_TIMEOUT = 5.0


def bootstrap_runtime() -> None:
    from app.agent import Agent
    from app.models import Event, EventType, NodeConfig, NodeType
    from app.settings import ensure_builtin_roles, get_settings, save_settings

    settings = get_settings()
    if ensure_builtin_roles(settings):
        save_settings(settings)

    steward = Agent(
        NodeConfig(
            node_type=NodeType.STEWARD,
            tools=[],
        ),
        uuid="steward",
    )
    registry.register(steward)
    steward.start()

    conductor = Agent(
        NodeConfig(
            node_type=NodeType.CONDUCTOR,
            tools=[
                "spawn",
                "connect",
                "list_roles",
            ],
        ),
        uuid="conductor",
    )
    registry.register(conductor)
    conductor.start()

    steward.add_connection(conductor.uuid)
    conductor.add_connection(steward.uuid)

    event_bus.emit(
        Event(
            type=EventType.NODE_CONNECTED,
            agent_id=steward.uuid,
            data={"a": steward.uuid, "b": conductor.uuid},
        )
    )

    logger.info("Steward and Conductor started, initial connection established")


def shutdown_runtime(timeout: float = SYSTEM_NODE_TIMEOUT) -> None:
    logger.info("Shutting down — terminating all agents")
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=timeout)
    registry.reset()
    logger.info("All agents terminated")

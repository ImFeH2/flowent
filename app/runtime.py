from __future__ import annotations

from loguru import logger

from app.events import event_bus
from app.registry import registry

SYSTEM_NODE_TIMEOUT = 5.0


def bootstrap_runtime() -> None:
    from app.agent import Agent, _get_tool_registry
    from app.models import Event, EventType, NodeConfig, NodeType
    from app.settings import (
        CONDUCTOR_ROLE_NAME,
        ensure_builtin_roles,
        get_settings,
        save_settings,
    )

    settings = get_settings()
    if ensure_builtin_roles(settings):
        save_settings(settings)
    root_boundary = settings.root_boundary
    conductor_tools = [tool.name for tool in _get_tool_registry().list_tools()]

    steward = Agent(
        NodeConfig(
            node_type=NodeType.STEWARD,
            tools=[],
            write_dirs=list(root_boundary.write_dirs),
            allow_network=root_boundary.allow_network,
        ),
        uuid="steward",
    )
    registry.register(steward)
    steward.start()

    conductor = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name=CONDUCTOR_ROLE_NAME,
            tools=conductor_tools,
            write_dirs=list(root_boundary.write_dirs),
            allow_network=root_boundary.allow_network,
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

    logger.info(
        "Steward and Conductor started, initial connection established (conductor_role={})",
        conductor.config.role_name,
    )


def shutdown_runtime(timeout: float = SYSTEM_NODE_TIMEOUT) -> None:
    logger.info("Shutting down — terminating all agents")
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=timeout)
    registry.reset()
    logger.info("All agents terminated")

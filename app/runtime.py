from __future__ import annotations

from loguru import logger

from app.registry import registry

SYSTEM_NODE_TIMEOUT = 5.0


def bootstrap_runtime() -> None:
    from app.agent import Agent
    from app.models import ASSISTANT_NODE_ID, NodeConfig, NodeType
    from app.settings import ensure_builtin_roles, get_settings, save_settings

    settings = get_settings()
    if ensure_builtin_roles(settings):
        save_settings(settings)

    assistant = Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name=settings.assistant.role_name,
            name="Assistant",
            tools=[
                "create_root",
                "manage_providers",
                "manage_roles",
                "manage_settings",
                "manage_prompts",
            ],
            write_dirs=[],
            allow_network=True,
        ),
        uuid=ASSISTANT_NODE_ID,
    )
    registry.register(assistant)
    assistant.start()
    logger.info("Assistant started with role {}", settings.assistant.role_name)


def shutdown_runtime(timeout: float = SYSTEM_NODE_TIMEOUT) -> None:
    logger.info("Shutting down — terminating all agents")
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=timeout)
    registry.reset()
    logger.info("All agents terminated")

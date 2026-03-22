from __future__ import annotations

import os
import threading
from typing import TYPE_CHECKING

from loguru import logger

from app.registry import registry

if TYPE_CHECKING:
    from app.channels.telegram import TelegramChannel

SYSTEM_NODE_TIMEOUT = 5.0
_telegram_channel: TelegramChannel | None = None
_telegram_channel_lock = threading.Lock()


def _stop_telegram_channel() -> None:
    global _telegram_channel
    with _telegram_channel_lock:
        channel = _telegram_channel
        _telegram_channel = None

    if channel is not None:
        channel.stop()


def restart_telegram_channel() -> None:
    from app.channels.telegram import TelegramChannel
    from app.settings import get_settings

    _stop_telegram_channel()

    settings = get_settings()
    if not settings.telegram.bot_token.strip():
        return

    channel = TelegramChannel()
    channel.start()
    with _telegram_channel_lock:
        global _telegram_channel
        _telegram_channel = channel


def bootstrap_runtime() -> None:
    from app.agent import Agent
    from app.models import NodeConfig, NodeType
    from app.settings import (
        STEWARD_ROLE_INCLUDED_TOOLS,
        ensure_builtin_roles,
        find_role,
        get_settings,
        save_settings,
    )

    working_dir = os.getcwd()
    settings = get_settings()
    if ensure_builtin_roles(settings):
        save_settings(settings)
    assistant_role = find_role(settings, settings.assistant.role_name)
    assistant_tools = (
        list(assistant_role.included_tools)
        if assistant_role is not None
        else list(STEWARD_ROLE_INCLUDED_TOOLS)
    )

    assistant = Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name=settings.assistant.role_name,
            name="Assistant",
            tools=assistant_tools,
            write_dirs=[working_dir],
            allow_network=True,
            parent_id="human",
        ),
    )
    registry.register(assistant)
    assistant.start()
    logger.info("Assistant started with role {}", settings.assistant.role_name)

    if settings.telegram.bot_token.strip():
        restart_telegram_channel()


def shutdown_runtime(timeout: float = SYSTEM_NODE_TIMEOUT) -> None:
    logger.info("Shutting down — terminating all agents")
    _stop_telegram_channel()
    for agent in registry.get_all():
        agent.terminate_and_wait(timeout=timeout)
    registry.reset()
    logger.info("All agents terminated")

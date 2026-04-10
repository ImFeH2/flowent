from __future__ import annotations

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
    from app.graph_runtime import connect_nodes
    from app.graph_service import ensure_tab_leaders
    from app.models import AgentState, NodeConfig, NodeType, StateEntry
    from app.settings import (
        STEWARD_ROLE_INCLUDED_TOOLS,
        ensure_builtin_roles,
        find_role,
        get_settings,
        save_settings,
    )
    from app.workspace_store import workspace_store

    workspace_store.reset_cache()
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
            write_dirs=list(settings.assistant.write_dirs),
            allow_network=settings.assistant.allow_network,
        ),
    )
    registry.register(assistant)
    assistant.start()
    logger.info("Assistant started with role {}", settings.assistant.role_name)

    ensure_tab_leaders()

    restored_node_ids: set[str] = set()
    for record in workspace_store.list_node_records():
        if record.state == AgentState.TERMINATED:
            continue
        node = Agent(
            NodeConfig(
                node_type=record.config.node_type,
                role_name=record.config.role_name,
                tab_id=record.config.tab_id,
                name=record.config.name,
                tools=list(record.config.tools),
                write_dirs=list(record.config.write_dirs),
                allow_network=record.config.allow_network,
            ),
            uuid=record.id,
        )
        node.history = list(record.history)
        if not any(isinstance(entry, StateEntry) for entry in node.history):
            node.history.insert(
                0,
                StateEntry(state=record.state.value, reason="restored"),
            )
        if record.state in {
            AgentState.INITIALIZING,
            AgentState.RUNNING,
        }:
            node.history.append(
                StateEntry(state=AgentState.IDLE.value, reason="restored")
            )
        node.todos = list(record.todos)
        node.prime_runtime_state(
            AgentState.ERROR if record.state == AgentState.ERROR else AgentState.IDLE
        )
        registry.register(node)
        node.start()
        restored_node_ids.add(node.uuid)

    for edge in workspace_store.list_edges():
        if edge.from_node_id not in restored_node_ids:
            continue
        if edge.to_node_id not in restored_node_ids:
            continue
        try:
            connect_nodes(edge.from_node_id, edge.to_node_id)
        except ValueError:
            logger.warning(
                "Skipping invalid restored edge {} -> {}",
                edge.from_node_id[:8],
                edge.to_node_id[:8],
            )

    if settings.telegram.bot_token.strip():
        restart_telegram_channel()


def shutdown_runtime(timeout: float = SYSTEM_NODE_TIMEOUT) -> None:
    logger.info("Shutting down runtime")
    _stop_telegram_channel()
    persistent_agents = []
    for agent in registry.get_all():
        if agent.config.tab_id:
            agent.request_process_exit()
            persistent_agents.append(agent)
            continue
        agent.terminate_and_wait(timeout=timeout)
    for agent in persistent_agents:
        agent.wait_for_termination(timeout=timeout)
    registry.reset()
    logger.info("Runtime shutdown complete")

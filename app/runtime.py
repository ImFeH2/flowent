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
    from app.graph_service import ensure_tab_leaders, list_tab_edges
    from app.models import AgentState, NodeConfig, NodeType, StateEntry
    from app.settings import (
        STEWARD_ROLE_INCLUDED_TOOLS,
        ensure_builtin_roles,
        find_role,
        get_settings,
        save_settings,
    )
    from app.stats_service import stats_store
    from app.workspace_store import workspace_store

    workspace_store.reset_cache()
    stats_store.reset()
    settings = get_settings()
    if ensure_builtin_roles(settings):
        save_settings(settings)
    assistant_role = find_role(settings, settings.assistant.role_name)
    assistant_tools = (
        list(assistant_role.included_tools)
        if assistant_role is not None
        else list(STEWARD_ROLE_INCLUDED_TOOLS)
    )

    assistant_record = next(
        (
            record
            for record in workspace_store.list_node_records()
            if record.config.node_type == NodeType.ASSISTANT
            and record.state != AgentState.TERMINATED
        ),
        None,
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
        uuid=assistant_record.id if assistant_record is not None else None,
    )
    if assistant_record is not None:
        assistant.history = list(assistant_record.history)
        assistant._set_execution_context(
            summary=assistant_record.execution_context_summary,
            history_cutoff=assistant_record.execution_context_history_cutoff,
        )
        if not any(isinstance(entry, StateEntry) for entry in assistant.history):
            assistant.history.insert(
                0,
                StateEntry(state=assistant_record.state.value, reason="restored"),
            )
        if assistant_record.state in {
            AgentState.INITIALIZING,
            AgentState.IDLE,
            AgentState.RUNNING,
            AgentState.SLEEPING,
        }:
            assistant.history.append(
                StateEntry(state=AgentState.IDLE.value, reason="restored")
            )
        assistant.todos = list(assistant_record.todos)
        assistant.prime_runtime_state(
            AgentState.ERROR
            if assistant_record.state == AgentState.ERROR
            else AgentState.IDLE
        )
    registry.register(assistant)
    assistant.start()
    logger.info("Assistant started with role {}", settings.assistant.role_name)

    ensure_tab_leaders()

    restored_node_ids: set[str] = set()
    for record in workspace_store.list_node_records():
        if record.config.node_type == NodeType.ASSISTANT:
            continue
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
                blueprint_slot_id=record.config.blueprint_slot_id,
            ),
            uuid=record.id,
        )
        node.history = list(record.history)
        node._set_execution_context(
            summary=record.execution_context_summary,
            history_cutoff=record.execution_context_history_cutoff,
        )
        if not any(isinstance(entry, StateEntry) for entry in node.history):
            node.history.insert(
                0,
                StateEntry(state=record.state.value, reason="restored"),
            )
        if record.state in {
            AgentState.INITIALIZING,
            AgentState.RUNNING,
            AgentState.SLEEPING,
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

    for tab in workspace_store.list_tabs():
        for edge in list_tab_edges(tab.id):
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
    from app.models import NodeType

    logger.info("Shutting down runtime")
    _stop_telegram_channel()
    persistent_agents = []
    for agent in registry.get_all():
        if agent.node_type == NodeType.ASSISTANT or agent.config.tab_id:
            agent.request_process_exit()
            persistent_agents.append(agent)
            continue
        agent.terminate_and_wait(timeout=timeout)
    for agent in persistent_agents:
        agent.wait_for_termination(timeout=timeout)
    registry.reset()
    logger.info("Runtime shutdown complete")

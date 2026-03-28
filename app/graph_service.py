from __future__ import annotations

import time
import uuid

from app.events import event_bus
from app.graph_runtime import connect_nodes
from app.models import (
    AgentState,
    Event,
    EventType,
    GraphEdge,
    GraphNodeRecord,
    NodeConfig,
    NodePosition,
    NodeType,
    Tab,
)
from app.registry import registry
from app.runtime import SYSTEM_NODE_TIMEOUT
from app.tools import MINIMUM_TOOLS
from app.workspace_store import workspace_store


def create_tab(*, title: str, goal: str = "") -> Tab:
    tab = Tab(
        id=str(uuid.uuid4()),
        title=title.strip(),
        goal=goal.strip(),
    )
    workspace_store.upsert_tab(tab)
    event_bus.emit(
        Event(
            type=EventType.TAB_CREATED,
            agent_id="assistant",
            data=tab.serialize(),
        )
    )
    return tab


def delete_tab(
    *,
    tab_id: str,
    timeout: float = SYSTEM_NODE_TIMEOUT,
) -> tuple[dict[str, object] | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    stored_nodes = list_tab_nodes(tab_id)
    stored_edges = list_tab_edges(tab_id)
    live_nodes = [node for node in registry.get_all() if node.config.tab_id == tab_id]

    removed_node_ids = list(
        dict.fromkeys(
            [*(node.id for node in stored_nodes), *(node.uuid for node in live_nodes)]
        )
    )
    removed_edge_ids = [edge.id for edge in stored_edges]

    for node in live_nodes:
        node.request_termination("tab_deleted")

    lingering_node_ids: list[str] = []
    for node in live_nodes:
        if not node.wait_for_termination(timeout=timeout):
            lingering_node_ids.append(node.uuid)

    if lingering_node_ids:
        return (
            None,
            "Failed to delete tab because some nodes did not terminate: "
            + ", ".join(node_id[:8] for node_id in lingering_node_ids),
        )

    workspace_store.delete_tab(tab_id)
    payload = {
        **tab.serialize(),
        "removed_node_ids": removed_node_ids,
        "removed_edge_ids": removed_edge_ids,
    }
    event_bus.emit(
        Event(
            type=EventType.TAB_DELETED,
            agent_id="assistant",
            data=payload,
        )
    )
    return payload, None


def build_node_config(
    *,
    role_name: str,
    tab_id: str,
    name: str | None = None,
    tools: list[str] | None = None,
    write_dirs: list[str] | None = None,
    allow_network: bool = False,
) -> tuple[NodeConfig | None, str | None]:
    from app.settings import find_role, get_settings

    settings = get_settings()
    role = find_role(settings, role_name.strip())
    if role is None:
        return None, f"Role '{role_name.strip()}' not found"

    requested_tools = tools or []
    if not all(isinstance(item, str) for item in requested_tools):
        return None, "tools must be an array of strings"
    requested_write_dirs = write_dirs or []
    if not all(isinstance(item, str) for item in requested_write_dirs):
        return None, "write_dirs must be an array of strings"

    excluded_tools = set(role.excluded_tools)
    final_tools: list[str] = []
    seen_tools: set[str] = set()
    for tool_name in [*MINIMUM_TOOLS, *role.included_tools, *requested_tools]:
        if tool_name in seen_tools:
            continue
        if tool_name in excluded_tools and tool_name not in MINIMUM_TOOLS:
            continue
        final_tools.append(tool_name)
        seen_tools.add(tool_name)

    return (
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role.name,
            tab_id=tab_id,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            tools=final_tools,
            write_dirs=[path for path in requested_write_dirs if path.strip()],
            allow_network=allow_network,
        ),
        None,
    )


def create_agent_node(
    *,
    role_name: str,
    tab_id: str,
    name: str | None = None,
    tools: list[str] | None = None,
    write_dirs: list[str] | None = None,
    allow_network: bool = False,
    position: NodePosition | None = None,
) -> tuple[GraphNodeRecord | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    config, error = build_node_config(
        role_name=role_name,
        tab_id=tab_id,
        name=name,
        tools=tools,
        write_dirs=write_dirs,
        allow_network=allow_network,
    )
    if error is not None or config is None:
        return None, error
    if config.name:
        for existing in workspace_store.list_node_records():
            if existing.config.name == config.name:
                return None, f"Node name '{config.name}' already exists"

    node_id = str(uuid.uuid4())
    record = GraphNodeRecord(
        id=node_id,
        config=config,
        state=AgentState.INITIALIZING,
    )
    return _finalize_agent_creation(record=record, position=position)


def _finalize_agent_creation(
    *,
    record: GraphNodeRecord,
    position: NodePosition | None,
) -> tuple[GraphNodeRecord | None, str | None]:
    from app.agent import Agent

    record.position = position
    workspace_store.upsert_node_record(record)
    node = Agent(record.config, uuid=record.id)
    registry.register(node)
    node.start()
    return workspace_store.get_node_record(record.id), None


def create_edge(
    *,
    from_node_id: str,
    to_node_id: str,
) -> tuple[GraphEdge | None, str | None]:
    source_record = workspace_store.get_node_record(from_node_id)
    target_record = workspace_store.get_node_record(to_node_id)
    if source_record is None:
        return None, f"Node '{from_node_id}' not found"
    if target_record is None:
        return None, f"Node '{to_node_id}' not found"
    if (
        not source_record.config.tab_id
        or source_record.config.tab_id != target_record.config.tab_id
    ):
        return None, "Both nodes must belong to the same tab"

    for edge in workspace_store.list_edges(source_record.config.tab_id):
        if edge.from_node_id == from_node_id and edge.to_node_id == to_node_id:
            return edge, None

    edge = GraphEdge(
        id=str(uuid.uuid4()),
        tab_id=source_record.config.tab_id,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
    )
    workspace_store.upsert_edge(edge)

    source = registry.get(from_node_id)
    target = registry.get(to_node_id)
    if source is not None and target is not None:
        connect_nodes(from_node_id, to_node_id)
    return edge, None


def update_node_position(
    *,
    node_id: str,
    x: float,
    y: float,
) -> tuple[GraphNodeRecord | None, str | None]:
    record = workspace_store.get_node_record(node_id)
    if record is None:
        return None, f"Node '{node_id}' not found"
    record.position = NodePosition(x=x, y=y)
    record.updated_at = time.time()
    workspace_store.upsert_node_record(record)
    return record, None


def dispatch_node_message(
    *,
    node_id: str,
    content: str,
    from_id: str = "human",
) -> str | None:
    from app.models import Message

    target = registry.get(node_id)
    if target is None:
        return f"Node '{node_id}' is not active"
    target.enqueue_message(
        Message(
            from_id=from_id,
            to_id=node_id,
            content=content,
            message_id=str(uuid.uuid4()),
        )
    )
    return None


def list_tab_nodes(tab_id: str) -> list[GraphNodeRecord]:
    return workspace_store.list_node_records(tab_id)


def list_tab_edges(tab_id: str) -> list[GraphEdge]:
    return workspace_store.list_edges(tab_id)

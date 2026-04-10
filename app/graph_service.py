from __future__ import annotations

import uuid

from app import settings as settings_module
from app.events import event_bus
from app.graph_runtime import connect_nodes
from app.models import (
    AgentState,
    Event,
    EventType,
    GraphEdge,
    GraphNodeRecord,
    NodeConfig,
    NodeType,
    Tab,
)
from app.registry import registry
from app.runtime import SYSTEM_NODE_TIMEOUT
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    STEWARD_ROLE_INCLUDED_TOOLS,
    STEWARD_ROLE_NAME,
    find_role,
)
from app.tools import MINIMUM_TOOLS
from app.workspace_store import workspace_store

LEADER_NODE_NAME = "Leader"


def build_tools_for_role(
    role_name: str,
    *,
    requested_tools: list[str] | None = None,
    settings=None,
) -> list[str]:
    current_settings = settings or settings_module.get_settings()
    normalized_role_name = role_name.strip()
    role = find_role(current_settings, normalized_role_name)
    if role is None:
        if normalized_role_name == CONDUCTOR_ROLE_NAME:
            included_tools = list(CONDUCTOR_ROLE_INCLUDED_TOOLS)
        elif normalized_role_name == STEWARD_ROLE_NAME:
            included_tools = list(STEWARD_ROLE_INCLUDED_TOOLS)
        else:
            included_tools = []
        excluded_tools: set[str] = set()
    else:
        included_tools = list(role.included_tools)
        excluded_tools = set(role.excluded_tools)

    final_tools: list[str] = []
    seen_tools: set[str] = set()
    for tool_name in [*MINIMUM_TOOLS, *included_tools, *(requested_tools or [])]:
        if tool_name in seen_tools:
            continue
        if tool_name in excluded_tools and tool_name not in MINIMUM_TOOLS:
            continue
        final_tools.append(tool_name)
        seen_tools.add(tool_name)
    return final_tools


def resolve_leader_role_name(*, settings=None) -> str:
    current_settings = settings or settings_module.get_settings()
    configured_role_name = current_settings.leader.role_name.strip()
    if configured_role_name and find_role(current_settings, configured_role_name):
        return configured_role_name
    return CONDUCTOR_ROLE_NAME


def get_tab_leader_id(tab_id: str) -> str | None:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None
    return tab.leader_id


def is_tab_leader(*, node_id: str, tab_id: str | None = None) -> bool:
    resolved_tab_id = tab_id
    if resolved_tab_id is None:
        record = workspace_store.get_node_record(node_id)
        if record is not None:
            resolved_tab_id = record.config.tab_id
        else:
            live_node = registry.get(node_id)
            resolved_tab_id = live_node.config.tab_id if live_node is not None else None
    if not resolved_tab_id:
        return False
    return get_tab_leader_id(resolved_tab_id) == node_id


def serialize_tab_summary(tab: Tab) -> dict[str, object]:
    return {
        **tab.serialize(),
        "node_count": len(list_tab_nodes(tab.id)),
        "edge_count": len(list_tab_edges(tab.id)),
    }


def _build_leader_record(
    *,
    tab_id: str,
    leader_id: str,
    settings,
) -> GraphNodeRecord:
    role_name = resolve_leader_role_name(settings=settings)
    return GraphNodeRecord(
        id=leader_id,
        config=NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role_name,
            tab_id=tab_id,
            name=LEADER_NODE_NAME,
            tools=build_tools_for_role(role_name, settings=settings),
            write_dirs=[],
            allow_network=False,
        ),
        state=AgentState.INITIALIZING,
    )


def _sync_leader_record(
    *,
    tab_id: str,
    record: GraphNodeRecord,
    settings,
) -> bool:
    role_name = resolve_leader_role_name(settings=settings)
    tools = build_tools_for_role(role_name, settings=settings)
    changed = False
    if record.config.node_type != NodeType.AGENT:
        record.config.node_type = NodeType.AGENT
        changed = True
    if record.config.tab_id != tab_id:
        record.config.tab_id = tab_id
        changed = True
    if record.config.role_name != role_name:
        record.config.role_name = role_name
        changed = True
    if record.config.name != LEADER_NODE_NAME:
        record.config.name = LEADER_NODE_NAME
        changed = True
    if record.config.tools != tools:
        record.config.tools = tools
        changed = True
    if record.config.write_dirs:
        record.config.write_dirs = []
        changed = True
    if record.config.allow_network:
        record.config.allow_network = False
        changed = True
    return changed


def _start_persisted_agent(
    *,
    record: GraphNodeRecord,
) -> tuple[GraphNodeRecord | None, str | None]:
    from app.agent import Agent

    node = Agent(record.config, uuid=record.id)
    registry.register(node)
    node.start()
    return workspace_store.get_node_record(record.id), None


def ensure_tab_leaders(*, start_nodes: bool = False) -> bool:
    settings = settings_module.get_settings()
    changed = False
    should_start_nodes = start_nodes and bool(registry.get_all())

    for tab in workspace_store.list_tabs():
        tab_nodes = list_tab_nodes(tab.id)
        leader_record: GraphNodeRecord | None = None

        if tab.leader_id:
            current_leader = workspace_store.get_node_record(tab.leader_id)
            if (
                current_leader is not None
                and current_leader.config.tab_id == tab.id
                and current_leader.state != AgentState.TERMINATED
            ):
                leader_record = current_leader
            elif (
                current_leader is not None
                and current_leader.config.tab_id == tab.id
                and current_leader.state == AgentState.TERMINATED
            ):
                workspace_store.delete_node_record(current_leader.id)
                changed = True

        if leader_record is None:
            conductor_candidates = sorted(
                (
                    node
                    for node in tab_nodes
                    if node.state != AgentState.TERMINATED
                    and node.config.role_name == CONDUCTOR_ROLE_NAME
                ),
                key=lambda node: (node.created_at, node.id),
            )
            if conductor_candidates:
                leader_record = conductor_candidates[0]
            else:
                leader_record = _build_leader_record(
                    tab_id=tab.id,
                    leader_id=str(uuid.uuid4()),
                    settings=settings,
                )
                workspace_store.upsert_node_record(leader_record)
                changed = True

        if tab.leader_id != leader_record.id:
            tab.leader_id = leader_record.id
            workspace_store.upsert_tab(tab)
            changed = True

        if _sync_leader_record(tab_id=tab.id, record=leader_record, settings=settings):
            workspace_store.upsert_node_record(leader_record)
            changed = True

        if should_start_nodes and registry.get(leader_record.id) is None:
            _start_persisted_agent(record=leader_record)

    return changed


def sync_assistant_role(*, reason: str) -> None:
    assistant = registry.get_assistant()
    if assistant is None:
        return
    settings = settings_module.get_settings()
    assistant.config.role_name = settings.assistant.role_name
    assistant.config.tools = build_tools_for_role(
        settings.assistant.role_name,
        settings=settings,
    )
    assistant._sync_system_prompt_entry()
    assistant.set_state(
        assistant.state,
        reason,
        force_emit=True,
    )


def sync_tab_leaders(*, reason: str) -> None:
    ensure_tab_leaders()
    settings = settings_module.get_settings()
    for tab in workspace_store.list_tabs():
        if not tab.leader_id:
            continue
        record = workspace_store.get_node_record(tab.leader_id)
        if record is None:
            continue
        if _sync_leader_record(tab_id=tab.id, record=record, settings=settings):
            workspace_store.upsert_node_record(record)
        live_node = registry.get(record.id)
        if live_node is None:
            continue
        live_node.config.role_name = record.config.role_name
        live_node.config.name = record.config.name
        live_node.config.tools = list(record.config.tools)
        live_node.config.write_dirs = list(record.config.write_dirs)
        live_node.config.allow_network = record.config.allow_network
        live_node._sync_system_prompt_entry()
        live_node.set_state(
            live_node.state,
            reason,
            force_emit=True,
        )


def create_tab(
    *,
    title: str,
    goal: str = "",
) -> Tab:
    settings = settings_module.get_settings()
    leader_id = str(uuid.uuid4())
    tab = Tab(
        id=str(uuid.uuid4()),
        title=title.strip(),
        goal=goal.strip(),
        leader_id=leader_id,
    )
    workspace_store.upsert_tab(tab)
    leader_record = _build_leader_record(
        tab_id=tab.id,
        leader_id=leader_id,
        settings=settings,
    )
    workspace_store.upsert_node_record(leader_record)
    if registry.get_all():
        _start_persisted_agent(record=leader_record)
    event_bus.emit(
        Event(
            type=EventType.TAB_CREATED,
            agent_id="assistant",
            data=serialize_tab_summary(tab),
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
    settings = settings_module.get_settings()
    role = find_role(settings, role_name.strip())
    if role is None:
        return None, f"Role '{role_name.strip()}' not found"

    requested_tools = tools or []
    if not all(isinstance(item, str) for item in requested_tools):
        return None, "tools must be an array of strings"
    requested_write_dirs = write_dirs or []
    if not all(isinstance(item, str) for item in requested_write_dirs):
        return None, "write_dirs must be an array of strings"

    return (
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role.name,
            tab_id=tab_id,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            tools=build_tools_for_role(
                role.name,
                requested_tools=requested_tools,
                settings=settings,
            ),
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
    if config.role_name == CONDUCTOR_ROLE_NAME:
        return None, f"Role '{CONDUCTOR_ROLE_NAME}' is reserved for a tab Leader"
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
    return _finalize_agent_creation(record=record)


def _finalize_agent_creation(
    *,
    record: GraphNodeRecord,
) -> tuple[GraphNodeRecord | None, str | None]:
    workspace_store.upsert_node_record(record)
    return _start_persisted_agent(record=record)


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

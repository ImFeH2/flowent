from __future__ import annotations

import uuid
from copy import deepcopy

from app import settings as settings_module
from app.events import event_bus
from app.models import (
    AgentState,
    EdgeKind,
    Event,
    EventType,
    GraphEdge,
    GraphNodeRecord,
    Message,
    NodeConfig,
    NodeType,
    PortDirection,
    ReceivedMessage,
    Tab,
    WorkflowDefinition,
    WorkflowNodeDefinition,
    WorkflowNodeKind,
    WorkflowPort,
)
from app.registry import registry
from app.runtime import SYSTEM_NODE_TIMEOUT
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    DESIGNER_ROLE_INCLUDED_TOOLS,
    DESIGNER_ROLE_NAME,
    STEWARD_ROLE_INCLUDED_TOOLS,
    STEWARD_ROLE_NAME,
    build_assistant_write_dirs,
    find_role,
    resolve_path,
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
        elif normalized_role_name == DESIGNER_ROLE_NAME:
            included_tools = list(DESIGNER_ROLE_INCLUDED_TOOLS)
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


def build_assistant_tools(*, settings=None) -> list[str]:
    current_settings = settings or settings_module.get_settings()
    assistant_tools = build_tools_for_role(
        current_settings.assistant.role_name,
        settings=current_settings,
    )
    final_tools: list[str] = []
    seen_tools: set[str] = set()
    for tool_name in [
        *MINIMUM_TOOLS,
        *STEWARD_ROLE_INCLUDED_TOOLS,
        *assistant_tools,
    ]:
        if tool_name in seen_tools:
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


def _default_ports(
    node_kind: WorkflowNodeKind,
) -> tuple[list[WorkflowPort], list[WorkflowPort]]:
    if node_kind == WorkflowNodeKind.TRIGGER:
        return (
            [],
            [
                WorkflowPort(
                    key="out",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                )
            ],
        )
    if node_kind == WorkflowNodeKind.CODE:
        return (
            [
                WorkflowPort(
                    key="in",
                    direction=PortDirection.INPUT,
                    kind=EdgeKind.CONTROL,
                ),
                WorkflowPort(
                    key="input",
                    direction=PortDirection.INPUT,
                    kind=EdgeKind.DATA,
                    multiple=True,
                ),
            ],
            [
                WorkflowPort(
                    key="out",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                ),
                WorkflowPort(
                    key="output",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.DATA,
                    multiple=True,
                ),
            ],
        )
    if node_kind == WorkflowNodeKind.IF:
        return (
            [
                WorkflowPort(
                    key="in",
                    direction=PortDirection.INPUT,
                    kind=EdgeKind.CONTROL,
                ),
                WorkflowPort(
                    key="condition",
                    direction=PortDirection.INPUT,
                    kind=EdgeKind.DATA,
                ),
            ],
            [
                WorkflowPort(
                    key="true",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                ),
                WorkflowPort(
                    key="false",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                ),
            ],
        )
    if node_kind == WorkflowNodeKind.MERGE:
        return (
            [
                WorkflowPort(
                    key="in",
                    direction=PortDirection.INPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                )
            ],
            [
                WorkflowPort(
                    key="out",
                    direction=PortDirection.OUTPUT,
                    kind=EdgeKind.CONTROL,
                    multiple=True,
                )
            ],
        )
    return (
        [
            WorkflowPort(
                key="in",
                direction=PortDirection.INPUT,
                kind=EdgeKind.CONTROL,
            )
        ],
        [
            WorkflowPort(
                key="out",
                direction=PortDirection.OUTPUT,
                kind=EdgeKind.CONTROL,
                multiple=True,
            )
        ],
    )


def build_workflow_node_definition(
    *,
    node_id: str,
    node_kind: WorkflowNodeKind,
    config: dict[str, object] | None = None,
) -> WorkflowNodeDefinition:
    inputs, outputs = _default_ports(node_kind)
    return WorkflowNodeDefinition(
        id=node_id,
        type=node_kind,
        config=deepcopy(config or {}),
        inputs=inputs,
        outputs=outputs,
    )


def list_workflow_nodes(tab_id: str) -> list[WorkflowNodeDefinition]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return []
    return list(tab.definition.nodes)


def get_workflow_node(tab_id: str, node_id: str) -> WorkflowNodeDefinition | None:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None
    return tab.definition.get_node(node_id)


def _sync_runtime_positions_into_definition(tab: Tab) -> bool:
    changed = False
    for record in workspace_store.list_node_records(tab.id):
        if is_tab_leader(node_id=record.id, tab_id=tab.id):
            continue
        if record.position is None:
            continue
        current = tab.definition.view.positions.get(record.id)
        if current == record.position:
            continue
        tab.definition.view.positions[record.id] = record.position
        changed = True
    return changed


def serialize_tab_summary(tab: Tab) -> dict[str, object]:
    if _sync_runtime_positions_into_definition(tab):
        workspace_store.upsert_tab(tab)
    return {
        "id": tab.id,
        "title": tab.title,
        "leader_id": tab.leader_id,
        "created_at": tab.created_at,
        "updated_at": tab.updated_at,
        "definition": tab.definition.serialize(),
        "node_count": len(tab.definition.nodes),
        "edge_count": len(tab.definition.edges),
    }


def _build_leader_record(
    *,
    tab_id: str,
    leader_id: str,
    settings,
    allow_network: bool = False,
    write_dirs: list[str] | None = None,
) -> GraphNodeRecord:
    role_name = resolve_leader_role_name(settings=settings)
    normalized_write_dirs = build_assistant_write_dirs(
        write_dirs or [],
        field_name="write_dirs",
    )
    return GraphNodeRecord(
        id=leader_id,
        config=NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role_name,
            tab_id=tab_id,
            name=LEADER_NODE_NAME,
            tools=build_tools_for_role(role_name, settings=settings),
            write_dirs=normalized_write_dirs,
            allow_network=allow_network,
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
    assistant.config.tools = build_assistant_tools(settings=settings)
    assistant.config.write_dirs = list(settings.assistant.write_dirs)
    assistant.config.allow_network = settings.assistant.allow_network
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


def _emit_tab_updated(*, tab_id: str, agent_id: str) -> None:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return
    event_bus.emit(
        Event(
            type=EventType.TAB_UPDATED,
            agent_id=agent_id,
            data=serialize_tab_summary(tab),
        )
    )


def _start_tab_runtime(tab_id: str) -> None:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return
    ordered_records = sorted(
        list_tab_nodes(tab_id),
        key=lambda record: (
            record.id != tab.leader_id,
            record.created_at,
            record.id,
        ),
    )
    for record in ordered_records:
        if registry.get(record.id) is not None:
            continue
        _start_persisted_agent(record=record)


def create_tab(
    *,
    title: str,
    allow_network: bool = False,
    write_dirs: list[str] | None = None,
) -> Tab:
    settings = settings_module.get_settings()
    leader_id = str(uuid.uuid4())
    tab = Tab(
        id=str(uuid.uuid4()),
        title=title.strip(),
        leader_id=leader_id,
        definition=WorkflowDefinition(),
    )
    workspace_store.upsert_tab(tab)
    leader_record = _build_leader_record(
        tab_id=tab.id,
        leader_id=leader_id,
        settings=settings,
        allow_network=allow_network,
        write_dirs=write_dirs,
    )
    workspace_store.upsert_node_record(leader_record)
    if registry.get_all():
        _start_tab_runtime(tab.id)
    event_bus.emit(
        Event(
            type=EventType.TAB_CREATED,
            agent_id="assistant",
            data=serialize_tab_summary(tab),
        )
    )
    return tab


def duplicate_tab(
    *,
    tab_id: str,
) -> tuple[Tab | None, str | None]:
    source_tab = workspace_store.get_tab(tab_id)
    if source_tab is None:
        return None, f"Tab '{tab_id}' not found"

    leader_record = (
        workspace_store.get_node_record(source_tab.leader_id)
        if source_tab.leader_id
        else None
    )
    allow_network = leader_record.config.allow_network if leader_record else False
    write_dirs = list(leader_record.config.write_dirs) if leader_record else []
    duplicated_definition = WorkflowDefinition.from_mapping(
        source_tab.definition.serialize()
    )
    id_map: dict[str, str] = {}
    duplicated_nodes: list[WorkflowNodeDefinition] = []

    for node in duplicated_definition.nodes:
        new_node_id = str(uuid.uuid4())
        id_map[node.id] = new_node_id
        duplicated_node = build_workflow_node_definition(
            node_id=new_node_id,
            node_kind=node.type,
            config=node.config,
        )
        duplicated_nodes.append(duplicated_node)

    duplicated_edges = [
        GraphEdge(
            id=str(uuid.uuid4()),
            from_node_id=id_map.get(edge.from_node_id, edge.from_node_id),
            from_port_key=edge.from_port_key,
            to_node_id=id_map.get(edge.to_node_id, edge.to_node_id),
            to_port_key=edge.to_port_key,
            kind=edge.kind,
        )
        for edge in duplicated_definition.edges
    ]
    duplicated_view_positions = {
        id_map.get(node_id, node_id): position
        for node_id, position in duplicated_definition.view.positions.items()
        if id_map.get(node_id, node_id) in id_map.values()
    }

    settings = settings_module.get_settings()
    new_tab = Tab(
        id=str(uuid.uuid4()),
        title=f"{source_tab.title} Copy",
        leader_id=str(uuid.uuid4()),
        definition=WorkflowDefinition(
            version=duplicated_definition.version,
            nodes=duplicated_nodes,
            edges=duplicated_edges,
            view=duplicated_definition.view.__class__(
                positions=duplicated_view_positions
            ),
        ),
    )
    assert new_tab.leader_id is not None
    workspace_store.upsert_tab(new_tab)
    workspace_store.upsert_node_record(
        _build_leader_record(
            tab_id=new_tab.id,
            leader_id=new_tab.leader_id,
            settings=settings,
            allow_network=allow_network,
            write_dirs=write_dirs,
        )
    )

    for node in source_tab.definition.nodes:
        if node.type != WorkflowNodeKind.AGENT:
            continue
        duplicated_node_id = id_map.get(node.id)
        if duplicated_node_id is None:
            continue
        config, error = build_node_config(
            role_name=str(node.config.get("role_name", "")),
            tab_id=new_tab.id,
            name=str(node.config["name"])
            if isinstance(node.config.get("name"), str)
            else None,
        )
        if error is not None or config is None:
            return None, error or "Failed to duplicate workflow"
        workspace_store.upsert_node_record(
            GraphNodeRecord(
                id=duplicated_node_id,
                config=config,
                state=AgentState.INITIALIZING,
                position=duplicated_view_positions.get(duplicated_node_id),
            )
        )

    if registry.get_all():
        _start_tab_runtime(new_tab.id)
    event_bus.emit(
        Event(
            type=EventType.TAB_CREATED,
            agent_id="assistant",
            data=serialize_tab_summary(new_tab),
        )
    )
    return new_tab, None


def _is_path_within_boundary(path: str, boundary_dirs: list[str]) -> bool:
    resolved_path = resolve_path(path)
    return any(
        resolved_path.is_relative_to(resolve_path(boundary_dir))
        for boundary_dir in boundary_dirs
    )


def _clamp_write_dirs_to_boundary(
    write_dirs: list[str],
    boundary_dirs: list[str],
) -> list[str]:
    if not boundary_dirs:
        return []
    return [
        path for path in write_dirs if _is_path_within_boundary(path, boundary_dirs)
    ]


def set_tab_permissions(
    *,
    tab_id: str,
    allow_network: bool | None = None,
    write_dirs: list[str] | None = None,
    caller_allow_network: bool,
    caller_write_dirs: list[str],
    actor_id: str,
) -> tuple[dict[str, object] | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    leader_id = get_tab_leader_id(tab_id)
    if not leader_id:
        return None, f"Tab '{tab_id}' does not have a bound Leader"

    leader_record = workspace_store.get_node_record(leader_id)
    if leader_record is None:
        return None, f"Leader '{leader_id}' not found"

    if allow_network is not None and allow_network and not caller_allow_network:
        return (
            None,
            "allow_network boundary exceeded: caller disallows network access",
        )
    if write_dirs is not None:
        invalid_write_dirs = sorted(
            path
            for path in write_dirs
            if not _is_path_within_boundary(path, caller_write_dirs)
        )
        if invalid_write_dirs:
            return (
                None,
                "write_dirs boundary exceeded: " + ", ".join(invalid_write_dirs),
            )

    next_allow_network = (
        leader_record.config.allow_network if allow_network is None else allow_network
    )
    next_write_dirs = (
        list(leader_record.config.write_dirs)
        if write_dirs is None
        else list(write_dirs)
    )

    changed_node_ids: list[str] = []

    if (
        leader_record.config.allow_network != next_allow_network
        or leader_record.config.write_dirs != next_write_dirs
    ):
        leader_record.config.allow_network = next_allow_network
        leader_record.config.write_dirs = list(next_write_dirs)
        workspace_store.upsert_node_record(leader_record)
        changed_node_ids.append(leader_record.id)

    for record in list_tab_nodes(tab_id):
        if record.id == leader_id:
            continue
        next_node_allow_network = record.config.allow_network and next_allow_network
        next_node_write_dirs = _clamp_write_dirs_to_boundary(
            record.config.write_dirs,
            next_write_dirs,
        )
        if (
            record.config.allow_network == next_node_allow_network
            and record.config.write_dirs == next_node_write_dirs
        ):
            continue
        record.config.allow_network = next_node_allow_network
        record.config.write_dirs = list(next_node_write_dirs)
        workspace_store.upsert_node_record(record)
        changed_node_ids.append(record.id)

        live_node = registry.get(record.id)
        if live_node is not None:
            live_node.config.allow_network = next_node_allow_network
            live_node.config.write_dirs = list(next_node_write_dirs)
            live_node.set_state(
                live_node.state,
                "tab_permissions_updated",
                force_emit=True,
            )

    live_leader = registry.get(leader_id)
    if live_leader is not None:
        live_leader.config.allow_network = next_allow_network
        live_leader.config.write_dirs = list(next_write_dirs)
        live_leader.set_state(
            live_leader.state,
            "tab_permissions_updated",
            force_emit=True,
        )

    updated_tab = workspace_store.get_tab(tab_id)
    if updated_tab is not None:
        event_bus.emit(
            Event(
                type=EventType.TAB_UPDATED,
                agent_id=actor_id,
                data=serialize_tab_summary(updated_tab),
            )
        )

    return (
        {
            "tab_id": tab_id,
            "leader_id": leader_id,
            "allow_network": next_allow_network,
            "write_dirs": list(next_write_dirs),
            "updated_node_ids": changed_node_ids,
        },
        None,
    )


def delete_tab(
    *,
    tab_id: str,
    timeout: float = SYSTEM_NODE_TIMEOUT,
) -> tuple[dict[str, object] | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    stored_nodes = list_tab_nodes(tab_id)
    live_nodes = [node for node in registry.get_all() if node.config.tab_id == tab_id]

    removed_node_ids = list(
        dict.fromkeys(
            [
                *(node.id for node in stored_nodes),
                *(node.uuid for node in live_nodes),
                *(node.id for node in tab.definition.nodes),
            ]
        )
    )
    removed_edge_ids = [edge.id for edge in tab.definition.edges]

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
    try:
        normalized_write_dirs = build_assistant_write_dirs(
            requested_write_dirs,
            field_name="write_dirs",
        )
    except ValueError as exc:
        return None, str(exc)

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
            write_dirs=normalized_write_dirs,
            allow_network=allow_network,
        ),
        None,
    )


def _persist_tab(tab: Tab, *, actor_id: str) -> Tab:
    workspace_store.upsert_tab(tab)
    _emit_tab_updated(tab_id=tab.id, agent_id=actor_id)
    return tab


def create_graph_node(
    *,
    tab_id: str,
    node_type: WorkflowNodeKind,
    config: dict[str, object] | None = None,
    actor_id: str,
) -> tuple[WorkflowNodeDefinition | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"
    node_id = str(uuid.uuid4())
    node = build_workflow_node_definition(
        node_id=node_id,
        node_kind=node_type,
        config=config,
    )
    tab.definition.nodes.append(node)
    _persist_tab(tab, actor_id=actor_id)
    return node, None


def create_agent_node(
    *,
    role_name: str,
    tab_id: str,
    name: str | None = None,
    tools: list[str] | None = None,
    write_dirs: list[str] | None = None,
    allow_network: bool = False,
    creator_node_id: str | None = None,
    connect_to_creator: bool | None = None,
) -> tuple[GraphNodeRecord | None, str | None]:
    del creator_node_id, connect_to_creator
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

    node_id = str(uuid.uuid4())
    record = GraphNodeRecord(
        id=node_id,
        config=config,
        state=AgentState.INITIALIZING,
    )
    workspace_store.upsert_node_record(record)
    tab.definition.nodes.append(
        build_workflow_node_definition(
            node_id=node_id,
            node_kind=WorkflowNodeKind.AGENT,
            config={
                "role_name": config.role_name or "",
                **({"name": config.name} if config.name else {}),
            },
        )
    )
    workspace_store.upsert_tab(tab)
    started_record, start_error = _start_persisted_agent(record=record)
    if start_error is not None or started_record is None:
        return None, start_error or "Failed to create agent"
    _emit_tab_updated(tab_id=tab_id, agent_id=node_id)
    return started_record, None


def update_tab_definition(
    *,
    tab_id: str,
    definition_payload: dict[str, object],
    actor_id: str,
) -> tuple[Tab | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"
    next_definition = WorkflowDefinition.from_mapping(definition_payload)
    node_ids = [node.id for node in next_definition.nodes]
    if len(node_ids) != len(set(node_ids)):
        return None, "Workflow definition contains duplicate node ids"
    edge_ids = [edge.id for edge in next_definition.edges]
    if len(edge_ids) != len(set(edge_ids)):
        return None, "Workflow definition contains duplicate edge ids"

    current_agent_ids = {
        node.id for node in tab.definition.nodes if node.type == WorkflowNodeKind.AGENT
    }
    next_agent_ids = {
        node.id for node in next_definition.nodes if node.type == WorkflowNodeKind.AGENT
    }
    if current_agent_ids != next_agent_ids:
        return None, "Agent nodes must be created or deleted through workflow node APIs"

    current_records = {
        record.id: record
        for record in list_tab_nodes(tab_id)
        if not is_tab_leader(node_id=record.id, tab_id=tab_id)
    }
    for node in next_definition.nodes:
        if node.type != WorkflowNodeKind.AGENT:
            continue
        role_name = node.config.get("role_name")
        if not isinstance(role_name, str) or not role_name.strip():
            return None, f"Agent node '{node.id}' requires role_name"
        record = current_records.get(node.id)
        if record is None:
            return None, f"Runtime agent '{node.id}' was not found"
        config, error = build_node_config(
            role_name=role_name,
            tab_id=tab_id,
            name=str(node.config["name"])
            if isinstance(node.config.get("name"), str)
            else None,
            write_dirs=list(record.config.write_dirs),
            allow_network=record.config.allow_network,
        )
        if error is not None or config is None:
            return None, error or f"Failed to validate agent node '{node.id}'"
        record.config.role_name = config.role_name
        record.config.name = config.name
        record.config.tools = config.tools
        workspace_store.upsert_node_record(record)
        live_node = registry.get(node.id)
        if live_node is not None:
            live_node.config.role_name = record.config.role_name
            live_node.config.name = record.config.name
            live_node.config.tools = list(record.config.tools)
            live_node._sync_system_prompt_entry()
            live_node.set_state(
                live_node.state,
                "workflow_definition_updated",
                force_emit=True,
            )

    seen_target_ports: set[tuple[str, str]] = set()
    for edge in next_definition.edges:
        source_node = next_definition.get_node(edge.from_node_id)
        target_node = next_definition.get_node(edge.to_node_id)
        if source_node is None:
            return None, f"Edge source node '{edge.from_node_id}' does not exist"
        if target_node is None:
            return None, f"Edge target node '{edge.to_node_id}' does not exist"
        source_port = _port_matches(
            source_node.outputs,
            port_key=edge.from_port_key,
            direction=PortDirection.OUTPUT,
            kind=edge.kind,
        )
        if source_port is None:
            return None, f"Output port '{edge.from_port_key}' is invalid"
        target_port = _port_matches(
            target_node.inputs,
            port_key=edge.to_port_key,
            direction=PortDirection.INPUT,
            kind=edge.kind,
        )
        if target_port is None:
            return None, f"Input port '{edge.to_port_key}' is invalid"
        target_key = (edge.to_node_id, edge.to_port_key)
        if target_key in seen_target_ports and not target_port.multiple:
            return None, f"Input port '{edge.to_port_key}' already has an incoming edge"
        seen_target_ports.add(target_key)

    tab.definition = next_definition
    _persist_tab(tab, actor_id=actor_id)
    return tab, None


def _port_matches(
    ports: list[WorkflowPort],
    *,
    port_key: str,
    direction: PortDirection,
    kind: EdgeKind,
) -> WorkflowPort | None:
    return next(
        (
            port
            for port in ports
            if port.key == port_key
            and port.direction == direction
            and port.kind == kind
        ),
        None,
    )


def create_edge(
    *,
    tab_id: str | None = None,
    from_node_id: str,
    to_node_id: str,
    from_port_key: str = "out",
    to_port_key: str = "in",
    kind: EdgeKind | str = EdgeKind.CONTROL,
) -> tuple[GraphEdge | None, str | None]:
    resolved_kind = kind if isinstance(kind, EdgeKind) else EdgeKind(str(kind))
    resolved_tab_id = tab_id
    if resolved_tab_id is None:
        source_record = workspace_store.get_node_record(from_node_id)
        target_record = workspace_store.get_node_record(to_node_id)
        if source_record is not None and source_record.config.tab_id:
            resolved_tab_id = source_record.config.tab_id
        elif target_record is not None and target_record.config.tab_id:
            resolved_tab_id = target_record.config.tab_id
    if resolved_tab_id is None:
        return None, "tab_id is required"
    tab = workspace_store.get_tab(resolved_tab_id)
    if tab is None:
        return None, f"Tab '{resolved_tab_id}' not found"
    if is_tab_leader(node_id=from_node_id, tab_id=resolved_tab_id) or is_tab_leader(
        node_id=to_node_id,
        tab_id=resolved_tab_id,
    ):
        return None, "Tab Leader does not participate in Workflow Graph edges"
    if from_node_id == to_node_id:
        return None, "Self-loop edges are not allowed"
    source_node = tab.definition.get_node(from_node_id)
    target_node = tab.definition.get_node(to_node_id)
    if source_node is None:
        return None, f"Node '{from_node_id}' not found"
    if target_node is None:
        return None, f"Node '{to_node_id}' not found"
    source_port = _port_matches(
        source_node.outputs,
        port_key=from_port_key,
        direction=PortDirection.OUTPUT,
        kind=resolved_kind,
    )
    if source_port is None:
        return None, f"Output port '{from_port_key}' is invalid"
    target_port = _port_matches(
        target_node.inputs,
        port_key=to_port_key,
        direction=PortDirection.INPUT,
        kind=resolved_kind,
    )
    if target_port is None:
        return None, f"Input port '{to_port_key}' is invalid"
    if any(
        edge.from_node_id == from_node_id
        and edge.from_port_key == from_port_key
        and edge.to_node_id == to_node_id
        and edge.to_port_key == to_port_key
        and edge.kind == resolved_kind
        for edge in tab.definition.edges
    ):
        return None, "Duplicate edges are not allowed"
    if not target_port.multiple and any(
        edge.to_node_id == to_node_id and edge.to_port_key == to_port_key
        for edge in tab.definition.edges
    ):
        return None, f"Input port '{to_port_key}' already has an incoming edge"

    edge = GraphEdge(
        id=str(uuid.uuid4()),
        tab_id=resolved_tab_id,
        from_node_id=from_node_id,
        from_port_key=from_port_key,
        to_node_id=to_node_id,
        to_port_key=to_port_key,
        kind=resolved_kind,
    )
    tab.definition.edges.append(edge)
    _persist_tab(tab, actor_id=from_node_id)
    return edge, None


def delete_edge(
    *,
    tab_id: str,
    edge_id: str | None = None,
    from_node_id: str | None = None,
    to_node_id: str | None = None,
    from_port_key: str | None = None,
    to_port_key: str | None = None,
) -> tuple[dict[str, object] | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    matched_edge: GraphEdge | None = None
    for edge in tab.definition.edges:
        if edge_id is not None and edge.id == edge_id:
            matched_edge = edge
            break
        if (
            from_node_id is not None
            and to_node_id is not None
            and edge.from_node_id == from_node_id
            and edge.to_node_id == to_node_id
            and (from_port_key is None or edge.from_port_key == from_port_key)
            and (to_port_key is None or edge.to_port_key == to_port_key)
        ):
            matched_edge = edge
            break
    if matched_edge is None:
        return None, "Edge not found"

    tab.definition.edges = [
        edge for edge in tab.definition.edges if edge.id != matched_edge.id
    ]
    _persist_tab(tab, actor_id=matched_edge.from_node_id)
    return matched_edge.serialize(), None


def delete_agent_node(
    *,
    tab_id: str,
    node_id: str,
    timeout: float = SYSTEM_NODE_TIMEOUT,
) -> tuple[dict[str, object] | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"

    node_definition = tab.definition.get_node(node_id)
    if node_definition is None:
        return None, f"Node '{node_id}' not found"
    if is_tab_leader(node_id=node_id, tab_id=tab_id):
        return None, "Tab Leader cannot be deleted from the graph"

    related_edges = [
        edge
        for edge in tab.definition.edges
        if edge.from_node_id == node_id or edge.to_node_id == node_id
    ]
    live_node = registry.get(node_id)
    record = workspace_store.get_node_record(node_id)

    if live_node is not None:
        live_node.request_termination("graph_deleted")
        if not live_node.wait_for_termination(timeout=timeout):
            return (
                None,
                f"Failed to delete node '{node_id}' because it did not terminate",
            )

    if record is not None:
        workspace_store.delete_node_record(node_id)

    tab.definition.nodes = [node for node in tab.definition.nodes if node.id != node_id]
    tab.definition.edges = [
        edge
        for edge in tab.definition.edges
        if edge.id not in {item.id for item in related_edges}
    ]
    tab.definition.view.positions.pop(node_id, None)
    workspace_store.upsert_tab(tab)
    payload: dict[str, object] = {
        "id": node_id,
        "tab_id": tab_id,
        "removed_edge_ids": [edge.id for edge in related_edges],
    }
    event_bus.emit(
        Event(
            type=EventType.NODE_DELETED,
            agent_id=node_id,
            data=payload,
        )
    )
    _emit_tab_updated(
        tab_id=tab_id,
        agent_id=node_id,
    )
    return payload, None


def dispatch_node_message(
    *,
    node_id: str,
    content: str,
    parts: list | None = None,
    from_id: str = "human",
) -> tuple[str | None, str | None]:
    target = registry.get(node_id)
    if target is None:
        return f"Node '{node_id}' is not active", None
    message_id = str(uuid.uuid4())
    normalized_parts = list(parts or [])
    target._append_history(
        ReceivedMessage(
            from_id=from_id,
            parts=normalized_parts,
            content=content,
            message_id=message_id,
        )
    )
    target.enqueue_message(
        Message(
            from_id=from_id,
            to_id=node_id,
            parts=normalized_parts,
            content=content,
            message_id=message_id,
            history_recorded=True,
        )
    )
    return None, message_id


def list_tab_nodes(tab_id: str) -> list[GraphNodeRecord]:
    return sorted(
        workspace_store.list_node_records(tab_id),
        key=lambda record: (record.created_at, record.id),
    )


def list_tab_edges(tab_id: str) -> list[GraphEdge]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return []
    return sorted(
        [
            GraphEdge(
                id=edge.id,
                tab_id=tab_id,
                from_node_id=edge.from_node_id,
                from_port_key=edge.from_port_key,
                to_node_id=edge.to_node_id,
                to_port_key=edge.to_port_key,
                kind=edge.kind,
                created_at=edge.created_at,
            )
            for edge in tab.definition.edges
        ],
        key=lambda edge: (edge.created_at, edge.id),
    )


def list_node_connection_ids(*, tab_id: str, node_id: str) -> list[str]:
    if is_tab_leader(node_id=node_id, tab_id=tab_id):
        return []

    connection_ids: list[str] = []
    seen_node_ids: set[str] = set()
    for edge in list_tab_edges(tab_id):
        other_node_id: str | None = None
        if edge.from_node_id == node_id:
            other_node_id = edge.to_node_id
        elif edge.to_node_id == node_id:
            other_node_id = edge.from_node_id
        if other_node_id is None or other_node_id in seen_node_ids:
            continue
        seen_node_ids.add(other_node_id)
        connection_ids.append(other_node_id)
    return connection_ids

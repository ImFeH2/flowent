from __future__ import annotations

import uuid
from pathlib import Path

from app import settings as settings_module
from app.events import event_bus
from app.graph_runtime import connect_nodes
from app.models import (
    AgentState,
    BlueprintEdge,
    BlueprintSlot,
    Event,
    EventType,
    GraphEdge,
    GraphNodeRecord,
    NodeConfig,
    NodeType,
    RouteBlueprint,
    Tab,
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
    find_role,
)
from app.tools import MINIMUM_TOOLS
from app.workspace_store import workspace_store

LEADER_NODE_NAME = "Leader"
LEADER_BLUEPRINT_ANCHOR = "leader"


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


def _sorted_tab_nodes(tab_id: str) -> list[GraphNodeRecord]:
    return sorted(
        list_tab_nodes(tab_id),
        key=lambda record: (record.created_at, record.id),
    )


def _sorted_tab_edges(tab_id: str) -> list[GraphEdge]:
    return sorted(
        list_tab_edges(tab_id),
        key=lambda edge: (edge.created_at, edge.id),
    )


def _validate_blueprint_graph(
    *,
    slots: list[BlueprintSlot],
    edges: list[BlueprintEdge],
) -> str | None:
    settings = settings_module.get_settings()
    slot_ids: set[str] = set()
    slot_names: set[str] = set()
    for slot in slots:
        if slot.id in slot_ids:
            return f"Blueprint slot '{slot.id}' is duplicated"
        slot_ids.add(slot.id)
        if slot.role_name == CONDUCTOR_ROLE_NAME:
            return f"Role '{CONDUCTOR_ROLE_NAME}' is reserved for a tab Leader"
        if find_role(settings, slot.role_name) is None:
            return f"Role '{slot.role_name}' not found"
        if slot.display_name is None:
            continue
        if slot.display_name in slot_names:
            return f"Node name '{slot.display_name}' already exists"
        slot_names.add(slot.display_name)

    seen_edges: set[tuple[str, str]] = set()
    valid_targets = {LEADER_BLUEPRINT_ANCHOR, *slot_ids}
    for edge in edges:
        if edge.from_slot_id not in valid_targets:
            return f"Blueprint edge source '{edge.from_slot_id}' is invalid"
        if edge.to_slot_id not in valid_targets:
            return f"Blueprint edge target '{edge.to_slot_id}' is invalid"
        if (
            edge.from_slot_id == LEADER_BLUEPRINT_ANCHOR
            and edge.to_slot_id == LEADER_BLUEPRINT_ANCHOR
        ):
            return "Blueprint may not connect leader to leader"
        edge_key = (edge.from_slot_id, edge.to_slot_id)
        if edge_key in seen_edges:
            return (
                "Blueprint edge "
                f"'{edge.from_slot_id} -> {edge.to_slot_id}' is duplicated"
            )
        seen_edges.add(edge_key)

    return None


def serialize_blueprint(blueprint: RouteBlueprint) -> dict[str, object]:
    return {
        **blueprint.serialize(),
        "node_count": len(blueprint.slots),
        "edge_count": len(blueprint.edges),
    }


def list_blueprints() -> list[RouteBlueprint]:
    return sorted(
        workspace_store.list_blueprints(),
        key=lambda blueprint: (
            -blueprint.updated_at,
            blueprint.name.lower(),
            blueprint.id,
        ),
    )


def create_blueprint(
    *,
    name: str,
    description: str = "",
    slots: list[BlueprintSlot],
    edges: list[BlueprintEdge],
) -> tuple[RouteBlueprint | None, str | None]:
    if not name.strip():
        return None, "name must not be empty"
    error = _validate_blueprint_graph(slots=slots, edges=edges)
    if error is not None:
        return None, error
    blueprint = RouteBlueprint(
        id=str(uuid.uuid4()),
        name=name.strip(),
        description=description.strip(),
        version=1,
        slots=list(slots),
        edges=list(edges),
    )
    workspace_store.upsert_blueprint(blueprint)
    return blueprint, None


def update_blueprint(
    *,
    blueprint_id: str,
    name: str,
    description: str = "",
    slots: list[BlueprintSlot],
    edges: list[BlueprintEdge],
) -> tuple[RouteBlueprint | None, str | None]:
    blueprint = workspace_store.get_blueprint(blueprint_id)
    if blueprint is None:
        return None, f"Blueprint '{blueprint_id}' not found"
    if not name.strip():
        return None, "name must not be empty"
    error = _validate_blueprint_graph(slots=slots, edges=edges)
    if error is not None:
        return None, error
    blueprint.name = name.strip()
    blueprint.description = description.strip()
    blueprint.version += 1
    blueprint.slots = list(slots)
    blueprint.edges = list(edges)
    workspace_store.upsert_blueprint(blueprint)
    return blueprint, None


def delete_blueprint(blueprint_id: str) -> tuple[dict[str, object] | None, str | None]:
    blueprint = workspace_store.get_blueprint(blueprint_id)
    if blueprint is None:
        return None, f"Blueprint '{blueprint_id}' not found"
    workspace_store.delete_blueprint(blueprint_id)
    return {"id": blueprint.id}, None


def _route_matches_blueprint_source(tab: Tab) -> bool:
    if (
        tab.route_blueprint_id is None
        or tab.route_blueprint_version is None
        or tab.leader_id is None
    ):
        return False

    slot_by_id = {slot.id: slot for slot in tab.route_blueprint_slots}
    if len(slot_by_id) != len(tab.route_blueprint_slots):
        return False

    current_nodes = [
        record for record in _sorted_tab_nodes(tab.id) if record.id != tab.leader_id
    ]
    if len(current_nodes) != len(tab.route_blueprint_slots):
        return False

    node_by_slot_id: dict[str, GraphNodeRecord] = {}
    for record in current_nodes:
        slot_id = record.config.blueprint_slot_id
        if slot_id is None or slot_id not in slot_by_id or slot_id in node_by_slot_id:
            return False
        node_by_slot_id[slot_id] = record

    for slot_id, slot in slot_by_id.items():
        matched_record = node_by_slot_id.get(slot_id)
        if matched_record is None:
            return False
        if matched_record.config.role_name != slot.role_name:
            return False
        if matched_record.config.name != slot.display_name:
            return False

    expected_edges: set[tuple[str, str]] = set()
    for edge in tab.route_blueprint_edges:
        from_record = node_by_slot_id.get(edge.from_slot_id)
        to_record = node_by_slot_id.get(edge.to_slot_id)
        from_node_id = (
            tab.leader_id
            if edge.from_slot_id == LEADER_BLUEPRINT_ANCHOR
            else from_record.id
            if from_record is not None
            else None
        )
        to_node_id = (
            tab.leader_id
            if edge.to_slot_id == LEADER_BLUEPRINT_ANCHOR
            else to_record.id
            if to_record is not None
            else None
        )
        if from_node_id is None or to_node_id is None:
            return False
        expected_edges.add((from_node_id, to_node_id))

    current_edges = {
        (edge.from_node_id, edge.to_node_id) for edge in _sorted_tab_edges(tab.id)
    }
    return current_edges == expected_edges


def serialize_route_source(tab: Tab) -> dict[str, object]:
    blueprint = (
        workspace_store.get_blueprint(tab.route_blueprint_id)
        if tab.route_blueprint_id is not None
        else None
    )
    if tab.route_blueprint_id is None or tab.route_blueprint_version is None:
        return {
            "state": "manual",
            "blueprint_id": None,
            "blueprint_name": None,
            "blueprint_version": None,
            "blueprint_available": False,
        }
    return {
        "state": (
            "blueprint-derived" if _route_matches_blueprint_source(tab) else "drifted"
        ),
        "blueprint_id": tab.route_blueprint_id,
        "blueprint_name": (
            blueprint.name if blueprint is not None else tab.route_blueprint_name
        ),
        "blueprint_version": tab.route_blueprint_version,
        "blueprint_available": blueprint is not None,
    }


def serialize_tab_summary(tab: Tab) -> dict[str, object]:
    return {
        "id": tab.id,
        "title": tab.title,
        "goal": tab.goal,
        "leader_id": tab.leader_id,
        "created_at": tab.created_at,
        "updated_at": tab.updated_at,
        "route_source": serialize_route_source(tab),
        "node_count": len(list_tab_nodes(tab.id)),
        "edge_count": len(list_tab_edges(tab.id)),
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
    return GraphNodeRecord(
        id=leader_id,
        config=NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role_name,
            tab_id=tab_id,
            name=LEADER_NODE_NAME,
            tools=build_tools_for_role(role_name, settings=settings),
            write_dirs=[path for path in (write_dirs or []) if path.strip()],
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
    assistant.config.tools = build_tools_for_role(
        settings.assistant.role_name,
        settings=settings,
    )
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
    for edge in _sorted_tab_edges(tab_id):
        if (
            registry.get(edge.from_node_id) is None
            or registry.get(edge.to_node_id) is None
        ):
            continue
        try:
            connect_nodes(edge.from_node_id, edge.to_node_id)
        except ValueError:
            continue


def _validate_blueprint_for_tab(blueprint: RouteBlueprint) -> str | None:
    return _validate_blueprint_graph(slots=blueprint.slots, edges=blueprint.edges)


def _materialize_blueprint_route(*, tab: Tab, blueprint: RouteBlueprint) -> None:
    slot_node_ids: dict[str, str] = {}
    for slot in blueprint.slots:
        config, error = build_node_config(
            role_name=slot.role_name,
            tab_id=tab.id,
            name=slot.display_name,
        )
        if error is not None or config is None:
            raise ValueError(error or "Failed to build blueprint node config")
        config.blueprint_slot_id = slot.id
        record = GraphNodeRecord(
            id=str(uuid.uuid4()),
            config=config,
            state=AgentState.INITIALIZING,
        )
        workspace_store.upsert_node_record(record)
        slot_node_ids[slot.id] = record.id

    for blueprint_edge in blueprint.edges:
        from_node_id = (
            tab.leader_id
            if blueprint_edge.from_slot_id == LEADER_BLUEPRINT_ANCHOR
            else slot_node_ids.get(blueprint_edge.from_slot_id)
        )
        to_node_id = (
            tab.leader_id
            if blueprint_edge.to_slot_id == LEADER_BLUEPRINT_ANCHOR
            else slot_node_ids.get(blueprint_edge.to_slot_id)
        )
        if from_node_id is None or to_node_id is None:
            raise ValueError("Blueprint edge references an unknown slot")
        _, error = create_edge(
            from_node_id=from_node_id,
            to_node_id=to_node_id,
        )
        if error is not None:
            raise ValueError(error)


def save_tab_as_blueprint(
    *,
    tab_id: str,
    name: str,
    description: str = "",
) -> tuple[RouteBlueprint | None, str | None]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        return None, f"Tab '{tab_id}' not found"
    if tab.leader_id is None:
        return None, f"Tab '{tab_id}' does not have a bound Leader"

    slot_id_by_node_id: dict[str, str] = {}
    slots: list[BlueprintSlot] = []
    for index, record in enumerate(
        record for record in _sorted_tab_nodes(tab.id) if record.id != tab.leader_id
    ):
        if record.config.role_name is None or not record.config.role_name.strip():
            return None, f"Node '{record.id}' does not have a role_name"
        slot_id = f"slot-{index + 1}"
        slot_id_by_node_id[record.id] = slot_id
        slots.append(
            BlueprintSlot(
                id=slot_id,
                role_name=record.config.role_name,
                display_name=record.config.name,
            )
        )

    edges: list[BlueprintEdge] = []
    for edge in _sorted_tab_edges(tab.id):
        from_slot_id: str | None
        if edge.from_node_id == tab.leader_id:
            from_slot_id = LEADER_BLUEPRINT_ANCHOR
        else:
            from_slot_id = slot_id_by_node_id.get(edge.from_node_id)
        to_slot_id: str | None
        if edge.to_node_id == tab.leader_id:
            to_slot_id = LEADER_BLUEPRINT_ANCHOR
        else:
            to_slot_id = slot_id_by_node_id.get(edge.to_node_id)
        if from_slot_id is None or to_slot_id is None:
            return None, "Route contains an edge that points outside the current tab"
        edges.append(
            BlueprintEdge(
                from_slot_id=from_slot_id,
                to_slot_id=to_slot_id,
            )
        )

    return create_blueprint(
        name=name,
        description=description,
        slots=slots,
        edges=edges,
    )


def create_tab(
    *,
    title: str,
    goal: str = "",
    allow_network: bool = False,
    write_dirs: list[str] | None = None,
    blueprint_id: str | None = None,
) -> Tab:
    settings = settings_module.get_settings()
    blueprint = None
    if isinstance(blueprint_id, str) and blueprint_id.strip():
        blueprint = workspace_store.get_blueprint(blueprint_id.strip())
        if blueprint is None:
            raise ValueError(f"Blueprint '{blueprint_id.strip()}' not found")
        blueprint_error = _validate_blueprint_for_tab(blueprint)
        if blueprint_error is not None:
            raise ValueError(blueprint_error)
    leader_id = str(uuid.uuid4())
    tab = Tab(
        id=str(uuid.uuid4()),
        title=title.strip(),
        goal=goal.strip(),
        leader_id=leader_id,
        route_blueprint_id=blueprint.id if blueprint is not None else None,
        route_blueprint_name=blueprint.name if blueprint is not None else None,
        route_blueprint_version=blueprint.version if blueprint is not None else None,
        route_blueprint_slots=list(blueprint.slots) if blueprint is not None else [],
        route_blueprint_edges=list(blueprint.edges) if blueprint is not None else [],
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
    try:
        if blueprint is not None:
            _materialize_blueprint_route(tab=tab, blueprint=blueprint)
    except Exception:
        workspace_store.delete_tab(tab.id)
        raise
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


def _is_path_within_boundary(path: str, boundary_dirs: list[str]) -> bool:
    resolved_path = Path(path).resolve()
    return any(
        resolved_path.is_relative_to(Path(boundary_dir).resolve())
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
    creator_node_id: str | None = None,
    connect_to_creator: bool = True,
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

    node_id = str(uuid.uuid4())
    record = GraphNodeRecord(
        id=node_id,
        config=config,
        state=AgentState.INITIALIZING,
    )
    return _finalize_agent_creation(
        record=record,
        creator_node_id=creator_node_id,
        connect_to_creator=connect_to_creator,
    )


def _finalize_agent_creation(
    *,
    record: GraphNodeRecord,
    creator_node_id: str | None = None,
    connect_to_creator: bool = True,
) -> tuple[GraphNodeRecord | None, str | None]:
    workspace_store.upsert_node_record(record)
    started_record, error = _start_persisted_agent(record=record)
    if error is not None or started_record is None:
        return None, error or "Failed to create agent"
    if connect_to_creator and creator_node_id is not None:
        _, edge_error = create_edge(
            from_node_id=creator_node_id,
            to_node_id=record.id,
        )
        if edge_error is not None:
            return None, edge_error
    if record.config.tab_id is not None and (
        not connect_to_creator or creator_node_id is None
    ):
        _emit_tab_updated(
            tab_id=record.config.tab_id,
            agent_id=creator_node_id or record.id,
        )
    return started_record, None


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
    _emit_tab_updated(
        tab_id=edge.tab_id,
        agent_id=from_node_id,
    )
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

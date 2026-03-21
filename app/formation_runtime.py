from __future__ import annotations

from app.events import event_bus
from app.models import Event, EventType, Formation
from app.registry import registry


def emit_formation_created(formation: Formation) -> None:
    event_bus.emit(
        Event(
            type=EventType.FORMATION_CREATED,
            agent_id=formation.owner_agent_id,
            data=formation.serialize(),
        )
    )


def connect_nodes(from_id: str, to_id: str) -> None:
    source = registry.get(from_id)
    target = registry.get(to_id)
    if source is None or target is None:
        raise ValueError("Both nodes must exist before connecting them")
    source.add_connection(to_id)
    event_bus.emit(
        Event(
            type=EventType.NODE_CONNECTED,
            agent_id=from_id,
            data={"from_id": from_id, "to_id": to_id},
        )
    )


def disconnect_nodes(from_id: str, to_id: str) -> None:
    source = registry.get(from_id)
    if source is None:
        raise ValueError("Source node must exist before disconnecting it")
    source.remove_connection(to_id)
    event_bus.emit(
        Event(
            type=EventType.NODE_DISCONNECTED,
            agent_id=from_id,
            data={"from_id": from_id, "to_id": to_id},
        )
    )


def resolve_node_ref(node_ref: str):
    target = registry.get(node_ref)
    if target is None:
        target = registry.find_by_name(node_ref)
    return target

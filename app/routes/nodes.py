from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.registry import registry
from app.tools import MINIMUM_TOOLS
from app.workspace_store import workspace_store

router = APIRouter()


class UpdateNodePositionRequest(BaseModel):
    x: float
    y: float


class DispatchNodeMessageRequest(BaseModel):
    content: str
    from_id: str = "human"


@router.get("/api/nodes")
async def list_nodes() -> dict:
    nodes_by_id: dict[str, dict[str, object]] = {}

    assistant = registry.get_assistant()
    if assistant is not None:
        nodes_by_id[assistant.uuid] = {
            "id": assistant.uuid,
            "node_type": assistant.config.node_type.value,
            "tab_id": assistant.config.tab_id,
            "role_name": assistant.config.role_name,
            "state": assistant.state.value,
            "connections": assistant.get_connections_snapshot(),
            "name": assistant.config.name,
            "todos": [t.serialize() for t in assistant.todos],
            "position": None,
        }

    for record in workspace_store.list_node_records():
        live = registry.get(record.id)
        edges = (
            workspace_store.list_edges(record.config.tab_id)
            if record.config.tab_id
            else []
        )
        nodes_by_id[record.id] = {
            "id": record.id,
            "node_type": record.config.node_type.value,
            "tab_id": record.config.tab_id,
            "role_name": record.config.role_name,
            "state": (live.state if live is not None else record.state).value,
            "connections": [
                edge.to_node_id for edge in edges if edge.from_node_id == record.id
            ],
            "name": record.config.name,
            "todos": [
                todo.serialize()
                for todo in (
                    live.get_todos_snapshot() if live is not None else record.todos
                )
            ],
            "position": record.position.serialize()
            if record.position is not None
            else None,
        }

    for node in registry.get_all():
        if node.uuid in nodes_by_id:
            continue
        nodes_by_id[node.uuid] = {
            "id": node.uuid,
            "node_type": node.config.node_type.value,
            "tab_id": node.config.tab_id,
            "role_name": node.config.role_name,
            "state": node.state.value,
            "connections": node.get_connections_snapshot(),
            "name": node.config.name,
            "todos": [t.serialize() for t in node.todos],
            "position": None,
        }

    return {
        "nodes": list(nodes_by_id.values()),
    }


@router.get("/api/nodes/{node_id}")
async def get_node(node_id: str) -> dict:
    node = registry.get(node_id)
    record = workspace_store.get_node_record(node_id)

    if node is None and record is None:
        raise HTTPException(status_code=404, detail="Node not found")

    if node is not None:
        record_id = node.uuid
        record_state = node.state
        target_config = node.config
    else:
        assert record is not None
        record_id = record.id
        record_state = record.state
        target_config = record.config
    edges = (
        workspace_store.list_edges(target_config.tab_id) if target_config.tab_id else []
    )
    history = (
        node.get_history_snapshot()
        if node is not None
        else (record.history if record is not None else [])
    )
    todos = (
        node.get_todos_snapshot()
        if node is not None
        else (record.todos if record is not None else [])
    )

    return {
        "id": record_id,
        "node_type": target_config.node_type.value,
        "tab_id": target_config.tab_id,
        "role_name": target_config.role_name,
        "state": record_state.value,
        "contacts": node.get_contact_ids_snapshot() if node is not None else [],
        "connections": (
            [edge.to_node_id for edge in edges if edge.from_node_id == record_id]
            if target_config.tab_id
            else (node.get_connections_snapshot() if node is not None else [])
        ),
        "name": target_config.name,
        "todos": [t.serialize() for t in todos],
        "tools": sorted(set(target_config.tools) | set(MINIMUM_TOOLS)),
        "write_dirs": list(target_config.write_dirs),
        "allow_network": target_config.allow_network,
        "position": record.position.serialize()
        if record is not None and record.position is not None
        else None,
        "history": [entry.serialize() for entry in history],
    }


@router.post("/api/nodes/{node_id}/terminate")
async def terminate_node(node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    from app.models import NodeType

    if node.config.node_type == NodeType.ASSISTANT:
        raise HTTPException(status_code=400, detail="Cannot terminate assistant")

    node.request_termination("user_requested")
    return {"status": "terminating"}


@router.patch("/api/nodes/{node_id}/position")
async def update_node_position(node_id: str, req: UpdateNodePositionRequest) -> dict:
    from app.graph_service import update_node_position

    record, error = update_node_position(node_id=node_id, x=req.x, y=req.y)
    if error is not None or record is None:
        raise HTTPException(status_code=404, detail=error or "Node not found")
    return record.serialize()


@router.post("/api/nodes/{node_id}/messages")
async def dispatch_node_message(node_id: str, req: DispatchNodeMessageRequest) -> dict:
    from app.graph_service import dispatch_node_message

    error = dispatch_node_message(
        node_id=node_id,
        content=req.content,
        from_id=req.from_id,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    return {"status": "sent"}

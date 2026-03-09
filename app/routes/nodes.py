from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.registry import registry

router = APIRouter()


@router.get("/api/nodes")
async def list_nodes() -> dict:
    nodes = registry.get_all()
    return {
        "nodes": [
            {
                "id": n.uuid,
                "node_type": n.config.node_type.value,
                "role_name": n.config.role_name,
                "state": n.state.value,
                "connections": n.get_connections_snapshot(),
                "name": n.config.name,
                "todos": [t.serialize() for t in n.todos],
            }
            for n in nodes
        ],
    }


@router.get("/api/nodes/{node_id}")
async def get_node(node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    return {
        "id": node.uuid,
        "node_type": node.config.node_type.value,
        "role_name": node.config.role_name,
        "state": node.state.value,
        "connections": node.get_connections_snapshot(),
        "name": node.config.name,
        "todos": [t.serialize() for t in node.todos],
        "history": [entry.serialize() for entry in node.get_history_snapshot()],
    }


@router.post("/api/nodes/{node_id}/terminate")
async def terminate_node(node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    from app.models import NodeType

    if node.config.node_type in (NodeType.STEWARD, NodeType.CONDUCTOR):
        raise HTTPException(
            status_code=400, detail="Cannot terminate steward or conductor"
        )

    node.request_termination("user_requested")
    return {"status": "terminating"}

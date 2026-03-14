from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.registry import registry

router = APIRouter()


@router.get("/api/graphs")
async def list_graphs() -> dict[str, object]:
    return {
        "graphs": [
            {
                **graph.serialize(),
                "node_count": len(registry.get_graph_nodes(graph.id)),
            }
            for graph in registry.get_all_graphs()
        ]
    }


@router.get("/api/graphs/{graph_id}")
async def get_graph(graph_id: str) -> dict[str, object]:
    graph = registry.get_graph(graph_id)
    if graph is None:
        raise HTTPException(status_code=404, detail="Graph not found")

    nodes = registry.get_graph_nodes(graph_id)
    return {
        "graph": graph.serialize(),
        "nodes": [
            {
                "id": node.uuid,
                "node_type": node.config.node_type.value,
                "role_name": node.config.role_name,
                "state": node.state.value,
                "connections": node.get_connections_snapshot(),
                "name": node.config.name,
                "todos": [t.serialize() for t in node.todos],
                "graph_id": node.config.graph_id,
            }
            for node in nodes
        ],
        "edges": [
            {"from_id": node.uuid, "to_id": target_id}
            for node in nodes
            for target_id in node.get_connections_snapshot()
        ],
    }

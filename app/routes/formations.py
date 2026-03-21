from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.registry import registry

router = APIRouter()


@router.get("/api/formations")
async def list_formations() -> dict[str, object]:
    return {
        "formations": [
            {
                **formation.serialize(),
                "node_count": len(registry.get_formation_nodes(formation.id)),
            }
            for formation in registry.get_all_formations()
        ]
    }


@router.get("/api/formations/{formation_id}")
async def get_formation(formation_id: str) -> dict[str, object]:
    formation = registry.get_formation(formation_id)
    if formation is None:
        raise HTTPException(status_code=404, detail="Formation not found")

    nodes = registry.get_formation_nodes(formation_id)
    return {
        "formation": formation.serialize(),
        "nodes": [
            {
                "id": node.uuid,
                "node_type": node.config.node_type.value,
                "role_name": node.config.role_name,
                "state": node.state.value,
                "connections": node.get_connections_snapshot(),
                "name": node.config.name,
                "todos": [t.serialize() for t in node.todos],
                "formation_id": node.config.formation_id,
            }
            for node in nodes
        ],
        "edges": [
            {"from_id": node.uuid, "to_id": target_id}
            for node in nodes
            for target_id in node.get_connections_snapshot()
        ],
    }

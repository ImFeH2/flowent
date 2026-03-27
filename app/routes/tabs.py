from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graph_service import (
    create_agent_node,
    create_edge,
    create_tab,
    list_tab_edges,
    list_tab_nodes,
)
from app.workspace_store import workspace_store

router = APIRouter()


class CreateTabRequest(BaseModel):
    title: str
    goal: str = ""


class CreateTabNodeRequest(BaseModel):
    role_name: str
    name: str | None = None
    tools: list[str] = []
    write_dirs: list[str] = []
    allow_network: bool = False
    x: float | None = None
    y: float | None = None


class CreateTabEdgeRequest(BaseModel):
    from_node_id: str
    to_node_id: str


@router.get("/api/tabs")
async def list_tabs() -> dict[str, object]:
    tabs = workspace_store.list_tabs()
    return {
        "tabs": [
            {
                **tab.serialize(),
                "node_count": len(list_tab_nodes(tab.id)),
                "edge_count": len(list_tab_edges(tab.id)),
            }
            for tab in tabs
        ]
    }


@router.post("/api/tabs")
async def create_tab_route(req: CreateTabRequest) -> dict[str, object]:
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title must not be empty")
    tab = create_tab(title=title, goal=req.goal)
    return tab.serialize()


@router.get("/api/tabs/{tab_id}")
async def get_tab(tab_id: str) -> dict[str, object]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        raise HTTPException(status_code=404, detail="Tab not found")
    nodes = list_tab_nodes(tab_id)
    edges = list_tab_edges(tab_id)
    return {
        "tab": tab.serialize(),
        "nodes": [
            {
                "id": node.id,
                "node_type": node.config.node_type.value,
                "tab_id": node.config.tab_id,
                "role_name": node.config.role_name,
                "state": node.state.value,
                "connections": [
                    edge.to_node_id for edge in edges if edge.from_node_id == node.id
                ],
                "name": node.config.name,
                "todos": [todo.serialize() for todo in node.todos],
                "position": node.position.serialize()
                if node.position is not None
                else None,
            }
            for node in nodes
        ],
        "edges": [edge.serialize() for edge in edges],
    }


@router.post("/api/tabs/{tab_id}/nodes")
async def create_tab_node(tab_id: str, req: CreateTabNodeRequest) -> dict[str, object]:
    position = None
    if req.x is not None and req.y is not None:
        from app.models import NodePosition

        position = NodePosition(x=req.x, y=req.y)
    record, error = create_agent_node(
        role_name=req.role_name,
        tab_id=tab_id,
        name=req.name,
        tools=req.tools,
        write_dirs=req.write_dirs,
        allow_network=req.allow_network,
        position=position,
    )
    if error is not None or record is None:
        raise HTTPException(status_code=400, detail=error or "Failed to create node")
    return record.serialize()


@router.post("/api/tabs/{tab_id}/edges")
async def create_tab_edge(tab_id: str, req: CreateTabEdgeRequest) -> dict[str, object]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        raise HTTPException(status_code=404, detail="Tab not found")
    edge, error = create_edge(
        from_node_id=req.from_node_id,
        to_node_id=req.to_node_id,
    )
    if error is not None or edge is None:
        raise HTTPException(status_code=400, detail=error or "Failed to create edge")
    return edge.serialize()

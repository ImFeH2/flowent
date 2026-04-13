from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graph_service import (
    create_agent_node,
    create_edge,
    create_tab,
    delete_tab,
    is_tab_leader,
    list_tab_edges,
    list_tab_nodes,
    serialize_tab_summary,
)
from app.workspace_store import workspace_store

router = APIRouter()


class CreateTabRequest(BaseModel):
    title: str
    goal: str = ""
    allow_network: bool = False
    write_dirs: list[str] = []
    blueprint_id: str | None = None


class CreateTabNodeRequest(BaseModel):
    role_name: str
    name: str | None = None
    tools: list[str] = []
    write_dirs: list[str] = []
    allow_network: bool = False


class CreateTabEdgeRequest(BaseModel):
    from_node_id: str
    to_node_id: str


@router.get("/api/tabs")
async def list_tabs() -> dict[str, object]:
    tabs = workspace_store.list_tabs()
    return {"tabs": [serialize_tab_summary(tab) for tab in tabs]}


@router.post("/api/tabs")
async def create_tab_route(req: CreateTabRequest) -> dict[str, object]:
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title must not be empty")
    try:
        tab = create_tab(
            title=title,
            goal=req.goal,
            allow_network=req.allow_network,
            write_dirs=req.write_dirs,
            blueprint_id=req.blueprint_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_tab_summary(tab)


@router.get("/api/tabs/{tab_id}")
async def get_tab(tab_id: str) -> dict[str, object]:
    tab = workspace_store.get_tab(tab_id)
    if tab is None:
        raise HTTPException(status_code=404, detail="Tab not found")
    nodes = list_tab_nodes(tab_id)
    edges = list_tab_edges(tab_id)
    return {
        "tab": serialize_tab_summary(tab),
        "nodes": [
            {
                "id": node.id,
                "node_type": node.config.node_type.value,
                "tab_id": node.config.tab_id,
                "role_name": node.config.role_name,
                "is_leader": is_tab_leader(node_id=node.id, tab_id=tab_id),
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


@router.delete("/api/tabs/{tab_id}")
async def delete_tab_route(tab_id: str) -> dict[str, object]:
    deleted, error = delete_tab(tab_id=tab_id)
    if error is not None or deleted is None:
        status_code = 404 if error and error.endswith("not found") else 400
        raise HTTPException(
            status_code=status_code, detail=error or "Failed to delete tab"
        )
    return deleted


@router.post("/api/tabs/{tab_id}/nodes")
async def create_tab_node(tab_id: str, req: CreateTabNodeRequest) -> dict[str, object]:
    record, error = create_agent_node(
        role_name=req.role_name,
        tab_id=tab_id,
        name=req.name,
        tools=req.tools,
        write_dirs=req.write_dirs,
        allow_network=req.allow_network,
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

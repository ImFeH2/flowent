from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graph_service import (
    create_blueprint,
    delete_blueprint,
    list_blueprints,
    save_tab_as_blueprint,
    serialize_blueprint,
    update_blueprint,
)
from app.models import BlueprintEdge, BlueprintSlot

router = APIRouter()


class BlueprintSlotRequest(BaseModel):
    id: str
    role_name: str
    display_name: str | None = None


class BlueprintEdgeRequest(BaseModel):
    from_slot_id: str
    to_slot_id: str


class BlueprintRequest(BaseModel):
    name: str
    description: str = ""
    slots: list[BlueprintSlotRequest] = []
    edges: list[BlueprintEdgeRequest] = []


class SaveTabAsBlueprintRequest(BaseModel):
    name: str
    description: str = ""


def _coerce_blueprint_slots(
    payload: list[BlueprintSlotRequest],
) -> list[BlueprintSlot]:
    return [
        BlueprintSlot(
            id=item.id.strip(),
            role_name=item.role_name.strip(),
            display_name=item.display_name.strip()
            if isinstance(item.display_name, str) and item.display_name.strip()
            else None,
        )
        for item in payload
    ]


def _coerce_blueprint_edges(
    payload: list[BlueprintEdgeRequest],
) -> list[BlueprintEdge]:
    return [
        BlueprintEdge(
            from_slot_id=item.from_slot_id.strip(),
            to_slot_id=item.to_slot_id.strip(),
        )
        for item in payload
    ]


@router.get("/api/blueprints")
async def list_blueprints_route() -> dict[str, object]:
    return {
        "blueprints": [
            serialize_blueprint(blueprint) for blueprint in list_blueprints()
        ]
    }


@router.post("/api/blueprints")
async def create_blueprint_route(req: BlueprintRequest) -> dict[str, object]:
    blueprint, error = create_blueprint(
        name=req.name,
        description=req.description,
        slots=_coerce_blueprint_slots(req.slots),
        edges=_coerce_blueprint_edges(req.edges),
    )
    if error is not None or blueprint is None:
        raise HTTPException(
            status_code=400,
            detail=error or "Failed to create blueprint",
        )
    return serialize_blueprint(blueprint)


@router.put("/api/blueprints/{blueprint_id}")
async def update_blueprint_route(
    blueprint_id: str,
    req: BlueprintRequest,
) -> dict[str, object]:
    blueprint, error = update_blueprint(
        blueprint_id=blueprint_id,
        name=req.name,
        description=req.description,
        slots=_coerce_blueprint_slots(req.slots),
        edges=_coerce_blueprint_edges(req.edges),
    )
    if error is not None or blueprint is None:
        raise HTTPException(
            status_code=404 if error and error.endswith("not found") else 400,
            detail=error or "Failed to update blueprint",
        )
    return serialize_blueprint(blueprint)


@router.delete("/api/blueprints/{blueprint_id}")
async def delete_blueprint_route(blueprint_id: str) -> dict[str, object]:
    deleted, error = delete_blueprint(blueprint_id)
    if error is not None or deleted is None:
        raise HTTPException(
            status_code=404 if error and error.endswith("not found") else 400,
            detail=error or "Failed to delete blueprint",
        )
    return deleted


@router.post("/api/tabs/{tab_id}/blueprint")
async def save_tab_as_blueprint_route(
    tab_id: str,
    req: SaveTabAsBlueprintRequest,
) -> dict[str, object]:
    blueprint, error = save_tab_as_blueprint(
        tab_id=tab_id,
        name=req.name,
        description=req.description,
    )
    if error is not None or blueprint is None:
        raise HTTPException(
            status_code=404 if error and error.endswith("not found") else 400,
            detail=error or "Failed to save blueprint",
        )
    return serialize_blueprint(blueprint)

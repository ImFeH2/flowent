from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import Message
from app.registry import registry

router = APIRouter()


def _get_steward():
    return registry.get("steward")


@router.get("/api/steward")
async def get_steward() -> dict:
    steward = _get_steward()
    if steward is None:
        raise HTTPException(status_code=404, detail="Steward not found")
    return {
        "id": steward.uuid,
        "state": steward.state.value,
        "connections": steward.get_connections_snapshot(),
    }


class StewardMessageRequest(BaseModel):
    content: str


@router.post("/api/steward/message")
async def send_steward_message(req: StewardMessageRequest) -> dict:
    steward = _get_steward()
    if steward is None:
        raise HTTPException(status_code=404, detail="Steward not found")

    msg = Message(from_id="human", to_id=steward.uuid, content=req.content)
    steward.enqueue_message(msg)
    return {"status": "sent"}

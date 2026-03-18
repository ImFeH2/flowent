from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import Message
from app.registry import registry

router = APIRouter()


def _get_assistant():
    return registry.get_assistant()


@router.get("/api/assistant")
async def get_assistant() -> dict:
    assistant = _get_assistant()
    if assistant is None:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return {
        "id": assistant.uuid,
        "name": assistant.config.name,
        "role_name": assistant.config.role_name,
        "state": assistant.state.value,
        "connections": assistant.get_connections_snapshot(),
    }


class AssistantMessageRequest(BaseModel):
    content: str


@router.post("/api/assistant/message")
async def send_assistant_message(req: AssistantMessageRequest) -> dict:
    assistant = _get_assistant()
    if assistant is None:
        raise HTTPException(status_code=404, detail="Assistant not found")

    msg = Message(from_id="human", to_id=assistant.uuid, content=req.content)
    assistant.enqueue_message(msg)
    return {"status": "sent"}

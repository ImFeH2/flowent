from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from pydantic import BaseModel

from app.events import event_bus
from app.models import Message
from app.registry import registry
from app.user_settings import (
    get_user_settings,
    save_user_settings,
    EventLogSettings,
    ModelSettings,
)

router = APIRouter()

STEWARD_ID: str | None = None


class ChatRequest(BaseModel):
    message: str


@router.post("/api/chat")
async def chat(req: ChatRequest) -> dict:
    logger.info("POST /api/chat message={}", req.message[:100])

    if STEWARD_ID is None:
        return {"error": "Steward not initialized"}

    steward = registry.get(STEWARD_ID)
    if steward is None:
        return {"error": "Steward not found"}

    msg = Message(from_id="human", to_id=STEWARD_ID, content=req.message)
    steward.enqueue_message(msg)
    return {"status": "sent", "steward_id": STEWARD_ID}


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket) -> None:
    await event_bus.connect_display(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        event_bus.disconnect_display(ws)


@router.websocket("/ws/updates")
async def ws_updates(ws: WebSocket) -> None:
    await event_bus.connect_updates(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        event_bus.disconnect_updates(ws)


def _serialize_history(agent) -> list[dict]:
    result = []
    for entry in agent.history:
        d = asdict(entry)
        d["type"] = entry.type.value
        result.append(d)
    return result


@router.get("/api/agents")
async def list_agents() -> dict:
    agents = registry.get_all()
    return {
        "agents": [
            {
                "id": a.uuid,
                "role": a.config.role.value,
                "state": a.state.value,
                "branch": a.config.branch,
                "children": a.children_ids,
                "name": a.config.name,
                "status_description": a.status_description,
            }
            for a in agents
        ]
    }


@router.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        return {"error": "Agent not found"}

    children = [
        {
            "id": c.uuid,
            "role": c.config.role.value,
            "state": c.state.value,
            "name": c.config.name,
            "status_description": c.status_description,
        }
        for c in registry.get_children(agent_id)
    ]

    return {
        "id": agent.uuid,
        "role": agent.config.role.value,
        "state": agent.state.value,
        "branch": agent.config.branch,
        "name": agent.config.name,
        "children": children,
        "task_prompt": agent.config.task_prompt,
        "supervisor_id": agent.config.supervisor_id,
        "status_description": agent.status_description,
        "permissions": asdict(agent.config.permissions),
        "memory": agent.memory,
        "history": _serialize_history(agent),
    }


class AgentMessageRequest(BaseModel):
    message: str


@router.post("/api/agents/{agent_id}/message")
async def send_agent_message(agent_id: str, req: AgentMessageRequest) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        return {"error": "Agent not found"}

    msg = Message(from_id="human", to_id=agent_id, content=req.message)
    agent.enqueue_message(msg)
    return {"status": "sent"}


class PathAccessResponse(BaseModel):
    approved: bool


@router.post("/api/path-access/{request_id}")
async def resolve_path_access(request_id: str, req: PathAccessResponse) -> dict:
    from app.tools.path_access import resolve_path_access as _resolve

    success = _resolve(request_id, req.approved)
    if not success:
        return {"error": "Request not found or already resolved"}
    return {"status": "resolved", "approved": req.approved}


@router.post("/api/agents/{agent_id}/terminate")
async def terminate_agent(agent_id: str) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        return {"error": "Agent not found"}
    agent.request_termination("user_requested")
    return {"status": "terminating"}


@router.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/api/settings")
async def get_settings() -> dict:
    settings = get_user_settings()
    return asdict(settings)


class UpdateSettingsRequest(BaseModel):
    event_log: dict | None = None
    model: dict | None = None


@router.post("/api/settings")
async def update_settings(req: UpdateSettingsRequest) -> dict:
    current = get_user_settings()

    if req.event_log is not None:
        current.event_log = EventLogSettings(**req.event_log)
    if req.model is not None:
        current.model = ModelSettings(**req.model)

    save_user_settings(current)
    logger.info("User settings updated")
    return {"status": "saved", "settings": asdict(current)}

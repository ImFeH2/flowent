from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from loguru import logger
from pydantic import BaseModel

from app.events import event_bus
from app.models import Message
from app.registry import registry
from app.user_settings import (
    EventLogSettings,
    ModelSettings,
    ProviderConfig,
    get_user_settings,
    save_user_settings,
)

router = APIRouter()


class AgentMessageRequest(BaseModel):
    message: str


@router.post("/api/agents/{agent_id}/message")
async def send_agent_message(agent_id: str, req: AgentMessageRequest) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    msg = Message(from_id="human", to_id=agent_id, content=req.message)
    agent.enqueue_message(msg)
    return {"status": "sent"}


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
        ],
    }


@router.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

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


class PathAccessResponse(BaseModel):
    approved: bool


@router.post("/api/path-access/{request_id}")
async def resolve_path_access(request_id: str, req: PathAccessResponse) -> dict:
    from app.tools.path_access import resolve_path_access as _resolve

    success = _resolve(request_id, req.approved)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Request not found or already resolved",
        )
    return {"status": "resolved", "approved": req.approved}


@router.post("/api/agents/{agent_id}/terminate")
async def terminate_agent(agent_id: str) -> dict:
    agent = registry.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.request_termination("user_requested")
    return {"status": "terminating"}


@router.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/api/meta")
async def get_meta() -> dict:
    from app.providers.registry import BUILTIN_PROVIDERS, ProviderType

    return {
        "provider_types": [pt.value for pt in ProviderType],
        "builtin_provider_names": [p.name for p in BUILTIN_PROVIDERS],
    }


@router.get("/api/settings")
async def get_settings() -> dict:
    from app.user_settings import get_all_providers

    settings = get_user_settings()
    result = asdict(settings)
    all_providers = get_all_providers(settings.model)
    result["model"]["all_providers"] = [asdict(p) for p in all_providers]
    return result


class UpdateSettingsRequest(BaseModel):
    event_log: dict | None = None
    model: dict | None = None


@router.post("/api/settings")
async def update_settings(req: UpdateSettingsRequest) -> dict:
    from app.user_settings import get_all_providers

    current = get_user_settings()

    if req.event_log is not None:
        current.event_log = EventLogSettings(**req.event_log)
    if req.model is not None:
        providers_raw = req.model.pop("providers", [])
        providers = [
            ProviderConfig(**p) if isinstance(p, dict) else p for p in providers_raw
        ]
        current.model = ModelSettings(
            active_provider=req.model.get(
                "active_provider",
                current.model.active_provider,
            ),
            active_model=req.model.get("active_model", current.model.active_model),
            providers=providers,
        )

    save_user_settings(current)
    logger.info("User settings updated")
    result = asdict(current)
    all_providers = get_all_providers(current.model)
    result["model"]["all_providers"] = [asdict(p) for p in all_providers]
    return {"status": "saved", "settings": result}


class ListModelsRequest(BaseModel):
    provider_name: str


@router.post("/api/providers/models")
async def list_provider_models(req: ListModelsRequest) -> dict:
    from app.providers.registry import ProviderType, create_provider
    from app.user_settings import find_provider, get_user_settings

    settings = get_user_settings()
    cfg = find_provider(settings.model, req.provider_name)

    if cfg is None:
        raise HTTPException(
            status_code=404,
            detail=f"Provider '{req.provider_name}' not found",
        )

    try:
        provider = create_provider(
            provider_name=cfg.name,
            provider_type=ProviderType(cfg.provider_type),
            api_base_url=cfg.api_base_url,
            api_key=cfg.api_key,
        )
        models = provider.list_models()
        return {"models": [{"id": m.id} for m in models]}
    except Exception as e:
        logger.error(
            "Failed to list models for provider '{}': {}",
            req.provider_name,
            e,
        )
        raise HTTPException(status_code=500, detail=str(e)) from e

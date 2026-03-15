from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.settings import (
    AssistantSettings,
    EventLogSettings,
    ModelSettings,
    build_default_model_params,
    build_model_params_from_mapping,
    find_role,
    get_settings,
    save_settings,
    serialize_provider,
    serialize_role,
)

router = APIRouter()


@router.get("/api/settings/bootstrap")
async def get_settings_bootstrap() -> dict[str, object]:
    from app._version import __version__

    settings = get_settings()
    return {
        "settings": asdict(settings),
        "providers": [serialize_provider(provider) for provider in settings.providers],
        "roles": [serialize_role(role) for role in settings.roles],
        "version": __version__,
    }


@router.get("/api/settings")
async def get_settings_api() -> dict[str, object]:
    settings = get_settings()
    return asdict(settings)


class UpdateSettingsRequest(BaseModel):
    assistant: dict[str, object] | None = None
    event_log: dict[str, object] | None = None
    model: dict[str, object] | None = None


@router.post("/api/settings")
async def update_settings(req: UpdateSettingsRequest) -> dict[str, object]:
    from app.models import ASSISTANT_NODE_ID
    from app.providers.gateway import gateway
    from app.registry import registry

    current = get_settings()

    if req.assistant is not None:
        role_name = req.assistant.get("role_name", current.assistant.role_name)
        next_role_name = (
            role_name if isinstance(role_name, str) else current.assistant.role_name
        ).strip()
        if not next_role_name:
            next_role_name = current.assistant.role_name
        if find_role(current, next_role_name) is None:
            raise HTTPException(
                status_code=400,
                detail=f"Role '{next_role_name}' not found",
            )
        current.assistant = AssistantSettings(role_name=next_role_name)

    if req.event_log is not None:
        timestamp_format = req.event_log.get("timestamp_format")
        if isinstance(timestamp_format, str):
            current.event_log = EventLogSettings(timestamp_format=timestamp_format)

    if req.model is not None:
        active_provider_id = req.model.get(
            "active_provider_id", current.model.active_provider_id
        )
        active_model = req.model.get("active_model", current.model.active_model)
        params = current.model.params
        if "params" in req.model:
            try:
                parsed_params = build_model_params_from_mapping(req.model.get("params"))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            params = parsed_params or build_default_model_params()
        current.model = ModelSettings(
            active_provider_id=active_provider_id
            if isinstance(active_provider_id, str)
            else current.model.active_provider_id,
            active_model=active_model
            if isinstance(active_model, str)
            else current.model.active_model,
            params=params,
        )

    save_settings(current)
    assistant = registry.get(ASSISTANT_NODE_ID)
    if assistant is not None:
        assistant.config.role_name = current.assistant.role_name
        assistant._sync_system_prompt_entry()
        assistant.set_state(
            assistant.state,
            "assistant settings updated",
            force_emit=True,
        )
    gateway.invalidate_cache()
    logger.info("Settings updated")
    return {"status": "saved", "settings": asdict(current)}

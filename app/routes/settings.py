from __future__ import annotations

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.settings import (
    AssistantSettings,
    EventLogSettings,
    ModelSettings,
    TelegramSettings,
    build_default_model_params,
    build_model_params_from_mapping,
    find_role,
    get_settings,
    save_settings,
    serialize_provider,
    serialize_role,
    serialize_settings,
    serialize_telegram_settings,
)

router = APIRouter()


@router.get("/api/settings/bootstrap")
async def get_settings_bootstrap() -> dict[str, object]:
    from app._version import __version__

    settings = get_settings()
    return {
        "settings": serialize_settings(settings),
        "providers": [serialize_provider(provider) for provider in settings.providers],
        "roles": [serialize_role(role) for role in settings.roles],
        "version": __version__,
    }


@router.get("/api/settings")
async def get_settings_api() -> dict[str, object]:
    settings = get_settings()
    return serialize_settings(settings)


class UpdateSettingsRequest(BaseModel):
    assistant: dict[str, object] | None = None
    event_log: dict[str, object] | None = None
    model: dict[str, object] | None = None


class UpdateTelegramSettingsRequest(BaseModel):
    bot_token: str | None = None
    allowed_user_ids: list[int] | None = None


def _normalize_allowed_user_ids(
    raw_ids: list[int] | None,
    current_ids: list[int],
) -> list[int]:
    if raw_ids is None:
        return list(current_ids)

    normalized: list[int] = []
    for raw_id in raw_ids:
        if raw_id <= 0:
            raise HTTPException(
                status_code=400,
                detail="allowed_user_ids must contain positive integers",
            )
        if raw_id not in normalized:
            normalized.append(raw_id)
    return normalized


@router.post("/api/settings")
async def update_settings(req: UpdateSettingsRequest) -> dict[str, object]:
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
    assistant = registry.get_assistant()
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
    return {"status": "saved", "settings": serialize_settings(current)}


@router.get("/api/settings/telegram")
async def get_telegram_settings() -> dict[str, object]:
    settings = get_settings()
    return serialize_telegram_settings(settings.telegram)


@router.patch("/api/settings/telegram")
async def update_telegram_settings(
    req: UpdateTelegramSettingsRequest,
) -> dict[str, object]:
    from app.runtime import restart_telegram_channel

    settings = get_settings()
    previous_token = settings.telegram.bot_token

    next_token = previous_token
    if req.bot_token is not None:
        next_token = req.bot_token.strip()

    next_allowed_user_ids = _normalize_allowed_user_ids(
        req.allowed_user_ids,
        settings.telegram.allowed_user_ids,
    )

    settings.telegram = TelegramSettings(
        bot_token=next_token,
        allowed_user_ids=next_allowed_user_ids,
        registered_chat_ids=list(settings.telegram.registered_chat_ids),
    )
    save_settings(settings)

    if next_token != previous_token:
        restart_telegram_channel()

    logger.info("Telegram settings updated")
    return {
        "status": "saved",
        "telegram": serialize_telegram_settings(settings.telegram),
    }


@router.delete("/api/settings/telegram/chat/{chat_id}")
async def delete_telegram_chat(chat_id: int) -> dict[str, object]:
    settings = get_settings()
    settings.telegram.registered_chat_ids = [
        existing_chat_id
        for existing_chat_id in settings.telegram.registered_chat_ids
        if existing_chat_id != chat_id
    ]
    save_settings(settings)
    logger.info("Telegram chat removed: {}", chat_id)
    return {
        "status": "deleted",
        "telegram": serialize_telegram_settings(settings.telegram),
    }

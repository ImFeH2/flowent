from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.settings import (
    AssistantSettings,
    EventLogSettings,
    ModelSettings,
    TelegramApprovedChat,
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

    settings.telegram = TelegramSettings(
        bot_token=next_token,
        pending_chats=list(settings.telegram.pending_chats),
        approved_chats=list(settings.telegram.approved_chats),
    )
    save_settings(settings)

    if next_token != previous_token:
        restart_telegram_channel()

    logger.info("Telegram settings updated")
    return {
        "status": "saved",
        "telegram": serialize_telegram_settings(settings.telegram),
    }


@router.post("/api/settings/telegram/approve/{chat_id}")
async def approve_telegram_chat(chat_id: int) -> dict[str, object]:
    settings = get_settings()
    pending_chat = next(
        (chat for chat in settings.telegram.pending_chats if chat.chat_id == chat_id),
        None,
    )
    if pending_chat is None:
        raise HTTPException(status_code=404, detail="Pending Telegram chat not found")

    settings.telegram.pending_chats = [
        chat for chat in settings.telegram.pending_chats if chat.chat_id != chat_id
    ]
    if not any(chat.chat_id == chat_id for chat in settings.telegram.approved_chats):
        settings.telegram.approved_chats.append(
            TelegramApprovedChat(
                chat_id=pending_chat.chat_id,
                username=pending_chat.username,
                display_name=pending_chat.display_name,
                approved_at=time.time(),
            )
        )
    save_settings(settings)
    logger.info("Telegram chat approved: {}", chat_id)
    return {
        "status": "approved",
        "telegram": serialize_telegram_settings(settings.telegram),
    }


@router.delete("/api/settings/telegram/pending/{chat_id}")
async def delete_pending_telegram_chat(chat_id: int) -> dict[str, object]:
    settings = get_settings()
    settings.telegram.pending_chats = [
        chat for chat in settings.telegram.pending_chats if chat.chat_id != chat_id
    ]
    save_settings(settings)
    logger.info("Pending Telegram chat removed: {}", chat_id)
    return {
        "status": "deleted",
        "telegram": serialize_telegram_settings(settings.telegram),
    }


@router.delete("/api/settings/telegram/chat/{chat_id}")
async def delete_telegram_chat(chat_id: int) -> dict[str, object]:
    settings = get_settings()
    settings.telegram.approved_chats = [
        existing_chat
        for existing_chat in settings.telegram.approved_chats
        if existing_chat.chat_id != chat_id
    ]
    save_settings(settings)
    logger.info("Telegram chat removed: {}", chat_id)
    return {
        "status": "deleted",
        "telegram": serialize_telegram_settings(settings.telegram),
    }

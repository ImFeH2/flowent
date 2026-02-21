from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

from app.settings import EventLogSettings, ModelSettings, get_settings, save_settings

router = APIRouter()


@router.get("/api/settings")
async def get_settings_api() -> dict:
    settings = get_settings()
    return asdict(settings)


class UpdateSettingsRequest(BaseModel):
    event_log: dict | None = None
    model: dict | None = None


@router.post("/api/settings")
async def update_settings(req: UpdateSettingsRequest) -> dict:
    current = get_settings()

    if req.event_log is not None:
        current.event_log = EventLogSettings(**req.event_log)
    if req.model is not None:
        current.model = ModelSettings(
            active_provider_id=req.model.get(
                "active_provider_id", current.model.active_provider_id
            ),
            active_model=req.model.get("active_model", current.model.active_model),
        )

    save_settings(current)
    logger.info("Settings updated")
    return {"status": "saved", "settings": asdict(current)}

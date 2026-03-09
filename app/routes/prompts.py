from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.settings import get_settings, save_settings

router = APIRouter()


class PromptSettingsResponse(BaseModel):
    custom_prompt: str


class UpdatePromptSettingsRequest(BaseModel):
    custom_prompt: str


@router.get("/api/prompts")
async def get_prompts() -> PromptSettingsResponse:
    settings = get_settings()
    return PromptSettingsResponse(custom_prompt=settings.custom_prompt)


@router.put("/api/prompts")
async def update_prompts(
    req: UpdatePromptSettingsRequest,
) -> PromptSettingsResponse:
    settings = get_settings()
    settings.custom_prompt = req.custom_prompt
    save_settings(settings)
    return PromptSettingsResponse(custom_prompt=settings.custom_prompt)

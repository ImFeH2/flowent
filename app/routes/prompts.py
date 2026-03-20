from __future__ import annotations

from fastapi import APIRouter
from pydantic import AliasChoices, BaseModel, Field

from app.settings import get_settings, save_settings

router = APIRouter()


class PromptSettingsResponse(BaseModel):
    custom_prompt: str
    custom_post_prompt: str


class UpdatePromptSettingsRequest(BaseModel):
    custom_prompt: str | None = None
    custom_post_prompt: str | None = Field(
        default=None,
        validation_alias=AliasChoices("custom_post_prompt", "post_prompt"),
    )


@router.get("/api/prompts")
async def get_prompts() -> PromptSettingsResponse:
    settings = get_settings()
    return PromptSettingsResponse(
        custom_prompt=settings.custom_prompt,
        custom_post_prompt=settings.custom_post_prompt,
    )


@router.put("/api/prompts")
async def update_prompts(
    req: UpdatePromptSettingsRequest,
) -> PromptSettingsResponse:
    settings = get_settings()
    if req.custom_prompt is not None:
        settings.custom_prompt = req.custom_prompt
    if req.custom_post_prompt is not None:
        settings.custom_post_prompt = req.custom_post_prompt
    save_settings(settings)
    return PromptSettingsResponse(
        custom_prompt=settings.custom_prompt,
        custom_post_prompt=settings.custom_post_prompt,
    )

import asyncio

from app.routes.prompts import (
    UpdatePromptSettingsRequest,
    get_prompts,
    update_prompts,
)
from app.settings import Settings


def test_get_prompts_returns_current_custom_prompt(monkeypatch):
    monkeypatch.setattr(
        "app.routes.prompts.get_settings",
        lambda: Settings(custom_prompt="Global instructions."),
    )

    result = asyncio.run(get_prompts())

    assert result.model_dump() == {"custom_prompt": "Global instructions."}


def test_update_prompts_persists_custom_prompt(monkeypatch):
    settings = Settings(custom_prompt="")
    saved: list[str] = []

    monkeypatch.setattr("app.routes.prompts.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.prompts.save_settings",
        lambda current: saved.append(current.custom_prompt),
    )

    result = asyncio.run(
        update_prompts(
            UpdatePromptSettingsRequest(custom_prompt="Add this everywhere.")
        )
    )

    assert settings.custom_prompt == "Add this everywhere."
    assert saved == ["Add this everywhere."]
    assert result.model_dump() == {"custom_prompt": "Add this everywhere."}

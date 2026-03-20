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
        lambda: Settings(
            custom_prompt="Global instructions.",
            custom_post_prompt="Runtime reminder.",
        ),
    )

    result = asyncio.run(get_prompts())

    assert result.model_dump() == {
        "custom_prompt": "Global instructions.",
        "custom_post_prompt": "Runtime reminder.",
    }


def test_update_prompts_persists_custom_prompt(monkeypatch):
    settings = Settings(custom_prompt="", custom_post_prompt="")
    saved: list[tuple[str, str]] = []

    monkeypatch.setattr("app.routes.prompts.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.prompts.save_settings",
        lambda current: saved.append(
            (current.custom_prompt, current.custom_post_prompt)
        ),
    )

    result = asyncio.run(
        update_prompts(
            UpdatePromptSettingsRequest(
                custom_prompt="Add this everywhere.",
                custom_post_prompt="Append this after history.",
            )
        )
    )

    assert settings.custom_prompt == "Add this everywhere."
    assert settings.custom_post_prompt == "Append this after history."
    assert saved == [("Add this everywhere.", "Append this after history.")]
    assert result.model_dump() == {
        "custom_prompt": "Add this everywhere.",
        "custom_post_prompt": "Append this after history.",
    }


def test_update_prompts_allows_custom_post_prompt_only(monkeypatch):
    settings = Settings(custom_prompt="Keep this.", custom_post_prompt="")
    saved: list[tuple[str, str]] = []

    monkeypatch.setattr("app.routes.prompts.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.prompts.save_settings",
        lambda current: saved.append(
            (current.custom_prompt, current.custom_post_prompt)
        ),
    )

    result = asyncio.run(
        update_prompts(
            UpdatePromptSettingsRequest(custom_post_prompt="Append this after history.")
        )
    )

    assert settings.custom_prompt == "Keep this."
    assert settings.custom_post_prompt == "Append this after history."
    assert saved == [("Keep this.", "Append this after history.")]
    assert result.model_dump() == {
        "custom_prompt": "Keep this.",
        "custom_post_prompt": "Append this after history.",
    }


def test_update_prompts_accepts_legacy_post_prompt_alias(monkeypatch):
    settings = Settings(custom_prompt="Keep this.", custom_post_prompt="")

    monkeypatch.setattr("app.routes.prompts.get_settings", lambda: settings)
    monkeypatch.setattr("app.routes.prompts.save_settings", lambda current: None)

    result = asyncio.run(
        update_prompts(
            UpdatePromptSettingsRequest.model_validate(
                {"post_prompt": "Append this after history."}
            )
        )
    )

    assert settings.custom_prompt == "Keep this."
    assert settings.custom_post_prompt == "Append this after history."
    assert result.model_dump() == {
        "custom_prompt": "Keep this.",
        "custom_post_prompt": "Append this after history.",
    }

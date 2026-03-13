import asyncio

import pytest
from fastapi import HTTPException

from app.routes.settings import UpdateSettingsRequest, get_settings_api, update_settings
from app.settings import RoleConfig, Settings


def test_get_settings_returns_assistant_configuration(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    result = asyncio.run(get_settings_api())

    assert result["assistant"] == {"role_name": "Steward"}


def test_update_settings_persists_assistant_role(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Steward", system_prompt="Default assistant role."),
            RoleConfig(name="Reviewer", system_prompt="Review carefully."),
        ]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(assistant={"role_name": "Reviewer"}),
        )
    )

    assert settings.assistant.role_name == "Reviewer"
    assert result["settings"]["assistant"] == {"role_name": "Reviewer"}
    assert saved == [settings]


def test_update_settings_rejects_unknown_assistant_role(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(assistant={"role_name": "Ghost"}),
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Role 'Ghost' not found"

import asyncio

import pytest
from fastapi import HTTPException

from app.routes.settings import (
    UpdateSettingsRequest,
    get_settings_api,
    get_settings_bootstrap,
    update_settings,
)
from app.settings import ProviderConfig, RoleConfig, Settings


def test_get_settings_returns_assistant_configuration(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    result = asyncio.run(get_settings_api())

    assert result["assistant"] == {"role_name": "Steward"}


def test_get_settings_bootstrap_returns_related_resources(monkeypatch):
    settings = Settings(
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_compatible",
                base_url="https://api.example.com/v1",
                api_key="secret",
            )
        ],
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")],
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app._version.__version__", "1.2.3")

    result = asyncio.run(get_settings_bootstrap())

    assert result == {
        "settings": {
            "event_log": {"timestamp_format": "absolute"},
            "assistant": {"role_name": "Steward"},
            "model": {
                "active_provider_id": "",
                "active_model": "",
                "params": {
                    "reasoning_effort": "medium",
                    "verbosity": "medium",
                    "max_output_tokens": None,
                    "temperature": None,
                    "top_p": None,
                },
            },
            "custom_prompt": "",
            "root_boundary": {"write_dirs": [], "allow_network": False},
            "providers": [
                {
                    "id": "provider-1",
                    "name": "Primary",
                    "type": "openai_compatible",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "secret",
                }
            ],
            "roles": [
                {
                    "name": "Steward",
                    "system_prompt": "Default assistant role.",
                    "model": None,
                    "model_params": None,
                    "included_tools": [],
                    "excluded_tools": [],
                }
            ],
        },
        "providers": [
            {
                "id": "provider-1",
                "name": "Primary",
                "type": "openai_compatible",
                "base_url": "https://api.example.com/v1",
                "api_key": "secret",
            }
        ],
        "roles": [
            {
                "name": "Steward",
                "system_prompt": "Default assistant role.",
                "model": None,
                "model_params": None,
                "included_tools": [],
                "excluded_tools": [],
                "is_builtin": True,
            }
        ],
        "version": "1.2.3",
    }


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

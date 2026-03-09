import json

import app.settings as settings_module
from app.agent import Agent
from app.registry import registry
from app.runtime import bootstrap_runtime
from app.settings import (
    WORKER_ROLE_NAME,
    WORKER_ROLE_REQUIRED_TOOLS,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
)


def test_bootstrap_runtime_adds_list_roles_to_conductor(monkeypatch):
    registry.reset()
    monkeypatch.setattr(Agent, "start", lambda self: None)

    bootstrap_runtime()

    try:
        conductor = registry.get("conductor")

        assert conductor is not None
        assert "list_roles" in conductor.config.tools
    finally:
        registry.reset()


def test_bootstrap_runtime_creates_builtin_worker_role(monkeypatch, tmp_path):
    registry.reset()
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Agent, "start", lambda self: None)
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        settings = settings_module.get_settings()

        assert settings.roles == [
            RoleConfig(
                name=WORKER_ROLE_NAME,
                system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
                required_tools=WORKER_ROLE_REQUIRED_TOOLS,
            )
        ]

    finally:
        registry.reset()


def test_bootstrap_runtime_keeps_existing_worker_role(monkeypatch, tmp_path):
    registry.reset()
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [
                    {
                        "name": WORKER_ROLE_NAME,
                        "system_prompt": "Custom worker prompt.",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Agent, "start", lambda self: None)
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        settings = settings_module.get_settings()

        assert settings.roles == [
            RoleConfig(
                name=WORKER_ROLE_NAME,
                system_prompt="Custom worker prompt.",
            )
        ]
    finally:
        registry.reset()

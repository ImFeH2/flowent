import json

import app.settings as settings_module
from app.agent import Agent
from app.registry import registry
from app.runtime import bootstrap_runtime
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    STEWARD_ROLE_NAME,
    STEWARD_ROLE_SYSTEM_PROMPT,
    WORKER_ROLE_INCLUDED_TOOLS,
    WORKER_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
)


def test_bootstrap_runtime_creates_only_assistant_with_create_root(
    monkeypatch,
    tmp_path,
):
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
        nodes = registry.get_all()
        assistant = registry.get("assistant")

        assert len(nodes) == 1
        assert assistant is not None
        assert assistant.config.node_type.value == "assistant"
        assert assistant.config.name == "Assistant"
        assert assistant.config.role_name == STEWARD_ROLE_NAME
        assert assistant.config.tools == [
            "create_root",
            "manage_providers",
            "manage_roles",
            "manage_settings",
            "manage_prompts",
        ]
        assert assistant.config.write_dirs == []
        assert assistant.config.allow_network is True
        assert assistant.config.parent_id == "human"
    finally:
        registry.reset()


def test_bootstrap_runtime_creates_builtin_worker_and_conductor_roles(
    monkeypatch,
    tmp_path,
):
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
                name=STEWARD_ROLE_NAME,
                system_prompt=STEWARD_ROLE_SYSTEM_PROMPT,
                included_tools=[],
            ),
            RoleConfig(
                name=WORKER_ROLE_NAME,
                system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
                included_tools=WORKER_ROLE_INCLUDED_TOOLS,
            ),
            RoleConfig(
                name=CONDUCTOR_ROLE_NAME,
                system_prompt=CONDUCTOR_ROLE_SYSTEM_PROMPT,
                included_tools=CONDUCTOR_ROLE_INCLUDED_TOOLS,
            ),
        ]
    finally:
        registry.reset()


def test_bootstrap_runtime_reconciles_existing_builtin_roles(monkeypatch, tmp_path):
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
                        "included_tools": [],
                        "excluded_tools": ["fetch"],
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
                name=STEWARD_ROLE_NAME,
                system_prompt=STEWARD_ROLE_SYSTEM_PROMPT,
                included_tools=[],
            ),
            RoleConfig(
                name=WORKER_ROLE_NAME,
                system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
                included_tools=WORKER_ROLE_INCLUDED_TOOLS,
            ),
            RoleConfig(
                name=CONDUCTOR_ROLE_NAME,
                system_prompt=CONDUCTOR_ROLE_SYSTEM_PROMPT,
                included_tools=CONDUCTOR_ROLE_INCLUDED_TOOLS,
            ),
        ]
    finally:
        registry.reset()


def test_bootstrap_runtime_uses_configured_assistant_role(monkeypatch, tmp_path):
    registry.reset()
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "assistant": {"role_name": "Reviewer"},
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [
                    {
                        "name": "Reviewer",
                        "system_prompt": "Review everything.",
                        "included_tools": [],
                        "excluded_tools": [],
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
        assistant = registry.get("assistant")
        assert assistant is not None
        assert assistant.config.role_name == "Reviewer"
        assert settings_module.get_settings().assistant.role_name == "Reviewer"
    finally:
        registry.reset()


def test_bootstrap_runtime_falls_back_to_steward_when_assistant_role_missing(
    monkeypatch,
    tmp_path,
):
    registry.reset()
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "assistant": {"role_name": "Ghost"},
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
        assistant = registry.get("assistant")
        assert assistant is not None
        assert assistant.config.role_name == STEWARD_ROLE_NAME
        assert settings_module.get_settings().assistant.role_name == STEWARD_ROLE_NAME
    finally:
        registry.reset()

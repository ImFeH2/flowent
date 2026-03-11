import json

import app.settings as settings_module
from app.agent import Agent
from app.registry import registry
from app.runtime import bootstrap_runtime
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    WORKER_ROLE_INCLUDED_TOOLS,
    WORKER_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
)


def test_bootstrap_runtime_creates_only_steward_with_create_root(
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
        steward = registry.get("steward")

        assert len(nodes) == 1
        assert steward is not None
        assert steward.config.node_type.value == "steward"
        assert steward.config.tools == ["create_root"]
        assert steward.config.write_dirs == []
        assert steward.config.allow_network is True
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


def test_bootstrap_runtime_keeps_steward_boundary_independent_of_root_boundary(
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
                "root_boundary": {
                    "write_dirs": [str(tmp_path / "workspace")],
                    "allow_network": False,
                },
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
        steward = registry.get("steward")

        assert len(nodes) == 1
        assert steward is not None
        assert steward.config.write_dirs == []
        assert steward.config.allow_network is True
    finally:
        registry.reset()

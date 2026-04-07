import json
import os
from uuid import UUID

import app.settings as settings_module
from app.agent import Agent
from app.models import StateEntry
from app.registry import registry
from app.runtime import bootstrap_runtime
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    STEWARD_ROLE_INCLUDED_TOOLS,
    STEWARD_ROLE_NAME,
    STEWARD_ROLE_SYSTEM_PROMPT,
    WORKER_ROLE_INCLUDED_TOOLS,
    WORKER_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
)


def test_bootstrap_runtime_creates_only_assistant(
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
        assistant = registry.get_assistant()

        assert len(nodes) == 1
        assert assistant is not None
        assert str(UUID(assistant.uuid)) == assistant.uuid
        assert assistant.config.node_type.value == "assistant"
        assert assistant.config.name == "Assistant"
        assert assistant.config.role_name == STEWARD_ROLE_NAME
        assert assistant.config.tools == list(STEWARD_ROLE_INCLUDED_TOOLS)
        assert assistant.config.write_dirs == [os.getcwd()]
        assert assistant.config.allow_network is True
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
                included_tools=STEWARD_ROLE_INCLUDED_TOOLS,
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
                included_tools=STEWARD_ROLE_INCLUDED_TOOLS,
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
        assistant = registry.get_assistant()
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
        assistant = registry.get_assistant()
        assert assistant is not None
        assert assistant.config.role_name == STEWARD_ROLE_NAME
        assert settings_module.get_settings().assistant.role_name == STEWARD_ROLE_NAME
    finally:
        registry.reset()


def test_bootstrap_runtime_backfills_state_history_for_restored_nodes(
    monkeypatch,
    tmp_path,
):
    registry.reset()
    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
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
    workspace_file.write_text(
        json.dumps(
            {
                "tabs": [
                    {
                        "id": "tab-1",
                        "title": "Restore",
                        "goal": "",
                        "created_at": 1,
                        "updated_at": 1,
                    }
                ],
                "nodes": [
                    {
                        "id": "node-1",
                        "config": {
                            "node_type": "agent",
                            "role_name": "Worker",
                            "tab_id": "tab-1",
                            "name": "Restored Worker",
                            "tools": [],
                            "write_dirs": [],
                            "allow_network": False,
                        },
                        "state": "idle",
                        "todos": [],
                        "history": [],
                        "position": None,
                        "created_at": 1,
                        "updated_at": 1,
                    }
                ],
                "edges": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(Agent, "start", lambda self: None)
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        restored = registry.get("node-1")
        assert restored is not None
        assert any(
            isinstance(entry, StateEntry) and entry.state == "idle"
            for entry in restored.history
        )
    finally:
        registry.reset()

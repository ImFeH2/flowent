import json
import os
from uuid import UUID

import app.settings as settings_module
from app.agent import Agent
from app.models import AgentState, StateEntry
from app.registry import registry
from app.runtime import bootstrap_runtime, shutdown_runtime
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
from app.workspace_store import workspace_store


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


def _stop_all_agents(timeout: float = 1.0) -> None:
    for node in list(registry.get_all()):
        node.request_termination("test cleanup")
    for node in list(registry.get_all()):
        node.wait_for_termination(timeout=timeout)
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
        assert restored.state == AgentState.IDLE
        assert any(
            isinstance(entry, StateEntry) and entry.state == "idle"
            for entry in restored.history
        )
    finally:
        registry.reset()


def test_bootstrap_runtime_restores_running_nodes_as_idle(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
    registry.reset()
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
                        "state": "running",
                        "todos": [{"text": "resume me"}],
                        "history": [
                            {
                                "type": "StateEntry",
                                "state": "running",
                                "reason": "before restart",
                            }
                        ],
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
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        restored = registry.get("node-1")
        assert restored is not None
        assert restored.wait_until_idle(timeout=1.0) is True
        assert restored.state == AgentState.IDLE
        assert restored.uuid == "node-1"
        assert [todo.text for todo in restored.todos] == ["resume me"]
        assert any(
            isinstance(entry, StateEntry)
            and entry.state == "idle"
            and entry.reason == "restored"
            for entry in restored.history
        )
        persisted = workspace_store.get_node_record("node-1")
        assert persisted is not None
        assert persisted.state == AgentState.IDLE
    finally:
        _stop_all_agents()


def test_bootstrap_runtime_preserves_error_state_for_restored_nodes(
    monkeypatch,
    tmp_path,
):
    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
    registry.reset()
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
                            "name": "Broken Worker",
                            "tools": [],
                            "write_dirs": [],
                            "allow_network": False,
                        },
                        "state": "error",
                        "todos": [],
                        "history": [
                            {
                                "type": "StateEntry",
                                "state": "error",
                                "reason": "provider failure",
                            }
                        ],
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
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        restored = registry.get("node-1")
        assert restored is not None
        assert restored.state == AgentState.ERROR
        assert restored.wait_until_idle(timeout=0.05) is False
        assert not any(
            isinstance(entry, StateEntry)
            and entry.state == "idle"
            and entry.reason == "initialized, awaiting first message"
            for entry in restored.history
        )
        persisted = workspace_store.get_node_record("node-1")
        assert persisted is not None
        assert persisted.state == AgentState.ERROR
    finally:
        _stop_all_agents()


def test_bootstrap_runtime_skips_terminated_restored_nodes(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
    registry.reset()
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
                            "name": "Finished Worker",
                            "tools": [],
                            "write_dirs": [],
                            "allow_network": False,
                        },
                        "state": "terminated",
                        "todos": [],
                        "history": [
                            {
                                "type": "StateEntry",
                                "state": "terminated",
                                "reason": "done",
                            }
                        ],
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
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    bootstrap_runtime()

    try:
        assert registry.get("node-1") is None
        persisted = workspace_store.get_node_record("node-1")
        assert persisted is not None
        assert persisted.state == AgentState.TERMINATED
    finally:
        _stop_all_agents()


def test_shutdown_runtime_keeps_persistent_workspace_nodes_unterminated(
    monkeypatch,
    tmp_path,
):
    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
    registry.reset()
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
                            "name": "Persistent Worker",
                            "tools": [],
                            "write_dirs": [],
                            "allow_network": False,
                        },
                        "state": "idle",
                        "todos": [],
                        "history": [
                            {
                                "type": "StateEntry",
                                "state": "idle",
                                "reason": "restored",
                            }
                        ],
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
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)
    monkeypatch.setattr(Agent, "start", lambda self: None)

    terminated: list[str] = []

    def fake_terminate_and_wait(self: Agent, timeout: float = 10.0) -> None:
        terminated.append(self.uuid)

    monkeypatch.setattr(Agent, "terminate_and_wait", fake_terminate_and_wait)

    bootstrap_runtime()
    shutdown_runtime()

    try:
        assert len(terminated) == 1
        assert terminated[0] != "node-1"
        persisted = workspace_store.get_node_record("node-1")
        assert persisted is not None
        assert persisted.state == AgentState.IDLE
    finally:
        registry.reset()

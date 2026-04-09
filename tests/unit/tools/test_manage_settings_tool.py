import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.settings import (
    AssistantSettings,
    EventLogSettings,
    ModelSettings,
    RoleConfig,
    Settings,
)
from app.tools.manage_settings import ManageSettingsTool


def test_manage_settings_get_returns_current_settings(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(
        assistant=AssistantSettings(role_name="Steward"),
        event_log=EventLogSettings(timestamp_format="relative"),
        model=ModelSettings(active_provider_id="provider-1", active_model="gpt-4o"),
    )

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(ManageSettingsTool().execute(agent, {"action": "get"}))

    assert result == {
        "assistant": {
            "role_name": "Steward",
        },
        "model": {
            "active_provider_id": "provider-1",
            "active_model": "gpt-4o",
            "timeout_ms": 10000,
            "max_retries": 5,
            "params": {
                "reasoning_effort": None,
                "verbosity": None,
                "max_output_tokens": None,
                "temperature": None,
                "top_p": None,
            },
        },
        "event_log": {
            "timestamp_format": "relative",
        },
    }


def test_manage_settings_update_changes_active_provider_and_model(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()
    saved: list[Settings] = []
    invalidations: list[str] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr(
        "app.providers.gateway.gateway.invalidate_cache",
        lambda: invalidations.append("invalidate"),
    )

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "active_provider_id": "provider-2",
                "active_model": "gpt-4.1",
            },
        )
    )

    assert result["model"] == {
        "active_provider_id": "provider-2",
        "active_model": "gpt-4.1",
        "timeout_ms": 10000,
        "max_retries": 5,
        "params": {
            "reasoning_effort": None,
            "verbosity": None,
            "max_output_tokens": None,
            "temperature": None,
            "top_p": None,
        },
    }
    assert settings.model.active_provider_id == "provider-2"
    assert settings.model.active_model == "gpt-4.1"
    assert saved == [settings]
    assert invalidations == ["invalidate"]


def test_manage_settings_update_changes_assistant_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(
        roles=[
            RoleConfig(name="Steward", system_prompt="Default assistant role."),
            RoleConfig(name="Reviewer", system_prompt="Review carefully."),
        ]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "assistant_role_name": "Reviewer",
            },
        )
    )

    assert result["assistant"] == {"role_name": "Reviewer"}
    assert settings.assistant.role_name == "Reviewer"
    assert saved == [settings]


def test_manage_settings_update_changes_max_retries(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app.settings.save_settings", lambda current: None)
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "max_retries": 7,
            },
        )
    )

    assert result["model"]["max_retries"] == 7
    assert settings.model.max_retries == 7


def test_manage_settings_update_changes_timeout_ms(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app.settings.save_settings", lambda current: None)
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "timeout_ms": 15000,
            },
        )
    )

    assert result["model"]["timeout_ms"] == 15000
    assert settings.model.timeout_ms == 15000


def test_manage_settings_update_rejects_non_positive_timeout_ms(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "timeout_ms": 0,
            },
        )
    )

    assert result == {"error": "timeout_ms must be greater than 0"}


def test_manage_settings_update_rejects_unknown_assistant_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(roles=[RoleConfig(name="Steward", system_prompt="Default.")])

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "assistant_role_name": "Ghost",
            },
        )
    )

    assert result == {"error": "Role 'Ghost' not found"}


def test_manage_settings_update_accepts_xhigh_reasoning_effort(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app.settings.save_settings", lambda current: None)
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "model_params": {"reasoning_effort": "xhigh"},
            },
        )
    )

    assert result["model"]["params"]["reasoning_effort"] == "xhigh"
    assert settings.model.params.reasoning_effort == "xhigh"

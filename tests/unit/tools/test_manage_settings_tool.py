import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.settings import (
    AssistantSettings,
    EventLogSettings,
    LeaderSettings,
    ModelSettings,
    RoleConfig,
    Settings,
    build_assistant_write_dirs,
)
from app.tools.manage_settings import ManageSettingsTool


def test_manage_settings_get_returns_current_settings(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(
        assistant=AssistantSettings(
            role_name="Steward",
            allow_network=False,
            write_dirs=["/tmp/workspace", "/tmp/output"],
        ),
        leader=LeaderSettings(role_name="Conductor"),
        event_log=EventLogSettings(timestamp_format="relative"),
        model=ModelSettings(active_provider_id="provider-1", active_model="gpt-4o"),
    )

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(ManageSettingsTool().execute(agent, {"action": "get"}))

    assert result == {
        "assistant": {
            "role_name": "Steward",
            "allow_network": False,
            "write_dirs": ["/tmp/workspace", "/tmp/output"],
        },
        "leader": {
            "role_name": "Conductor",
        },
        "model": {
            "active_provider_id": "provider-1",
            "active_model": "gpt-4o",
            "timeout_ms": 10000,
            "retry_policy": "limited",
            "max_retries": 5,
            "retry_initial_delay_seconds": 0.5,
            "retry_max_delay_seconds": 8.0,
            "retry_backoff_cap_retries": 5,
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
        "retry_policy": "limited",
        "max_retries": 5,
        "retry_initial_delay_seconds": 0.5,
        "retry_max_delay_seconds": 8.0,
        "retry_backoff_cap_retries": 5,
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
    expected_write_dirs = list(settings.assistant.write_dirs)
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

    assert result["assistant"] == {
        "role_name": "Reviewer",
        "allow_network": True,
        "write_dirs": expected_write_dirs,
    }
    assert settings.assistant.role_name == "Reviewer"
    assert saved == [settings]


def test_manage_settings_update_changes_assistant_permissions(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()
    expected_write_dirs = build_assistant_write_dirs([" ./tmp ", "./tmp/", ""])

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app.settings.save_settings", lambda current: None)
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "assistant_allow_network": False,
                "assistant_write_dirs": [" ./tmp ", "./tmp/", ""],
            },
        )
    )

    assert result["assistant"] == {
        "role_name": "Steward",
        "allow_network": False,
        "write_dirs": expected_write_dirs,
    }
    assert settings.assistant.allow_network is False
    assert settings.assistant.write_dirs == expected_write_dirs


def test_manage_settings_update_changes_leader_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(
        roles=[
            RoleConfig(name="Conductor", system_prompt="Default leader role."),
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
                "leader_role_name": "Reviewer",
            },
        )
    )

    assert result["leader"] == {"role_name": "Reviewer"}
    assert settings.leader.role_name == "Reviewer"
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


def test_manage_settings_update_changes_retry_policy(monkeypatch):
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
                "retry_policy": "unlimited",
            },
        )
    )

    assert result["model"]["retry_policy"] == "unlimited"
    assert settings.model.retry_policy == "unlimited"


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


def test_manage_settings_update_changes_retry_backoff(monkeypatch):
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
                "retry_initial_delay_seconds": 0.75,
                "retry_max_delay_seconds": 12.0,
                "retry_backoff_cap_retries": 3,
            },
        )
    )

    assert result["model"]["retry_initial_delay_seconds"] == 0.75
    assert result["model"]["retry_max_delay_seconds"] == 12.0
    assert result["model"]["retry_backoff_cap_retries"] == 3
    assert settings.model.retry_initial_delay_seconds == 0.75
    assert settings.model.retry_max_delay_seconds == 12.0
    assert settings.model.retry_backoff_cap_retries == 3


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


def test_manage_settings_update_rejects_invalid_retry_policy(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "retry_policy": "forever",
            },
        )
    )

    assert result == {
        "error": "retry_policy must be one of: limited, no_retry, unlimited"
    }


def test_manage_settings_update_rejects_retry_backoff_when_max_below_initial(
    monkeypatch,
):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()
    original_retry_initial_delay_seconds = settings.model.retry_initial_delay_seconds
    original_retry_max_delay_seconds = settings.model.retry_max_delay_seconds

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "retry_initial_delay_seconds": 2.0,
                "retry_max_delay_seconds": 1.0,
            },
        )
    )

    assert result == {
        "error": "model.retry_max_delay_seconds must be greater than or equal to model.retry_initial_delay_seconds"
    }
    assert (
        settings.model.retry_initial_delay_seconds
        == original_retry_initial_delay_seconds
    )
    assert settings.model.retry_max_delay_seconds == original_retry_max_delay_seconds


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


def test_manage_settings_update_rejects_invalid_assistant_allow_network(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings()

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "assistant_allow_network": "yes",
            },
        )
    )

    assert result == {"error": "assistant_allow_network must be a boolean"}


def test_manage_settings_update_rejects_unknown_leader_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT, tools=["manage_settings"]))
    settings = Settings(roles=[RoleConfig(name="Conductor", system_prompt="Default.")])

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "leader_role_name": "Ghost",
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

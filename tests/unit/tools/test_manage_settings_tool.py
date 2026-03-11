import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.settings import (
    EventLogSettings,
    ModelSettings,
    RootBoundary,
    Settings,
)
from app.tools.manage_settings import ManageSettingsTool


def test_manage_settings_get_returns_current_settings(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_settings"]))
    settings = Settings(
        event_log=EventLogSettings(timestamp_format="relative"),
        model=ModelSettings(active_provider_id="provider-1", active_model="gpt-4o"),
        root_boundary=RootBoundary(
            write_dirs=["/project/workspace"], allow_network=True
        ),
    )

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(ManageSettingsTool().execute(agent, {"action": "get"}))

    assert result == {
        "model": {
            "active_provider_id": "provider-1",
            "active_model": "gpt-4o",
        },
        "event_log": {
            "timestamp_format": "relative",
        },
        "root_boundary": {
            "write_dirs": ["/project/workspace"],
            "allow_network": True,
        },
    }


def test_manage_settings_update_changes_active_provider_and_model(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_settings"]))
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
    }
    assert settings.model.active_provider_id == "provider-2"
    assert settings.model.active_model == "gpt-4.1"
    assert saved == [settings]
    assert invalidations == ["invalidate"]


def test_manage_settings_update_merges_root_boundary(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_settings"]))
    settings = Settings(
        root_boundary=RootBoundary(
            write_dirs=["/project/workspace"],
            allow_network=False,
        )
    )

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app.settings.save_settings", lambda current: None)
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = json.loads(
        ManageSettingsTool().execute(
            agent,
            {
                "action": "update",
                "root_boundary": {"allow_network": True},
            },
        )
    )

    assert result["root_boundary"] == {
        "write_dirs": ["/project/workspace"],
        "allow_network": True,
    }
    assert settings.root_boundary.write_dirs == ["/project/workspace"]
    assert settings.root_boundary.allow_network is True

import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.settings import Settings
from app.tools.manage_prompts import ManagePromptsTool


def test_manage_prompts_get_returns_current_prompt(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_prompts"]))
    settings = Settings(custom_prompt="Be concise.")

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(ManagePromptsTool().execute(agent, {"action": "get"}))

    assert result == {"custom_prompt": "Be concise."}


def test_manage_prompts_update_saves_custom_prompt(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_prompts"]))
    settings = Settings(custom_prompt="")
    saved: list[Settings] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )

    result = json.loads(
        ManagePromptsTool().execute(
            agent,
            {
                "action": "update",
                "custom_prompt": "Always prefer terse answers.",
            },
        )
    )

    assert result == {"custom_prompt": "Always prefer terse answers."}
    assert settings.custom_prompt == "Always prefer terse answers."
    assert saved == [settings]


def test_manage_prompts_update_requires_custom_prompt(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_prompts"]))
    monkeypatch.setattr("app.settings.get_settings", lambda: Settings())

    result = json.loads(
        ManagePromptsTool().execute(
            agent,
            {"action": "update"},
        )
    )

    assert result == {"error": "custom_prompt is required"}

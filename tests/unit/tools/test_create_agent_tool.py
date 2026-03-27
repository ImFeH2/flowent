import json

import pytest

from app.agent import Agent
from app.graph_service import create_tab
from app.models import NodeConfig, NodeType
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools.create_agent import CreateAgentTool
from app.workspace_store import workspace_store


@pytest.fixture(autouse=True)
def reset_runtime_state(monkeypatch, tmp_path):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    settings_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)
    registry.reset()
    workspace_store.reset_cache()
    yield
    registry.reset()
    workspace_store.reset_cache()
    monkeypatch.setattr(settings_module, "_cached_settings", None)


def test_create_agent_defaults_to_current_tab(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="Do work.",
                    included_tools=["read"],
                )
            ]
        ),
    )
    tab = create_tab(title="Task", goal="Do work")

    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=["create_agent"],
            write_dirs=["/tmp/workspace"],
            allow_network=False,
        ),
        uuid="owner",
    )
    registry.register(owner)

    result = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "role_name": "Worker",
                "name": "Peer Worker",
            },
        )
    )

    assert result["config"]["tab_id"] == tab.id
    assert result["config"]["name"] == "Peer Worker"


def test_create_agent_rejects_cross_tab_creation_for_non_assistant(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")]),
    )
    tab = create_tab(title="Task", goal="Do work")

    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=["create_agent"],
        ),
        uuid="owner",
    )

    result = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "tab_id": "another-tab",
                "role_name": "Worker",
            },
        )
    )

    assert result == {"error": "A graph node may only create peers inside its own tab"}


def test_create_agent_respects_write_dir_and_network_boundaries(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")]),
    )

    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    disallowed_dir = tmp_path / "disallowed"
    disallowed_dir.mkdir()

    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=create_tab(title="Task", goal="Do work").id,
            tools=["create_agent"],
            write_dirs=[str(allowed_dir)],
            allow_network=False,
        ),
        uuid="owner",
    )

    write_dir_result = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "role_name": "Worker",
                "write_dirs": [str(disallowed_dir)],
            },
        )
    )
    network_result = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "role_name": "Worker",
                "allow_network": True,
            },
        )
    )

    assert write_dir_result == {
        "error": f"write_dirs boundary exceeded: {disallowed_dir}"
    }
    assert network_result == {
        "error": "allow_network boundary exceeded: parent disallows network access"
    }

import json

import pytest

from app.agent import Agent
from app.graph_service import create_tab
from app.models import NodeConfig, NodeType
from app.registry import registry
from app.settings import CONDUCTOR_ROLE_NAME, RoleConfig, Settings
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
        uuid=tab.leader_id,
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
        uuid=tab.leader_id,
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

    assert result == {"error": "A tab Leader may only create peers inside its own tab"}


def test_create_agent_rejects_assistant_for_ordinary_nodes(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[RoleConfig(name="Worker", system_prompt="Do work.")],
        ),
    )
    tab = create_tab(title="Task", goal="Do work")

    assistant = Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name="Steward",
            tools=["create_agent"],
        ),
        uuid="assistant",
    )

    result = json.loads(
        CreateAgentTool().execute(
            assistant,
            {
                "tab_id": tab.id,
                "role_name": "Worker",
            },
        )
    )

    assert result == {"error": "Assistant may not create ordinary task nodes directly"}


def test_create_agent_rejects_non_leader_task_node(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")]),
    )
    tab = create_tab(title="Task", goal="Do work")

    worker = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Worker",
            tab_id=tab.id,
            tools=["create_agent"],
        ),
        uuid="worker",
    )

    result = json.loads(
        CreateAgentTool().execute(
            worker,
            {
                "role_name": "Worker",
            },
        )
    )

    assert result == {"error": "Only a tab Leader may create ordinary task nodes"}


def test_create_agent_rejects_reserved_conductor_role(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[RoleConfig(name=CONDUCTOR_ROLE_NAME, system_prompt="Orchestrate.")],
        ),
    )
    tab = create_tab(title="Task", goal="Do work")

    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=["create_agent"],
        ),
        uuid=tab.leader_id,
    )
    registry.register(leader)

    result = json.loads(
        CreateAgentTool().execute(
            leader,
            {
                "role_name": f" {CONDUCTOR_ROLE_NAME} ",
                "name": "Task Conductor",
            },
        )
    )

    assert result == {
        "error": f"Role '{CONDUCTOR_ROLE_NAME}' is reserved for a tab Leader"
    }


def test_create_agent_respects_write_dir_and_network_boundaries(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")]),
    )

    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    disallowed_dir = tmp_path / "disallowed"
    disallowed_dir.mkdir()
    tab = create_tab(title="Task", goal="Do work")

    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=["create_agent"],
            write_dirs=[str(allowed_dir)],
            allow_network=False,
        ),
        uuid=tab.leader_id,
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

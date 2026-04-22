import json

import pytest

from app.agent import Agent
from app.graph_service import create_tab
from app.models import AgentState, GraphNodeRecord, NodeConfig, NodeType
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


def test_leader_create_agent_defaults_to_current_tab_without_network_edge(
    monkeypatch,
):
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
    assert owner.get_connections_snapshot() == []
    assert workspace_store.list_edges(tab.id) == []


def test_create_agent_places_new_agent_after_anchor(monkeypatch):
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

    anchor = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "role_name": "Worker",
                "name": "Anchor Worker",
            },
        )
    )
    result = json.loads(
        CreateAgentTool().execute(
            owner,
            {
                "role_name": "Worker",
                "name": "Placed Worker",
                "placement": "after",
                "after_node_id": anchor["id"],
            },
        )
    )

    assert result["config"]["tab_id"] == tab.id
    assert owner.get_connections_snapshot() == []
    assert [
        (edge.from_node_id, edge.to_node_id)
        for edge in workspace_store.list_edges(tab.id)
    ] == [(anchor["id"], result["id"])]


def test_create_agent_rejects_assistant_for_ordinary_nodes(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[RoleConfig(name="Worker", system_prompt="Do work.")],
        ),
    )
    create_tab(title="Task", goal="Do work")

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
                "role_name": "Worker",
            },
        )
    )

    assert result == {"error": "Assistant may not create ordinary task nodes directly"}


def test_create_agent_allows_explicitly_granted_task_node(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="Do work.",
                    included_tools=["create_agent"],
                )
            ],
        ),
    )
    tab = create_tab(title="Task", goal="Do work")

    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=["create_agent"],
            write_dirs=["/tmp/workspace"],
            allow_network=True,
        ),
        uuid=tab.leader_id,
    )
    registry.register(leader)
    creator = json.loads(
        CreateAgentTool().execute(
            leader,
            {
                "role_name": "Worker",
                "name": "Creator Worker",
            },
        )
    )
    creator_node = registry.get(creator["id"])
    assert creator_node is not None

    result = json.loads(
        CreateAgentTool().execute(
            creator_node,
            {
                "role_name": "Worker",
                "name": "Nested Worker",
            },
        )
    )

    assert result["config"]["tab_id"] == tab.id
    assert result["config"]["name"] == "Nested Worker"
    assert creator_node.get_connections_snapshot() == []
    assert workspace_store.list_edges(tab.id) == []


def test_create_agent_rejects_task_node_without_tool(monkeypatch):
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
            tools=[],
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

    assert result == {"error": "create_agent is not enabled for this node"}


def test_create_agent_rejects_tab_id_parameter(monkeypatch):
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
                "tab_id": tab.id,
                "role_name": "Worker",
            },
        )
    )

    assert result == {"error": "create_agent does not accept tab_id"}


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


def test_create_agent_also_respects_tab_leader_boundaries(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")]),
    )

    leader_dir = tmp_path / "leader"
    leader_dir.mkdir()
    creator_dir = tmp_path / "creator"
    creator_dir.mkdir()
    creator_child = creator_dir / "child"
    creator_child.mkdir()
    tab = create_tab(title="Task", goal="Do work")

    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            tools=[],
            write_dirs=[str(leader_dir)],
            allow_network=False,
        ),
        uuid=tab.leader_id,
    )
    creator = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Worker",
            tab_id=tab.id,
            tools=["create_agent"],
            write_dirs=[str(creator_dir)],
            allow_network=True,
        ),
        uuid="worker",
    )
    registry.register(leader)
    registry.register(creator)
    workspace_store.upsert_node_record(
        GraphNodeRecord(
            id=leader.uuid,
            config=leader.config,
            state=AgentState.INITIALIZING,
        )
    )
    workspace_store.upsert_node_record(
        GraphNodeRecord(
            id=creator.uuid,
            config=creator.config,
            state=AgentState.INITIALIZING,
        )
    )

    write_dir_result = json.loads(
        CreateAgentTool().execute(
            creator,
            {
                "role_name": "Worker",
                "write_dirs": [str(creator_child)],
            },
        )
    )
    network_result = json.loads(
        CreateAgentTool().execute(
            creator,
            {
                "role_name": "Worker",
                "allow_network": True,
            },
        )
    )

    assert write_dir_result == {
        "error": f"write_dirs boundary exceeded: {creator_child}"
    }
    assert network_result == {
        "error": "allow_network boundary exceeded: tab Leader disallows network access"
    }


def test_create_agent_rejects_removed_connect_to_creator_parameter(monkeypatch):
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
                "role_name": "Worker",
                "connect_to_creator": "yes",
            },
        )
    )

    assert result == {
        "error": "create_agent no longer supports connect_to_creator; use placement"
    }


def test_create_agent_tool_schema_exposes_workflow_placement_options():
    assert CreateAgentTool.parameters == {
        "type": "object",
        "properties": {
            "role_name": {
                "type": "string",
                "description": "Role assigned to the new agent",
            },
            "name": {
                "type": "string",
                "description": "Optional human-readable node name",
            },
            "tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional additional tools",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional writable directories",
            },
            "allow_network": {
                "type": "boolean",
                "description": "Whether the node can access the network",
                "default": False,
            },
            "placement": {
                "type": "string",
                "enum": ["standalone", "after", "between"],
                "description": (
                    "How to place the new agent inside the current workflow graph"
                ),
                "default": "standalone",
            },
            "after_node_id": {
                "type": "string",
                "description": "Anchor node id when placement is `after`",
            },
            "between_from_node_id": {
                "type": "string",
                "description": "Upstream node id when placement is `between`",
            },
            "between_to_node_id": {
                "type": "string",
                "description": "Downstream node id when placement is `between`",
            },
        },
        "required": ["role_name"],
    }

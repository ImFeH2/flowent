import json

import pytest

from app.agent import Agent
from app.models import AgentState, Formation, NodeConfig, NodeType
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools.connect import ConnectTool
from app.tools.create_formation import CreateFormationTool


@pytest.fixture(autouse=True)
def reset_registry():
    registry.reset()
    yield
    registry.reset()


def test_create_formation_registers_child_formation_for_owner():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["create_formation"],
        ),
        uuid="owner",
    )
    registry.register(owner)
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )

    result = json.loads(
        CreateFormationTool().execute(
            owner,
            {
                "name": "Research Cluster",
                "goal": "Investigate multiple websites",
            },
        )
    )

    formation = registry.get_formation(result["id"])
    assert formation is not None
    assert formation.owner_agent_id == "owner"
    assert formation.parent_formation_id == "formation-root"
    assert formation.name == "Research Cluster"
    assert formation.goal == "Investigate multiple websites"


def test_create_formation_supports_declarative_nodes_and_edges(monkeypatch):
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["create_formation", "spawn", "connect", "read", "exec"],
            write_dirs=["/tmp/workspace"],
            allow_network=True,
        ),
        uuid="owner",
    )
    registry.register(owner)
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(name="Worker", system_prompt="...", included_tools=["read"]),
                RoleConfig(
                    name="Reviewer",
                    system_prompt="...",
                    included_tools=["exec"],
                ),
            ]
        ),
    )

    def fake_start(self: Agent) -> None:
        self.set_state(AgentState.IDLE, "test start", force_emit=True)

    monkeypatch.setattr(Agent, "start", fake_start)

    result = json.loads(
        CreateFormationTool().execute(
            owner,
            {
                "name": "Delivery Plan",
                "goal": "Coordinate execution",
                "nodes": [
                    {"name": "Planner", "role": "Worker", "tools": ["exec"]},
                    {"name": "Researcher", "role": "Worker"},
                    {"name": "Reviewer", "role": "Reviewer"},
                ],
                "edges": [
                    {"from": "Planner", "to": "Researcher"},
                    {"from": "Researcher", "to": "Reviewer", "bidirectional": True},
                ],
            },
        )
    )

    formation = registry.get_formation(result["id"])
    assert formation is not None
    assert result["name"] == "Delivery Plan"
    assert result["goal"] == "Coordinate execution"
    assert result["nodes"] == [
        {
            "agent_id": result["nodes"][0]["agent_id"],
            "name": "Planner",
            "formation_id": result["id"],
            "role_name": "Worker",
        },
        {
            "agent_id": result["nodes"][1]["agent_id"],
            "name": "Researcher",
            "formation_id": result["id"],
            "role_name": "Worker",
        },
        {
            "agent_id": result["nodes"][2]["agent_id"],
            "name": "Reviewer",
            "formation_id": result["id"],
            "role_name": "Reviewer",
        },
    ]
    assert result["edges"] == [
        {"from": "Planner", "to": "Researcher", "bidirectional": False},
        {"from": "Researcher", "to": "Reviewer", "bidirectional": True},
    ]

    planner = registry.find_by_name("Planner")
    researcher = registry.find_by_name("Researcher")
    reviewer = registry.find_by_name("Reviewer")

    assert planner is not None
    assert researcher is not None
    assert reviewer is not None
    assert {node.uuid for node in registry.get_formation_nodes(result["id"])} == {
        planner.uuid,
        researcher.uuid,
        reviewer.uuid,
    }

    for child in (planner, researcher, reviewer):
        assert owner.is_connected_to(child.uuid) is True
        assert child.is_connected_to(owner.uuid) is True
        assert child.config.formation_id == result["id"]
        assert child.state == AgentState.IDLE

    assert planner.is_connected_to(researcher.uuid) is True
    assert researcher.is_connected_to(planner.uuid) is False
    assert researcher.is_connected_to(reviewer.uuid) is True
    assert reviewer.is_connected_to(researcher.uuid) is True


def test_create_formation_rejects_duplicate_node_names_before_creating_anything(
    monkeypatch,
):
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["create_formation", "spawn"],
        ),
        uuid="owner",
    )
    registry.register(owner)
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="...")]),
    )

    result = json.loads(
        CreateFormationTool().execute(
            owner,
            {
                "name": "Broken Formation",
                "nodes": [
                    {"name": "Planner", "role": "Worker"},
                    {"name": "Planner", "role": "Worker"},
                ],
            },
        )
    )

    assert result == {"error": "nodes contains duplicate name 'Planner'"}
    assert [formation.id for formation in registry.get_all_formations()] == [
        "formation-root"
    ]
    assert [node.uuid for node in registry.get_all()] == ["owner"]


def test_create_formation_rejects_unknown_edge_targets_before_creating_anything(
    monkeypatch,
):
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["create_formation", "spawn", "connect"],
        ),
        uuid="owner",
    )
    registry.register(owner)
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="...")]),
    )

    result = json.loads(
        CreateFormationTool().execute(
            owner,
            {
                "name": "Broken Formation",
                "nodes": [{"name": "Planner", "role": "Worker"}],
                "edges": [{"from": "Planner", "to": "Missing"}],
            },
        )
    )

    assert result == {"error": "edges references unknown node 'Missing'"}
    assert [formation.id for formation in registry.get_all_formations()] == [
        "formation-root"
    ]
    assert [node.uuid for node in registry.get_all()] == ["owner"]


def test_connect_is_directional_by_default():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    worker = Agent(
        NodeConfig(node_type=NodeType.AGENT, formation_id="formation-root"),
        uuid="worker",
    )
    sink = Agent(
        NodeConfig(node_type=NodeType.AGENT, formation_id="formation-root"),
        uuid="sink",
    )
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )
    registry.register(owner)
    registry.register(worker)
    registry.register(sink)

    connect_result = json.loads(
        ConnectTool().execute(
            owner,
            {"from": "worker", "to": "sink"},
        )
    )

    assert connect_result == {"connected": [["worker", "sink"]]}
    assert worker.is_connected_to("sink") is True
    assert sink.is_connected_to("worker") is False


def test_connect_supports_bidirectional_edges():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    worker = Agent(
        NodeConfig(node_type=NodeType.AGENT, formation_id="formation-root"),
        uuid="worker",
    )
    sink = Agent(
        NodeConfig(node_type=NodeType.AGENT, formation_id="formation-root"),
        uuid="sink",
    )
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )
    registry.register(owner)
    registry.register(worker)
    registry.register(sink)

    connect_result = json.loads(
        ConnectTool().execute(
            owner,
            {"from": "worker", "to": "sink", "bidirectional": True},
        )
    )

    assert connect_result == {"connected": [["worker", "sink"], ["sink", "worker"]]}
    assert worker.is_connected_to("sink") is True
    assert sink.is_connected_to("worker") is True


def test_connect_rejects_unmanaged_targets():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    foreign = Agent(
        NodeConfig(node_type=NodeType.AGENT, formation_id="formation-foreign"),
        uuid="foreign",
    )
    registry.register_formation(
        Formation(
            id="formation-root",
            owner_agent_id="owner",
            name="Root Formation",
        )
    )
    registry.register_formation(
        Formation(
            id="formation-foreign",
            owner_agent_id="foreign",
            name="Foreign Formation",
        )
    )
    registry.register(owner)
    registry.register(foreign)

    result = json.loads(
        ConnectTool().execute(
            owner,
            {"from": "owner", "to": "foreign"},
        )
    )

    assert result == {"error": "Cannot manage target node 'foreign'"}

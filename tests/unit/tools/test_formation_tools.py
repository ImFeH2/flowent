import json

import pytest

from app.agent import Agent
from app.models import Formation, NodeConfig, NodeType
from app.registry import registry
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

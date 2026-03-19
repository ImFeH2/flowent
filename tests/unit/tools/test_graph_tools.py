import json

import pytest

from app.agent import Agent
from app.models import Graph, NodeConfig, NodeType
from app.registry import registry
from app.tools.connect import ConnectTool
from app.tools.create_graph import CreateGraphTool


@pytest.fixture(autouse=True)
def reset_registry():
    registry.reset()
    yield
    registry.reset()


def test_create_graph_registers_child_graph_for_owner():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            graph_id="graph-root",
            tools=["create_graph"],
        ),
        uuid="owner",
    )
    registry.register(owner)
    registry.register_graph(
        Graph(
            id="graph-root",
            owner_agent_id="owner",
            name="Root Graph",
            entry_node_id="owner",
        )
    )

    result = json.loads(
        CreateGraphTool().execute(
            owner,
            {
                "name": "Research Cluster",
                "goal": "Investigate multiple websites",
            },
        )
    )

    graph = registry.get_graph(result["id"])
    assert graph is not None
    assert graph.owner_agent_id == "owner"
    assert graph.parent_graph_id == "graph-root"
    assert graph.name == "Research Cluster"
    assert graph.goal == "Investigate multiple websites"


def test_connect_is_directional_by_default():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            graph_id="graph-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    worker = Agent(
        NodeConfig(node_type=NodeType.AGENT, graph_id="graph-root"),
        uuid="worker",
    )
    sink = Agent(
        NodeConfig(node_type=NodeType.AGENT, graph_id="graph-root"),
        uuid="sink",
    )
    registry.register_graph(
        Graph(
            id="graph-root",
            owner_agent_id="owner",
            name="Root Graph",
            entry_node_id="owner",
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
            graph_id="graph-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    worker = Agent(
        NodeConfig(node_type=NodeType.AGENT, graph_id="graph-root"),
        uuid="worker",
    )
    sink = Agent(
        NodeConfig(node_type=NodeType.AGENT, graph_id="graph-root"),
        uuid="sink",
    )
    registry.register_graph(
        Graph(
            id="graph-root",
            owner_agent_id="owner",
            name="Root Graph",
            entry_node_id="owner",
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
            graph_id="graph-root",
            tools=["connect"],
        ),
        uuid="owner",
    )
    foreign = Agent(
        NodeConfig(node_type=NodeType.AGENT, graph_id="graph-foreign"),
        uuid="foreign",
    )
    registry.register_graph(
        Graph(
            id="graph-root",
            owner_agent_id="owner",
            name="Root Graph",
            entry_node_id="owner",
        )
    )
    registry.register_graph(
        Graph(
            id="graph-foreign",
            owner_agent_id="foreign",
            name="Foreign Graph",
            entry_node_id="foreign",
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

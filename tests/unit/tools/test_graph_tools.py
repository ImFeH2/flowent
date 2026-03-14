import json

import pytest

from app.agent import Agent
from app.models import Graph, NodeConfig, NodeType
from app.registry import registry
from app.tools.connect_nodes import ConnectNodesTool
from app.tools.create_graph import CreateGraphTool
from app.tools.disconnect_nodes import DisconnectNodesTool


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


def test_connect_and_disconnect_nodes_are_directional():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            graph_id="graph-root",
            tools=["connect_nodes", "disconnect_nodes"],
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
        ConnectNodesTool().execute(
            owner,
            {"from": "worker", "to": "sink"},
        )
    )

    assert connect_result == {
        "status": "connected",
        "from_id": "worker",
        "to_id": "sink",
        "bidirectional": False,
    }
    assert worker.is_connected_to("sink") is True
    assert sink.is_connected_to("worker") is False

    disconnect_result = json.loads(
        DisconnectNodesTool().execute(
            owner,
            {"from": "worker", "to": "sink"},
        )
    )

    assert disconnect_result == {
        "status": "disconnected",
        "from_id": "worker",
        "to_id": "sink",
        "bidirectional": False,
    }
    assert worker.is_connected_to("sink") is False


def test_connect_nodes_rejects_unmanaged_targets():
    owner = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            graph_id="graph-root",
            tools=["connect_nodes"],
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
        ConnectNodesTool().execute(
            owner,
            {"from": "owner", "to": "foreign"},
        )
    )

    assert result == {"error": "Cannot manage target node 'foreign'"}

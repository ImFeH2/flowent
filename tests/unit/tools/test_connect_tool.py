import json

import pytest

from app.agent import Agent
from app.graph_service import create_tab
from app.models import AgentState, GraphNodeRecord, NodeConfig, NodeType
from app.registry import registry
from app.tools.connect import ConnectTool
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


def register_tab_agent(
    *,
    node_id: str,
    tab_id: str,
    name: str,
    role_name: str = "Worker",
    tools: list[str] | None = None,
) -> Agent:
    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role_name,
            tab_id=tab_id,
            name=name,
            tools=list(tools or []),
        ),
        uuid=node_id,
    )
    registry.register(agent)
    workspace_store.upsert_node_record(
        GraphNodeRecord(
            id=node_id,
            config=agent.config,
            state=AgentState.INITIALIZING,
        )
    )
    return agent


def test_connect_tool_creates_single_undirected_connection():
    tab = create_tab(title="Task", goal="Connect peers")
    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            name="Leader",
            tools=["connect"],
        ),
        uuid=tab.leader_id,
    )
    registry.register(leader)
    left = register_tab_agent(
        node_id="worker-a",
        tab_id=tab.id,
        name="Worker A",
    )
    right = register_tab_agent(
        node_id="worker-b",
        tab_id=tab.id,
        name="Worker B",
    )

    result = json.loads(
        ConnectTool().execute(
            leader,
            {
                "from": right.uuid,
                "to": left.uuid,
                "bidirectional": True,
            },
        )
    )

    assert result == {"connected": [["worker-a", "worker-b"]]}
    assert left.get_connections_snapshot() == [right.uuid]
    assert right.get_connections_snapshot() == [left.uuid]
    stored_edges = workspace_store.list_edges(tab.id)
    assert len(stored_edges) == 1
    assert (stored_edges[0].from_node_id, stored_edges[0].to_node_id) == (
        "worker-a",
        "worker-b",
    )

    duplicate_result = json.loads(
        ConnectTool().execute(
            leader,
            {
                "from": left.uuid,
                "to": right.uuid,
            },
        )
    )
    assert duplicate_result == {"error": "Duplicate connections are not allowed"}


def test_connect_tool_rejects_leader_endpoints():
    tab = create_tab(title="Task", goal="Reject leader edges")
    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id=tab.id,
            name="Leader",
            tools=["connect"],
        ),
        uuid=tab.leader_id,
    )
    registry.register(leader)
    worker = register_tab_agent(
        node_id="worker-a",
        tab_id=tab.id,
        name="Worker A",
    )

    result = json.loads(
        ConnectTool().execute(
            leader,
            {
                "from": leader.uuid,
                "to": worker.uuid,
            },
        )
    )

    assert result == {"error": "Leader does not participate in Agent Network edges"}
    assert worker.get_connections_snapshot() == []
    assert workspace_store.list_edges(tab.id) == []

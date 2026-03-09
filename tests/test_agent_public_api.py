import json
import threading

from app.agent import Agent
from app.models import Message, NodeConfig, NodeType, TodoItem
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools.idle import IdleTool
from app.tools.list_connections import ListConnectionsTool
from app.tools.list_roles import ListRolesTool
from app.tools.todo import TodoTool


def test_idle_tool_uses_request_idle(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]))
    called = []

    monkeypatch.setattr(
        agent,
        "request_idle",
        lambda: (
            called.append("idle")
            or json.dumps(
                {
                    "reason": "message",
                    "message": {"from": "tester", "content": "hello"},
                }
            )
        ),
    )

    result = json.loads(IdleTool().execute(agent, {}))

    assert result == {
        "reason": "message",
        "message": {"from": "tester", "content": "hello"},
    }
    assert called == ["idle"]


def test_idle_tool_blocks_until_message_and_returns_tool_payload():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]), uuid="agent-a")
    result: list[dict[str, object]] = []

    thread = threading.Thread(
        target=lambda: result.append(json.loads(IdleTool().execute(agent, {}))),
        daemon=True,
    )
    thread.start()

    agent.enqueue_message(
        Message(from_id="tester", to_id=agent.uuid, content="hello from queue")
    )
    thread.join(timeout=1.0)

    assert not thread.is_alive()
    assert result == [
        {
            "reason": "message",
            "message": {"from": "tester", "content": "hello from queue"},
        }
    ]


def test_list_connections_tool_uses_agent_public_api(monkeypatch):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["list_connections"]),
        uuid="agent-a",
    )
    expected = [
        {
            "uuid": "agent-b",
            "node_type": "agent",
            "role_name": "Worker",
            "name": "Worker",
            "state": "idle",
        }
    ]

    monkeypatch.setattr(agent, "get_connections_info", lambda: expected)

    result = json.loads(ListConnectionsTool().execute(agent, {}))

    assert result == {"connections": expected}


def test_agent_get_connections_info_returns_connected_node_metadata():
    registry.reset()
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-a")
    peer = Agent(
        NodeConfig(node_type=NodeType.AGENT, role_name="Worker", name="Worker"),
        uuid="agent-b",
    )
    registry.register(agent)
    registry.register(peer)
    agent.add_connection(peer.uuid)

    try:
        assert agent.get_connections_info() == [
            {
                "uuid": "agent-b",
                "node_type": "agent",
                "role_name": "Worker",
                "name": "Worker",
                "state": "initializing",
            }
        ]
    finally:
        registry.reset()


def test_list_roles_tool_returns_registered_roles(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.CONDUCTOR, tools=["list_roles"]))

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(name="Worker", system_prompt="Do work."),
                RoleConfig(name="Reviewer", system_prompt="Review code."),
            ]
        ),
    )

    result = json.loads(ListRolesTool().execute(agent, {}))

    assert result == [
        {"name": "Worker", "system_prompt": "Do work."},
        {"name": "Reviewer", "system_prompt": "Review code."},
    ]


def test_todo_tool_writes_via_set_todos(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["todo"]))
    applied: list[list[TodoItem]] = []

    def fake_set_todos(todos: list[TodoItem]) -> None:
        applied.append(todos)
        agent.todos = list(todos)

    monkeypatch.setattr(agent, "set_todos", fake_set_todos)

    result = json.loads(TodoTool().execute(agent, {"action": "add", "text": "step 1"}))

    assert result == {"status": "added", "id": 1}
    assert len(applied) == 1
    assert [(item.id, item.text, item.done) for item in applied[0]] == [
        (1, "step 1", False)
    ]

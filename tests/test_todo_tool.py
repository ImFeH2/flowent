import json

from app.agent import Agent
from app.events import event_bus
from app.models import EventType, NodeConfig, NodeType
from app.tools.todo import TodoTool


def test_todo_tool_emits_node_todos_changed(monkeypatch):
    events = []
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["todo"]))

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    result = json.loads(TodoTool().execute(agent, {"action": "add", "text": "step 1"}))

    assert result == {"status": "added", "id": 1}
    assert len(events) == 1
    assert events[0].type == EventType.NODE_TODOS_CHANGED
    assert events[0].data == {
        "todos": [
            {
                "id": 1,
                "text": "step 1",
                "done": False,
                "type": "TodoItem",
            }
        ]
    }

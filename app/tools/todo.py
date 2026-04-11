from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.events import event_bus
from app.models import Event, EventType, TodoItem
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class TodoTool(Tool):
    name = "todo"
    description = "Replace the full todo list with a new ordered list of task strings."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "todos": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Complete replacement todo list. Pass an empty array to clear all todos.",
            },
        },
        "required": ["todos"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        raw_todos = args["todos"]
        if not isinstance(raw_todos, list) or not all(
            isinstance(item, str) for item in raw_todos
        ):
            return json.dumps({"error": "todos must be an array of strings"})

        next_todos = [TodoItem(text=item) for item in raw_todos]
        agent.set_todos(next_todos)
        self._emit_todo_event(agent)
        return json.dumps({"status": "updated"})

    @staticmethod
    def _emit_todo_event(agent: Agent) -> None:
        event_bus.emit(
            Event(
                type=EventType.NODE_TODOS_CHANGED,
                agent_id=agent.uuid,
                data={
                    "todos": [t.serialize() for t in agent.get_todos_snapshot()],
                },
            ),
        )

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
    description = (
        "Manage a task list to track progress. Actions: add, update, remove, list."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "update", "remove", "list"],
                "description": "Action to perform",
            },
            "id": {
                "type": "integer",
                "description": "Todo item ID (for update/remove)",
            },
            "text": {
                "type": "string",
                "description": "Todo item text (for add/update)",
            },
            "done": {
                "type": "boolean",
                "description": "Whether the item is done (for update)",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        action = args["action"]
        current_todos = agent.get_todos_snapshot()

        if action == "list":
            return json.dumps(
                {
                    "todos": [t.serialize() for t in current_todos],
                }
            )

        if action == "add":
            text = args.get("text", "")
            if not text:
                return json.dumps({"error": "text is required for add"})
            next_id = max((t.id for t in current_todos), default=0) + 1
            item = TodoItem(id=next_id, text=text)
            agent.set_todos([*current_todos, item])
            self._emit_todo_event(agent)
            return json.dumps({"status": "added", "id": next_id})

        if action == "update":
            item_id = args.get("id")
            if item_id is None:
                return json.dumps({"error": "id is required for update"})
            updated_todos = []
            found = False
            for item in current_todos:
                if item.id == item_id:
                    found = True
                    if "text" in args:
                        item.text = args["text"]
                    if "done" in args:
                        item.done = args["done"]
                updated_todos.append(item)
            if found:
                agent.set_todos(updated_todos)
                self._emit_todo_event(agent)
                return json.dumps({"status": "updated", "id": item_id})
            return json.dumps({"error": f"Todo item {item_id} not found"})

        if action == "remove":
            item_id = args.get("id")
            if item_id is None:
                return json.dumps({"error": "id is required for remove"})
            next_todos = [t for t in current_todos if t.id != item_id]
            if len(next_todos) < len(current_todos):
                agent.set_todos(next_todos)
                self._emit_todo_event(agent)
                return json.dumps({"status": "removed", "id": item_id})
            return json.dumps({"error": f"Todo item {item_id} not found"})

        return json.dumps({"error": f"Unknown action: {action}"})

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

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_service import create_tab
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class CreateTabTool(Tool):
    name = "create_tab"
    description = "Create a new task tab that owns an Agent Graph."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Human-readable tab title",
            },
            "goal": {
                "type": "string",
                "description": "Optional task goal for the tab",
            },
        },
        "required": ["title"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        title = args.get("title")
        goal = args.get("goal", "")
        if not isinstance(title, str) or not title.strip():
            return json.dumps({"error": "title must be a non-empty string"})
        if not isinstance(goal, str):
            return json.dumps({"error": "goal must be a string"})
        tab = create_tab(title=title, goal=goal)
        return json.dumps(tab.serialize())

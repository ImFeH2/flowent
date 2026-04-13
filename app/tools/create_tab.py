from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_service import create_tab, serialize_tab_summary
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class CreateTabTool(Tool):
    name = "create_tab"
    description = "Create a new task tab with its bound Leader and Agent Route."
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
            "allow_network": {
                "type": "boolean",
                "description": "Whether the tab's leader should have network access (default False)",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of directory paths the tab's leader is allowed to write to",
            },
            "blueprint_id": {
                "type": "string",
                "description": "Optional global Route Blueprint ID to materialize as the tab's initial route",
            },
        },
        "required": ["title"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        title = args.get("title")
        goal = args.get("goal", "")
        allow_network = args.get("allow_network", False)
        write_dirs = args.get("write_dirs", [])
        blueprint_id = args.get("blueprint_id")
        if not isinstance(title, str) or not title.strip():
            return json.dumps({"error": "title must be a non-empty string"})
        if not isinstance(goal, str):
            return json.dumps({"error": "goal must be a string"})
        if not isinstance(allow_network, bool):
            return json.dumps({"error": "allow_network must be a boolean"})
        if not isinstance(write_dirs, list) or not all(
            isinstance(x, str) for x in write_dirs
        ):
            return json.dumps({"error": "write_dirs must be a list of strings"})
        if blueprint_id is not None and not isinstance(blueprint_id, str):
            return json.dumps({"error": "blueprint_id must be a string"})

        try:
            tab = create_tab(
                title=title,
                goal=goal,
                allow_network=allow_network,
                write_dirs=write_dirs,
                blueprint_id=blueprint_id,
            )
        except ValueError as exc:
            return json.dumps({"error": str(exc)})
        return json.dumps(serialize_tab_summary(tab))

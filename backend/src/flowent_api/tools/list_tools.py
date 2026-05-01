from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from flowent_api.tools import Tool

if TYPE_CHECKING:
    from flowent_api.agent import Agent


class ListToolsTool(Tool):
    name = "list_tools"
    description = "List all registered tools with their names and descriptions."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from flowent_api.tools import list_agent_visible_tool_descriptors

        return json.dumps(list_agent_visible_tool_descriptors())

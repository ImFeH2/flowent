from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ListConnectionsTool(Tool):
    name = "list_connections"
    description = (
        "List all nodes reachable from the current node by direct outgoing edges."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        return json.dumps({"connections": agent.get_connections_info()})

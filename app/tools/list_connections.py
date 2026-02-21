from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ListConnectionsTool(Tool):
    name = "list_connections"
    description = "List all nodes connected to the current node."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        result = []
        with agent._connections_lock:
            connection_ids = list(agent.connections)

        for cid in connection_ids:
            node = registry.get(cid)
            if node is None:
                continue
            result.append(
                {
                    "uuid": node.uuid,
                    "node_type": node.config.node_type.value,
                    "role_id": node.config.role_id,
                    "name": node.config.name,
                    "state": node.state.value,
                }
            )

        return json.dumps({"connections": result})

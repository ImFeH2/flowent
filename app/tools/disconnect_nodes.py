from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_runtime import disconnect_nodes, resolve_node_ref
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class DisconnectNodesTool(Tool):
    name = "disconnect_nodes"
    description = "Remove a directed message edge between two manageable nodes."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "from": {
                "type": "string",
                "description": "Source node UUID or name",
            },
            "to": {
                "type": "string",
                "description": "Target node UUID or name",
            },
            "bidirectional": {
                "type": "boolean",
                "description": "Whether to also remove the reverse edge",
                "default": False,
            },
        },
        "required": ["from", "to"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        from_ref = args.get("from")
        to_ref = args.get("to")
        bidirectional = args.get("bidirectional", False)

        if not isinstance(from_ref, str) or not from_ref:
            return json.dumps({"error": "from must be a non-empty string"})
        if not isinstance(to_ref, str) or not to_ref:
            return json.dumps({"error": "to must be a non-empty string"})
        if not isinstance(bidirectional, bool):
            return json.dumps({"error": "bidirectional must be a boolean"})

        source = resolve_node_ref(from_ref)
        target = resolve_node_ref(to_ref)
        if source is None:
            return json.dumps({"error": f"Node '{from_ref}' not found"})
        if target is None:
            return json.dumps({"error": f"Node '{to_ref}' not found"})
        if not registry.can_manage_node(agent.uuid, source.uuid):
            return json.dumps({"error": f"Cannot manage source node '{from_ref}'"})
        if not registry.can_manage_node(agent.uuid, target.uuid):
            return json.dumps({"error": f"Cannot manage target node '{to_ref}'"})

        disconnect_nodes(source.uuid, target.uuid)
        if bidirectional:
            disconnect_nodes(target.uuid, source.uuid)

        return json.dumps(
            {
                "status": "disconnected",
                "from_id": source.uuid,
                "to_id": target.uuid,
                "bidirectional": bidirectional,
            }
        )

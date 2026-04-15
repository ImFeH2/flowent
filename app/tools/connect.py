from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_runtime import resolve_node_ref
from app.models import NodeType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ConnectTool(Tool):
    name = "connect"
    description = (
        "Create a peer connection between two regular nodes in the same task tab."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "from": {
                "type": "string",
                "description": "First node UUID or name",
            },
            "to": {
                "type": "string",
                "description": "Second node UUID or name",
            },
        },
        "required": ["from", "to"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.graph_service import create_edge, is_tab_leader

        from_ref = args.get("from")
        to_ref = args.get("to")

        if not isinstance(from_ref, str) or not from_ref:
            return json.dumps({"error": "from must be a non-empty string"})
        if not isinstance(to_ref, str) or not to_ref:
            return json.dumps({"error": "to must be a non-empty string"})

        source = resolve_node_ref(from_ref)
        target = resolve_node_ref(to_ref)
        if source is None:
            return json.dumps({"error": f"Node '{from_ref}' not found"})
        if target is None:
            return json.dumps({"error": f"Node '{to_ref}' not found"})

        if not source.config.tab_id or source.config.tab_id != target.config.tab_id:
            return json.dumps({"error": "Both nodes must belong to the same tab"})
        if agent.node_type == NodeType.ASSISTANT:
            return json.dumps(
                {"error": "Assistant may not rewire a tab Agent Network directly"}
            )
        if not agent.config.tab_id or agent.config.tab_id != source.config.tab_id:
            return json.dumps(
                {"error": "A tab Leader may only connect peers inside its own tab"}
            )
        if not is_tab_leader(node_id=agent.uuid, tab_id=agent.config.tab_id):
            return json.dumps({"error": "Only a tab Leader may connect task nodes"})

        edge, error = create_edge(
            from_node_id=source.uuid,
            to_node_id=target.uuid,
        )
        if error is not None or edge is None:
            return json.dumps({"error": error or "Failed to connect nodes"})

        return json.dumps(
            {"connected": [[edge.from_node_id, edge.to_node_id]]},
        )

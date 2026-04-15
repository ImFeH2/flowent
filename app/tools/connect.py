from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_runtime import connect_nodes, resolve_node_ref
from app.models import GraphEdge, NodeType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ConnectTool(Tool):
    name = "connect"
    description = (
        "Create a directed message edge between two nodes in the same task tab. "
        "Use bidirectional=true to create edges in both directions."
    )
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
                "description": "Whether to also create the reverse edge",
                "default": False,
            },
        },
        "required": ["from", "to"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.graph_service import is_tab_leader

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

        connected = [[source.uuid, target.uuid]]
        connect_nodes(source.uuid, target.uuid)
        if source.config.tab_id:
            from app.workspace_store import workspace_store

            workspace_store.upsert_edge(
                GraphEdge(
                    id=str(uuid.uuid4()),
                    tab_id=source.config.tab_id,
                    from_node_id=source.uuid,
                    to_node_id=target.uuid,
                )
            )
        if bidirectional:
            connect_nodes(target.uuid, source.uuid)
            connected.append([target.uuid, source.uuid])
            if source.config.tab_id:
                from app.workspace_store import workspace_store

                workspace_store.upsert_edge(
                    GraphEdge(
                        id=str(uuid.uuid4()),
                        tab_id=source.config.tab_id,
                        from_node_id=target.uuid,
                        to_node_id=source.uuid,
                    )
                )

        return json.dumps({"connected": connected})

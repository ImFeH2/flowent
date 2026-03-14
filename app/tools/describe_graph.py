from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class DescribeGraphTool(Tool):
    name = "describe_graph"
    description = "Describe a graph, its nodes, and its directed message edges."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "graph_id": {
                "type": "string",
                "description": "Graph UUID. Defaults to the caller's current graph.",
            }
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        graph_id = args.get("graph_id") or agent.config.graph_id
        if not isinstance(graph_id, str) or not graph_id:
            return json.dumps({"error": "graph_id must be a non-empty string"})

        graph = registry.get_graph(graph_id)
        if graph is None:
            return json.dumps({"error": f"Graph '{graph_id}' not found"})

        nodes = registry.get_graph_nodes(graph_id)
        return json.dumps(
            {
                "graph": graph.serialize(),
                "nodes": [
                    {
                        "id": node.uuid,
                        "node_type": node.config.node_type.value,
                        "role_name": node.config.role_name,
                        "name": node.config.name,
                        "state": node.state.value,
                        "graph_id": node.config.graph_id,
                        "connections": node.get_connections_snapshot(),
                    }
                    for node in nodes
                ],
                "edges": [
                    {"from_id": node.uuid, "to_id": target_id}
                    for node in nodes
                    for target_id in node.get_connections_snapshot()
                ],
            }
        )

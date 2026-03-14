from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ListGraphsTool(Tool):
    name = "list_graphs"
    description = "List all currently registered graphs."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        return json.dumps(
            {
                "graphs": [
                    {
                        **graph.serialize(),
                        "node_count": len(registry.get_graph_nodes(graph.id)),
                    }
                    for graph in registry.get_all_graphs()
                ]
            }
        )

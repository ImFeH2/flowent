from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_service import (
    is_tab_leader,
    list_tab_edges,
    list_tab_nodes,
    serialize_tab_summary,
)
from app.tools import Tool
from app.workspace_store import workspace_store

if TYPE_CHECKING:
    from app.agent import Agent


class ListTabsTool(Tool):
    name = "list_tabs"
    description = (
        "List persistent task tabs. Optionally include the full route for one tab."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "tab_id": {
                "type": "string",
                "description": "Optional tab ID to inspect in detail",
            }
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        tab_id = args.get("tab_id")
        if tab_id is not None and not isinstance(tab_id, str):
            return json.dumps({"error": "tab_id must be a string"})

        if isinstance(tab_id, str) and tab_id.strip():
            tab = workspace_store.get_tab(tab_id.strip())
            if tab is None:
                return json.dumps({"error": f"Tab '{tab_id.strip()}' not found"})
            nodes = list_tab_nodes(tab.id)
            edges = list_tab_edges(tab.id)
            return json.dumps(
                {
                    "tab": serialize_tab_summary(tab),
                    "nodes": [
                        {
                            "id": node.id,
                            "name": node.config.name,
                            "role_name": node.config.role_name,
                            "is_leader": is_tab_leader(
                                node_id=node.id,
                                tab_id=tab.id,
                            ),
                            "state": node.state.value,
                            "position": (
                                node.position.serialize()
                                if node.position is not None
                                else None
                            ),
                        }
                        for node in nodes
                    ],
                    "edges": [edge.serialize() for edge in edges],
                }
            )

        return json.dumps(
            [serialize_tab_summary(tab) for tab in workspace_store.list_tabs()]
        )

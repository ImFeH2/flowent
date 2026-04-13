from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_service import delete_tab
from app.models import NodeType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class DeleteTabTool(Tool):
    name = "delete_tab"
    description = "Delete a task tab and clean up its Agent Route."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "tab_id": {
                "type": "string",
                "description": "ID of the tab to delete",
            }
        },
        "required": ["tab_id"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        if agent.node_type != NodeType.ASSISTANT:
            return json.dumps({"error": "Only the Assistant may delete tabs"})

        tab_id = args.get("tab_id")
        if not isinstance(tab_id, str) or not tab_id.strip():
            return json.dumps({"error": "tab_id must be a non-empty string"})

        deleted, error = delete_tab(tab_id=tab_id.strip())
        if error is not None or deleted is None:
            return json.dumps({"error": error or "Failed to delete tab"})
        return json.dumps(deleted)

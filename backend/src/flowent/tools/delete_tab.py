from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from flowent.graph_service import delete_tab
from flowent.models import NodeType
from flowent.tools import Tool

if TYPE_CHECKING:
    from flowent.agent import Agent


class DeleteTabTool(Tool):
    name = "delete_workflow"
    description = "Delete a workflow and clean up its graph."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow to delete",
            }
        },
        "required": ["workflow_id"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        if agent.node_type != NodeType.ASSISTANT:
            return json.dumps({"error": "Only the Assistant may delete workflows"})

        workflow_id = args.get("workflow_id")
        if not isinstance(workflow_id, str) or not workflow_id.strip():
            return json.dumps({"error": "workflow_id must be a non-empty string"})

        deleted, error = delete_tab(tab_id=workflow_id.strip())
        if error is not None or deleted is None:
            return json.dumps({"error": error or "Failed to delete workflow"})
        return json.dumps(deleted)

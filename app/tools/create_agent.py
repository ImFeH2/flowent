from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from app.graph_service import create_agent_node
from app.models import NodeType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class CreateAgentTool(Tool):
    name = "create_agent"
    description = (
        "Create a new agent node inside a task tab. If you are already operating "
        "inside a tab, tab_id may be omitted and the new agent will be created in "
        "your current tab."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "tab_id": {
                "type": "string",
                "description": "Target tab ID",
            },
            "role_name": {
                "type": "string",
                "description": "Role assigned to the new agent",
            },
            "name": {
                "type": "string",
                "description": "Optional human-readable node name",
            },
            "tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional additional tools",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional writable directories",
            },
            "allow_network": {
                "type": "boolean",
                "description": "Whether the node can access the network",
                "default": False,
            },
        },
        "required": ["role_name"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        tab_id = args.get("tab_id")
        role_name = args.get("role_name")
        name = args.get("name")
        tools = args.get("tools", [])
        write_dirs = args.get("write_dirs", [])
        allow_network = args.get("allow_network", False)

        resolved_tab_id: str | None
        if tab_id is None:
            resolved_tab_id = agent.config.tab_id
        elif isinstance(tab_id, str) and tab_id.strip():
            resolved_tab_id = tab_id.strip()
        else:
            return json.dumps({"error": "tab_id must be a non-empty string"})
        if not isinstance(role_name, str) or not role_name.strip():
            return json.dumps({"error": "role_name must be a non-empty string"})
        if name is not None and not isinstance(name, str):
            return json.dumps({"error": "name must be a string"})
        if not isinstance(tools, list) or not all(
            isinstance(item, str) for item in tools
        ):
            return json.dumps({"error": "tools must be an array of strings"})
        if not isinstance(write_dirs, list) or not all(
            isinstance(item, str) for item in write_dirs
        ):
            return json.dumps({"error": "write_dirs must be an array of strings"})
        if not isinstance(allow_network, bool):
            return json.dumps({"error": "allow_network must be a boolean"})
        if not resolved_tab_id:
            return json.dumps({"error": "tab_id is required"})
        normalized_role_name = role_name.strip()
        if agent.node_type == NodeType.ASSISTANT:
            return json.dumps(
                {"error": "Assistant may not create ordinary task nodes directly"}
            )
        if not agent.config.tab_id:
            return json.dumps(
                {"error": "Only a tab Leader may create ordinary task nodes"}
            )
        if resolved_tab_id != agent.config.tab_id:
            return json.dumps(
                {"error": "A tab Leader may only create peers inside its own tab"}
            )
        from app.graph_service import is_tab_leader

        if not is_tab_leader(node_id=agent.uuid, tab_id=agent.config.tab_id):
            return json.dumps(
                {"error": "Only a tab Leader may create ordinary task nodes"}
            )
        parent_write_dirs = [Path(path).resolve() for path in agent.config.write_dirs]
        invalid_write_dirs = sorted(
            path
            for path in write_dirs
            if not any(
                Path(path).resolve().is_relative_to(parent_path)
                for parent_path in parent_write_dirs
            )
        )
        if invalid_write_dirs:
            return json.dumps(
                {
                    "error": "write_dirs boundary exceeded: "
                    + ", ".join(invalid_write_dirs)
                }
            )
        if allow_network and not agent.config.allow_network:
            return json.dumps(
                {
                    "error": "allow_network boundary exceeded: parent disallows network access"
                }
            )

        record, error = create_agent_node(
            role_name=normalized_role_name,
            tab_id=resolved_tab_id,
            name=name,
            tools=tools,
            write_dirs=write_dirs,
            allow_network=allow_network,
        )
        if error is not None or record is None:
            return json.dumps({"error": error or "Failed to create agent"})
        return json.dumps(record.serialize())

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ListRolesTool(Tool):
    name = "list_roles"
    description = "List all registered roles with builtin and optional tool views."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.settings import get_settings, normalize_tool_names
        from app.tools import MINIMUM_TOOLS, build_tool_registry

        settings = get_settings()
        tool_registry = build_tool_registry()
        all_tool_names = [tool.name for tool in tool_registry.list_tools()]
        payload: list[dict[str, object]] = []

        for role in settings.roles:
            builtin_tools = normalize_tool_names([*MINIMUM_TOOLS, *role.included_tools])
            optional_tools = [
                tool_name
                for tool_name in all_tool_names
                if tool_name not in builtin_tools
                and tool_name not in role.excluded_tools
            ]
            payload.append(
                {
                    "name": role.name,
                    "system_prompt": role.system_prompt,
                    "builtin_tools": builtin_tools,
                    "optional_tools": optional_tools,
                }
            )

        return json.dumps(payload)

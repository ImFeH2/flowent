from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ListRolesTool(Tool):
    name = "list_roles"
    description = "List all registered roles with their full system prompts."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.settings import get_settings

        settings = get_settings()
        return json.dumps(
            [
                {"name": role.name, "system_prompt": role.system_prompt}
                for role in settings.roles
            ]
        )

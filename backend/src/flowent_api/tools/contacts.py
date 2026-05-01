from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from flowent_api.tools import Tool

if TYPE_CHECKING:
    from flowent_api.agent import Agent


class ContactsTool(Tool):
    name = "contacts"
    description = "List the agents this node can message directly right now."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        return json.dumps({"contacts": agent.get_contacts_info()})

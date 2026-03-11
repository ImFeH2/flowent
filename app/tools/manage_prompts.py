from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.agent import Agent

from app.tools import Tool


class ManagePromptsTool(Tool):
    name = "manage_prompts"
    agent_visible = False
    description = (
        "Read and update the global custom prompt. The custom prompt is "
        "appended to every node's system prompt, including the Steward."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["get", "update"],
                "description": "Prompt management action",
            },
            "custom_prompt": {
                "type": "string",
                "description": "Updated global custom prompt",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.settings import get_settings, save_settings

        action = args.get("action")
        custom_prompt = args.get("custom_prompt")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        settings = get_settings()

        if action == "get":
            return json.dumps({"custom_prompt": settings.custom_prompt})

        if action != "update":
            return json.dumps({"error": f"Unsupported action: {action}"})

        if "custom_prompt" not in args:
            return json.dumps({"error": "custom_prompt is required"})
        if not isinstance(custom_prompt, str):
            return json.dumps({"error": "custom_prompt must be a string"})

        settings.custom_prompt = custom_prompt
        save_settings(settings)
        return json.dumps({"custom_prompt": settings.custom_prompt})

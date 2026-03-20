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
        "Read and update the global custom prompt and custom post prompt. The "
        "custom prompt is appended to every node's system prompt, and the "
        "custom post prompt is appended after the built-in runtime post prompt "
        "in every runtime request tail."
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
            "custom_post_prompt": {
                "type": "string",
                "description": "Updated global custom post prompt",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.settings import get_settings, save_settings

        action = args.get("action")
        custom_prompt = args.get("custom_prompt")
        custom_post_prompt = args.get("custom_post_prompt")
        legacy_post_prompt = args.get("post_prompt")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        settings = get_settings()

        if action == "get":
            return json.dumps(
                {
                    "custom_prompt": settings.custom_prompt,
                    "custom_post_prompt": settings.custom_post_prompt,
                }
            )

        if action != "update":
            return json.dumps({"error": f"Unsupported action: {action}"})

        if (
            "custom_prompt" not in args
            and "custom_post_prompt" not in args
            and "post_prompt" not in args
        ):
            return json.dumps(
                {"error": "custom_prompt or custom_post_prompt is required"}
            )
        if "custom_prompt" in args and not isinstance(custom_prompt, str):
            return json.dumps({"error": "custom_prompt must be a string"})
        if "custom_post_prompt" in args and not isinstance(custom_post_prompt, str):
            return json.dumps({"error": "custom_post_prompt must be a string"})
        if (
            "post_prompt" in args
            and "custom_post_prompt" not in args
            and not isinstance(legacy_post_prompt, str)
        ):
            return json.dumps({"error": "custom_post_prompt must be a string"})

        next_custom_prompt = custom_prompt if isinstance(custom_prompt, str) else None
        next_custom_post_prompt = (
            custom_post_prompt
            if isinstance(custom_post_prompt, str)
            else legacy_post_prompt
            if isinstance(legacy_post_prompt, str)
            else None
        )

        if next_custom_prompt is not None:
            settings.custom_prompt = next_custom_prompt
        if next_custom_post_prompt is not None:
            settings.custom_post_prompt = next_custom_post_prompt
        save_settings(settings)
        return json.dumps(
            {
                "custom_prompt": settings.custom_prompt,
                "custom_post_prompt": settings.custom_post_prompt,
            }
        )

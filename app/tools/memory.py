from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class EditMemoryTool(Tool):
    name = "edit_memory"
    description = "Read or update the agent's persistent memory (key-value store). Use to track progress and important information."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["get", "set", "delete", "list"],
                "description": "Action to perform",
            },
            "key": {"type": "string", "description": "Memory key (for get/set/delete)"},
            "value": {"type": "string", "description": "Value to store (for set)"},
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        action = args["action"]

        if action == "list":
            return json.dumps({"memory": agent.memory})

        key = args.get("key")
        if not key:
            return json.dumps({"error": "key is required for get/set/delete"})

        if action == "get":
            value = agent.memory.get(key)
            return json.dumps({"key": key, "value": value})

        if action == "set":
            value = args.get("value", "")
            agent.memory[key] = value
            logger.debug("Agent {} memory set: {}", agent.uuid[:8], key)
            return json.dumps({"status": "stored", "key": key})

        if action == "delete":
            agent.memory.pop(key, None)
            logger.debug("Agent {} memory delete: {}", agent.uuid[:8], key)
            return json.dumps({"status": "deleted", "key": key})

        return json.dumps({"error": f"Unknown action: {action}"})

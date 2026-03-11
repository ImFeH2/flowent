from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.agent import Agent
    from app.settings import Settings

from app.tools import Tool


def _serialize_settings(settings: Settings) -> dict[str, object]:
    return {
        "model": {
            "active_provider_id": settings.model.active_provider_id,
            "active_model": settings.model.active_model,
        },
        "event_log": {
            "timestamp_format": settings.event_log.timestamp_format,
        },
        "root_boundary": {
            "write_dirs": list(settings.root_boundary.write_dirs),
            "allow_network": settings.root_boundary.allow_network,
        },
    }


class ManageSettingsTool(Tool):
    name = "manage_settings"
    agent_visible = False
    description = (
        "Read and update system settings, including the active provider and "
        "model, event log timestamp format, and root boundary."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["get", "update"],
                "description": "Settings action",
            },
            "active_provider_id": {
                "type": "string",
                "description": "Active provider ID for update",
            },
            "active_model": {
                "type": "string",
                "description": "Active model name for update",
            },
            "timestamp_format": {
                "type": "string",
                "description": "Event log timestamp format for update",
            },
            "root_boundary": {
                "type": "object",
                "properties": {
                    "write_dirs": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "allow_network": {
                        "type": "boolean",
                    },
                },
                "description": "Root boundary updates",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.providers.gateway import gateway
        from app.settings import get_settings, save_settings

        action = args.get("action")
        active_provider_id = args.get("active_provider_id")
        active_model = args.get("active_model")
        timestamp_format = args.get("timestamp_format")
        root_boundary = args.get("root_boundary")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if active_provider_id is not None and not isinstance(active_provider_id, str):
            return json.dumps({"error": "active_provider_id must be a string"})
        if active_model is not None and not isinstance(active_model, str):
            return json.dumps({"error": "active_model must be a string"})
        if timestamp_format is not None and not isinstance(timestamp_format, str):
            return json.dumps({"error": "timestamp_format must be a string"})
        if root_boundary is not None and not isinstance(root_boundary, dict):
            return json.dumps({"error": "root_boundary must be an object"})

        settings = get_settings()

        if action == "get":
            return json.dumps(_serialize_settings(settings))

        if action != "update":
            return json.dumps({"error": f"Unsupported action: {action}"})

        if active_provider_id is not None:
            settings.model.active_provider_id = active_provider_id
        if active_model is not None:
            settings.model.active_model = active_model
        if timestamp_format is not None:
            settings.event_log.timestamp_format = timestamp_format

        if root_boundary is not None:
            write_dirs = root_boundary.get("write_dirs")
            allow_network = root_boundary.get("allow_network")

            if write_dirs is not None and (
                not isinstance(write_dirs, list)
                or not all(isinstance(path, str) for path in write_dirs)
            ):
                return json.dumps(
                    {"error": "root_boundary.write_dirs must be an array of strings"}
                )
            if allow_network is not None and not isinstance(allow_network, bool):
                return json.dumps(
                    {"error": "root_boundary.allow_network must be a boolean"}
                )

            if write_dirs is not None:
                settings.root_boundary.write_dirs = list(write_dirs)
            if allow_network is not None:
                settings.root_boundary.allow_network = allow_network

        save_settings(settings)
        gateway.invalidate_cache()
        return json.dumps(_serialize_settings(settings))

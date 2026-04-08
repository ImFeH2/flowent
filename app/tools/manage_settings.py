from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.agent import Agent
    from app.settings import Settings

from app.tools import Tool


def _serialize_settings(settings: Settings) -> dict[str, object]:
    return {
        "assistant": {
            "role_name": settings.assistant.role_name,
        },
        "model": {
            "active_provider_id": settings.model.active_provider_id,
            "active_model": settings.model.active_model,
            "max_retries": settings.model.max_retries,
            "params": {
                "reasoning_effort": settings.model.params.reasoning_effort,
                "verbosity": settings.model.params.verbosity,
                "max_output_tokens": settings.model.params.max_output_tokens,
                "temperature": settings.model.params.temperature,
                "top_p": settings.model.params.top_p,
            },
        },
        "event_log": {
            "timestamp_format": settings.event_log.timestamp_format,
        },
    }


class ManageSettingsTool(Tool):
    name = "manage_settings"
    description = (
        "Read and update system settings, including the Assistant role, active "
        "provider and model, default model params, event log timestamp format, "
        "and other runtime defaults."
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
            "assistant_role_name": {
                "type": "string",
                "description": "Role name used by the Assistant",
            },
            "active_model": {
                "type": "string",
                "description": "Active model name for update",
            },
            "max_retries": {
                "type": "integer",
                "description": "Maximum retries for transient LLM call failures",
            },
            "model_params": {
                "type": ["object", "null"],
                "description": "Default canonical model parameter overrides",
                "properties": {
                    "reasoning_effort": {
                        "type": "string",
                        "enum": ["none", "low", "medium", "high", "xhigh"],
                    },
                    "verbosity": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                    },
                    "max_output_tokens": {"type": "integer"},
                    "temperature": {"type": "number"},
                    "top_p": {"type": "number"},
                },
                "additionalProperties": False,
            },
            "timestamp_format": {
                "type": "string",
                "description": "Event log timestamp format for update",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.providers.gateway import gateway
        from app.registry import registry
        from app.settings import (
            build_default_model_params,
            build_model_max_retries,
            build_model_params_from_mapping,
            find_role,
            get_settings,
            save_settings,
        )

        action = args.get("action")
        assistant_role_name = args.get("assistant_role_name")
        active_provider_id = args.get("active_provider_id")
        active_model = args.get("active_model")
        max_retries = args.get("max_retries")
        model_params = args.get("model_params")
        timestamp_format = args.get("timestamp_format")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if assistant_role_name is not None and not isinstance(assistant_role_name, str):
            return json.dumps({"error": "assistant_role_name must be a string"})
        if active_provider_id is not None and not isinstance(active_provider_id, str):
            return json.dumps({"error": "active_provider_id must be a string"})
        if active_model is not None and not isinstance(active_model, str):
            return json.dumps({"error": "active_model must be a string"})
        if max_retries is not None:
            try:
                build_model_max_retries(max_retries, field_name="max_retries")
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if model_params is not None and not isinstance(
            model_params, (dict, type(None))
        ):
            return json.dumps({"error": "model_params must be an object or null"})
        if timestamp_format is not None and not isinstance(timestamp_format, str):
            return json.dumps({"error": "timestamp_format must be a string"})

        settings = get_settings()

        if action == "get":
            return json.dumps(_serialize_settings(settings))

        if action != "update":
            return json.dumps({"error": f"Unsupported action: {action}"})

        if assistant_role_name is not None:
            next_role_name = assistant_role_name.strip()
            if not next_role_name:
                return json.dumps({"error": "assistant_role_name must not be empty"})
            if find_role(settings, next_role_name) is None:
                return json.dumps({"error": f"Role '{next_role_name}' not found"})
            settings.assistant.role_name = next_role_name

        if active_provider_id is not None:
            settings.model.active_provider_id = active_provider_id
        if active_model is not None:
            settings.model.active_model = active_model
        if max_retries is not None:
            settings.model.max_retries = build_model_max_retries(
                max_retries,
                field_name="max_retries",
            )
        if "model_params" in args:
            try:
                settings.model.params = (
                    build_model_params_from_mapping(model_params)
                    or build_default_model_params()
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if timestamp_format is not None:
            settings.event_log.timestamp_format = timestamp_format

        save_settings(settings)
        assistant = registry.get_assistant()
        if assistant is not None:
            assistant.config.role_name = settings.assistant.role_name
            assistant._sync_system_prompt_entry()
            assistant.set_state(
                assistant.state,
                "assistant settings updated",
                force_emit=True,
            )
        gateway.invalidate_cache()
        return json.dumps(_serialize_settings(settings))

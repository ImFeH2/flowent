from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from flowent_api.agent import Agent

from flowent_api.role_management import (
    apply_role_update,
    build_role_config,
    ensure_role_name_available,
    find_role_by_name,
    normalize_optional_role_description,
    normalize_optional_role_name,
    remove_role,
    require_role_description,
    require_role_name,
    resolve_role_model,
    resolve_role_model_params,
    resolve_role_tool_config,
    sync_running_system_roles,
    validate_builtin_role_update,
)
from flowent_api.tools import Tool


class ManageRolesTool(Tool):
    name = "manage_roles"
    description = (
        "Manage Role configuration. Supports listing, creating, updating, "
        "and deleting roles. Built-in roles cannot be deleted, renamed, "
        "or modified except for model and model_params configuration."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "create", "update", "delete"],
                "description": "Role management action",
            },
            "name": {
                "type": "string",
                "description": "Role name for create, update, or delete",
            },
            "new_name": {
                "type": "string",
                "description": "New role name for update",
            },
            "description": {
                "type": "string",
                "description": "Short role description used when choosing a role",
            },
            "system_prompt": {
                "type": "string",
                "description": "Role system prompt",
            },
            "model": {
                "type": ["object", "null"],
                "description": "Optional provider and model override for this role",
                "properties": {
                    "provider_id": {"type": "string"},
                    "model": {"type": "string"},
                },
                "required": ["provider_id", "model"],
                "additionalProperties": False,
            },
            "model_params": {
                "type": ["object", "null"],
                "description": "Optional canonical model parameter overrides",
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
            "included_tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tools always included in the role",
            },
            "excluded_tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tools always excluded from the role",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from flowent_api.providers.gateway import gateway
        from flowent_api.settings import (
            get_settings,
            is_builtin_role_name,
            save_settings,
            serialize_role,
        )

        action = args.get("action")
        role_name = args.get("name")
        new_name = args.get("new_name")
        description = args.get("description")
        system_prompt = args.get("system_prompt")
        role_model = args.get("model")
        role_model_params = args.get("model_params")
        included_tools = args.get("included_tools")
        excluded_tools = args.get("excluded_tools")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if role_name is not None and not isinstance(role_name, str):
            return json.dumps({"error": "name must be a string"})
        if new_name is not None and not isinstance(new_name, str):
            return json.dumps({"error": "new_name must be a string"})
        if description is not None and not isinstance(description, str):
            return json.dumps({"error": "description must be a string"})
        if system_prompt is not None and not isinstance(system_prompt, str):
            return json.dumps({"error": "system_prompt must be a string"})
        if included_tools is not None and (
            not isinstance(included_tools, list)
            or not all(isinstance(tool_name, str) for tool_name in included_tools)
        ):
            return json.dumps({"error": "included_tools must be an array of strings"})
        if excluded_tools is not None and (
            not isinstance(excluded_tools, list)
            or not all(isinstance(tool_name, str) for tool_name in excluded_tools)
        ):
            return json.dumps({"error": "excluded_tools must be an array of strings"})

        settings = get_settings()

        if action == "list":
            return json.dumps([serialize_role(role) for role in settings.roles])

        if action == "create":
            if not isinstance(system_prompt, str):
                return json.dumps({"error": "system_prompt is required"})
            try:
                name = require_role_name(role_name or "")
                description_text = require_role_description(description or "")
                ensure_role_name_available(settings.roles, name)
                next_included, next_excluded = resolve_role_tool_config(
                    None,
                    included_tools,
                    excluded_tools,
                )
                next_model = resolve_role_model(
                    role_model,
                    settings=settings,
                    current=None,
                    provided="model" in args,
                    invalid_type_error="model must be an object or null",
                    missing_provider_id_error=(
                        "model.provider_id must be a non-empty string"
                    ),
                    missing_model_error="model.model must be a non-empty string",
                )
                next_model_params = resolve_role_model_params(
                    role_model_params,
                    current=None,
                    provided="model_params" in args,
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
            new_role = build_role_config(
                name=name,
                description=description_text,
                system_prompt=system_prompt,
                model=next_model,
                model_params=next_model_params,
                included_tools=next_included,
                excluded_tools=next_excluded,
            )
            settings.roles.append(new_role)
            save_settings(settings)
            gateway.invalidate_cache()
            return json.dumps(serialize_role(new_role))

        if action == "update":
            if not isinstance(role_name, str) or not role_name:
                return json.dumps({"error": "name is required"})

            target_role = find_role_by_name(settings.roles, role_name)
            if target_role is None:
                return json.dumps({"error": f"Role '{role_name}' not found"})

            try:
                next_included, next_excluded = resolve_role_tool_config(
                    target_role,
                    included_tools,
                    excluded_tools,
                )
                next_model = resolve_role_model(
                    role_model,
                    settings=settings,
                    current=target_role.model,
                    provided="model" in args,
                    invalid_type_error="model must be an object or null",
                    missing_provider_id_error=(
                        "model.provider_id must be a non-empty string"
                    ),
                    missing_model_error="model.model must be a non-empty string",
                )
                next_model_params = resolve_role_model_params(
                    role_model_params,
                    current=target_role.model_params,
                    provided="model_params" in args,
                )
                stripped_name = normalize_optional_role_name(new_name)
                stripped_description = normalize_optional_role_description(description)
                if stripped_name is not None:
                    ensure_role_name_available(
                        settings.roles,
                        stripped_name,
                        current_name=target_role.name,
                    )
                validate_builtin_role_update(
                    target_role,
                    next_name=stripped_name,
                    next_description=stripped_description,
                    next_system_prompt=system_prompt,
                    next_included_tools=next_included,
                    next_excluded_tools=next_excluded,
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
            target_role = apply_role_update(
                settings=settings,
                role=target_role,
                next_name=stripped_name,
                next_description=stripped_description,
                next_system_prompt=system_prompt,
                next_model=next_model,
                update_model="model" in args,
                next_model_params=next_model_params,
                update_model_params="model_params" in args,
                next_included_tools=next_included,
                next_excluded_tools=next_excluded,
            )
            save_settings(settings)
            sync_running_system_roles()
            gateway.invalidate_cache()
            return json.dumps(serialize_role(target_role))

        if action == "delete":
            if not isinstance(role_name, str) or not role_name:
                return json.dumps({"error": "name is required"})
            if is_builtin_role_name(role_name):
                return json.dumps(
                    {"error": f"Cannot delete built-in role '{role_name}'"}
                )

            target_role = find_role_by_name(settings.roles, role_name)
            if target_role is None:
                return json.dumps({"error": f"Role '{role_name}' not found"})

            remove_role(settings, target_role)
            save_settings(settings)
            sync_running_system_roles()
            gateway.invalidate_cache()
            return json.dumps({"status": "deleted"})

        return json.dumps({"error": f"Unsupported action: {action}"})

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.agent import Agent
    from app.settings import ModelParams, RoleConfig, RoleModelConfig

from app.tools import Tool


def _find_role_by_name(roles: list[RoleConfig], role_name: str) -> RoleConfig | None:
    for role in roles:
        if role.name == role_name:
            return role
    return None


def _sync_running_system_roles() -> None:
    from app.graph_service import sync_assistant_role, sync_tab_leaders

    sync_assistant_role(reason="assistant role updated")
    sync_tab_leaders(reason="leader role updated")


def _resolve_role_model(
    requested: object,
    *,
    current: RoleModelConfig | None,
    provided: bool,
) -> tuple[RoleModelConfig | None, str | None]:
    from app.settings import RoleModelConfig, find_provider, get_settings

    if not provided:
        return current, None
    if requested is None:
        return None, None
    if not isinstance(requested, dict):
        return None, "model must be an object or null"

    provider_id = requested.get("provider_id")
    model = requested.get("model")

    if not isinstance(provider_id, str) or not provider_id.strip():
        return None, "model.provider_id must be a non-empty string"
    if not isinstance(model, str) or not model.strip():
        return None, "model.model must be a non-empty string"
    if find_provider(get_settings(), provider_id.strip()) is None:
        return None, f"Provider '{provider_id.strip()}' not found"

    return (
        RoleModelConfig(
            provider_id=provider_id.strip(),
            model=model.strip(),
        ),
        None,
    )


def _resolve_role_model_params(
    requested: object,
    *,
    current: ModelParams | None,
    provided: bool,
) -> tuple[ModelParams | None, str | None]:
    from app.settings import build_model_params_from_mapping

    if not provided:
        return current, None

    try:
        return build_model_params_from_mapping(requested), None
    except ValueError as exc:
        return None, str(exc)


def _enforce_builtin_role_guards(
    role: RoleConfig,
    *,
    new_name: str | None,
    description: str | None,
    system_prompt: str | None,
    next_included_tools: list[str],
    next_excluded_tools: list[str],
) -> str | None:
    from app.settings import is_builtin_role_name

    if not is_builtin_role_name(role.name):
        return None
    if new_name is not None and new_name != role.name:
        return f"Cannot rename built-in role '{role.name}'"
    if description is not None and description != role.description:
        return (
            f"Cannot modify built-in role '{role.name}' fields other than "
            "model or model_params"
        )
    if system_prompt is not None and system_prompt != role.system_prompt:
        return (
            f"Cannot modify built-in role '{role.name}' fields other than "
            "model or model_params"
        )
    if (
        next_included_tools != role.included_tools
        or next_excluded_tools != role.excluded_tools
    ):
        return (
            f"Cannot modify built-in role '{role.name}' fields other than "
            "model or model_params"
        )
    return None


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
        from app.providers.gateway import gateway
        from app.settings import (
            RoleConfig,
            clear_role_references,
            get_settings,
            is_builtin_role_name,
            normalize_tool_names,
            rename_role_references,
            save_settings,
            serialize_role,
            validate_role_tool_config,
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
            if not isinstance(role_name, str) or not role_name.strip():
                return json.dumps({"error": "Role name is required"})
            if not isinstance(description, str) or not description.strip():
                return json.dumps({"error": "Role description is required"})
            if not isinstance(system_prompt, str):
                return json.dumps({"error": "system_prompt is required"})
            if _find_role_by_name(settings.roles, role_name.strip()) is not None:
                return json.dumps(
                    {"error": f"Role '{role_name.strip()}' already exists"}
                )

            next_included = normalize_tool_names(included_tools or [])
            next_excluded = normalize_tool_names(excluded_tools or [])
            try:
                validate_role_tool_config(next_included, next_excluded)
            except ValueError as exc:
                return json.dumps({"error": str(exc)})

            next_model, role_model_error = _resolve_role_model(
                role_model,
                current=None,
                provided="model" in args,
            )
            if role_model_error is not None:
                return json.dumps({"error": role_model_error})
            next_model_params, role_model_params_error = _resolve_role_model_params(
                role_model_params,
                current=None,
                provided="model_params" in args,
            )
            if role_model_params_error is not None:
                return json.dumps({"error": role_model_params_error})

            new_role = RoleConfig(
                name=role_name.strip(),
                description=description.strip(),
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

            target_role = _find_role_by_name(settings.roles, role_name)
            if target_role is None:
                return json.dumps({"error": f"Role '{role_name}' not found"})

            next_included = normalize_tool_names(
                included_tools
                if included_tools is not None
                else target_role.included_tools
            )
            next_excluded = normalize_tool_names(
                excluded_tools
                if excluded_tools is not None
                else target_role.excluded_tools
            )
            try:
                validate_role_tool_config(next_included, next_excluded)
            except ValueError as exc:
                return json.dumps({"error": str(exc)})

            next_model, role_model_error = _resolve_role_model(
                role_model,
                current=target_role.model,
                provided="model" in args,
            )
            if role_model_error is not None:
                return json.dumps({"error": role_model_error})
            next_model_params, role_model_params_error = _resolve_role_model_params(
                role_model_params,
                current=target_role.model_params,
                provided="model_params" in args,
            )
            if role_model_params_error is not None:
                return json.dumps({"error": role_model_params_error})

            stripped_name = None
            if new_name is not None:
                stripped_name = new_name.strip()
                if not stripped_name:
                    return json.dumps({"error": "Role name is required"})
                if any(
                    other.name == stripped_name and other.name != target_role.name
                    for other in settings.roles
                ):
                    return json.dumps(
                        {"error": f"Role '{stripped_name}' already exists"}
                    )
            stripped_description = None
            if description is not None:
                stripped_description = description.strip()
                if not stripped_description:
                    return json.dumps({"error": "Role description is required"})

            builtin_error = _enforce_builtin_role_guards(
                target_role,
                new_name=stripped_name,
                description=stripped_description,
                system_prompt=system_prompt,
                next_included_tools=next_included,
                next_excluded_tools=next_excluded,
            )
            if builtin_error is not None:
                return json.dumps({"error": builtin_error})

            previous_name = target_role.name
            if stripped_name is not None:
                target_role.name = stripped_name
                rename_role_references(settings, previous_name, target_role.name)
            if stripped_description is not None:
                target_role.description = stripped_description
            if system_prompt is not None:
                target_role.system_prompt = system_prompt
            if "model" in args:
                target_role.model = next_model
            if "model_params" in args:
                target_role.model_params = next_model_params
            target_role.included_tools = next_included
            target_role.excluded_tools = next_excluded
            save_settings(settings)
            _sync_running_system_roles()
            gateway.invalidate_cache()
            return json.dumps(serialize_role(target_role))

        if action == "delete":
            if not isinstance(role_name, str) or not role_name:
                return json.dumps({"error": "name is required"})
            if is_builtin_role_name(role_name):
                return json.dumps(
                    {"error": f"Cannot delete built-in role '{role_name}'"}
                )

            target_role = _find_role_by_name(settings.roles, role_name)
            if target_role is None:
                return json.dumps({"error": f"Role '{role_name}' not found"})

            settings.roles = [
                existing for existing in settings.roles if existing != target_role
            ]
            clear_role_references(settings, role_name)
            save_settings(settings)
            _sync_running_system_roles()
            gateway.invalidate_cache()
            return json.dumps({"status": "deleted"})

        return json.dumps({"error": f"Unsupported action: {action}"})

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.agent import Agent
    from app.settings import RoleConfig

from app.tools import Tool


def _find_role_by_name(roles: list[RoleConfig], role_name: str) -> RoleConfig | None:
    for role in roles:
        if role.name == role_name:
            return role
    return None


class ManageRolesTool(Tool):
    name = "manage_roles"
    agent_visible = False
    description = (
        "Manage Role configuration. Supports listing, creating, updating, "
        "and deleting roles. Built-in roles cannot be deleted or renamed."
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
            "system_prompt": {
                "type": "string",
                "description": "Role system prompt",
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
        from app.settings import (
            RoleConfig,
            get_settings,
            is_builtin_role_name,
            normalize_tool_names,
            save_settings,
            serialize_role,
            validate_role_tool_config,
        )

        action = args.get("action")
        role_name = args.get("name")
        new_name = args.get("new_name")
        system_prompt = args.get("system_prompt")
        included_tools = args.get("included_tools")
        excluded_tools = args.get("excluded_tools")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if role_name is not None and not isinstance(role_name, str):
            return json.dumps({"error": "name must be a string"})
        if new_name is not None and not isinstance(new_name, str):
            return json.dumps({"error": "new_name must be a string"})
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

            new_role = RoleConfig(
                name=role_name.strip(),
                system_prompt=system_prompt,
                included_tools=next_included,
                excluded_tools=next_excluded,
            )
            settings.roles.append(new_role)
            save_settings(settings)
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

            if new_name is not None:
                stripped_name = new_name.strip()
                if not stripped_name:
                    return json.dumps({"error": "Role name is required"})
                if (
                    is_builtin_role_name(target_role.name)
                    and stripped_name != target_role.name
                ):
                    return json.dumps(
                        {"error": f"Cannot rename built-in role '{target_role.name}'"}
                    )
                if any(
                    other.name == stripped_name and other.name != target_role.name
                    for other in settings.roles
                ):
                    return json.dumps(
                        {"error": f"Role '{stripped_name}' already exists"}
                    )
                target_role.name = stripped_name

            if system_prompt is not None:
                target_role.system_prompt = system_prompt
            target_role.included_tools = next_included
            target_role.excluded_tools = next_excluded
            save_settings(settings)
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
            save_settings(settings)
            return json.dumps({"status": "deleted"})

        return json.dumps({"error": f"Unsupported action: {action}"})

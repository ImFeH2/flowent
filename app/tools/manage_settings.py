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
        "leader": {
            "role_name": settings.leader.role_name,
        },
        "model": {
            "active_provider_id": settings.model.active_provider_id,
            "active_model": settings.model.active_model,
            "timeout_ms": settings.model.timeout_ms,
            "retry_policy": settings.model.retry_policy,
            "max_retries": settings.model.max_retries,
            "retry_initial_delay_seconds": settings.model.retry_initial_delay_seconds,
            "retry_max_delay_seconds": settings.model.retry_max_delay_seconds,
            "retry_backoff_cap_retries": settings.model.retry_backoff_cap_retries,
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
        "Read and update system settings, including the Assistant role, Leader "
        "role, active provider and model, default model params, event log "
        "timestamp format, and other runtime defaults."
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
            "leader_role_name": {
                "type": "string",
                "description": "Role name used by tab Leaders",
            },
            "active_model": {
                "type": "string",
                "description": "Active model name for update",
            },
            "max_retries": {
                "type": "integer",
                "description": "Maximum retries for transient LLM call failures when retry_policy is limited",
            },
            "retry_initial_delay_seconds": {
                "type": "number",
                "description": "Initial exponential backoff delay in seconds",
            },
            "retry_max_delay_seconds": {
                "type": "number",
                "description": "Maximum exponential backoff delay in seconds",
            },
            "retry_backoff_cap_retries": {
                "type": "integer",
                "description": "Retry count where exponential growth stops doubling",
            },
            "retry_policy": {
                "type": "string",
                "enum": ["no_retry", "limited", "unlimited"],
                "description": "System-wide retry policy for transient LLM call failures",
            },
            "timeout_ms": {
                "type": "integer",
                "description": "Single LLM request timeout in milliseconds",
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
        from app.graph_service import sync_assistant_role, sync_tab_leaders
        from app.providers.gateway import gateway
        from app.settings import (
            build_default_model_params,
            build_model_max_retries,
            build_model_params_from_mapping,
            build_model_retry_backoff_cap_retries,
            build_model_retry_initial_delay_seconds,
            build_model_retry_max_delay_seconds,
            build_model_retry_policy,
            build_model_timeout_ms,
            find_role,
            get_settings,
            save_settings,
            validate_model_retry_backoff_settings,
        )

        action = args.get("action")
        assistant_role_name = args.get("assistant_role_name")
        leader_role_name = args.get("leader_role_name")
        active_provider_id = args.get("active_provider_id")
        active_model = args.get("active_model")
        timeout_ms = args.get("timeout_ms")
        retry_policy = args.get("retry_policy")
        max_retries = args.get("max_retries")
        retry_initial_delay_seconds = args.get("retry_initial_delay_seconds")
        retry_max_delay_seconds = args.get("retry_max_delay_seconds")
        retry_backoff_cap_retries = args.get("retry_backoff_cap_retries")
        model_params = args.get("model_params")
        timestamp_format = args.get("timestamp_format")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if assistant_role_name is not None and not isinstance(assistant_role_name, str):
            return json.dumps({"error": "assistant_role_name must be a string"})
        if leader_role_name is not None and not isinstance(leader_role_name, str):
            return json.dumps({"error": "leader_role_name must be a string"})
        if active_provider_id is not None and not isinstance(active_provider_id, str):
            return json.dumps({"error": "active_provider_id must be a string"})
        if active_model is not None and not isinstance(active_model, str):
            return json.dumps({"error": "active_model must be a string"})
        if retry_policy is not None:
            try:
                build_model_retry_policy(retry_policy, field_name="retry_policy")
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if timeout_ms is not None:
            try:
                build_model_timeout_ms(timeout_ms, field_name="timeout_ms")
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if max_retries is not None:
            try:
                build_model_max_retries(max_retries, field_name="max_retries")
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if retry_initial_delay_seconds is not None:
            try:
                build_model_retry_initial_delay_seconds(
                    retry_initial_delay_seconds,
                    field_name="retry_initial_delay_seconds",
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if retry_max_delay_seconds is not None:
            try:
                build_model_retry_max_delay_seconds(
                    retry_max_delay_seconds,
                    field_name="retry_max_delay_seconds",
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
        if retry_backoff_cap_retries is not None:
            try:
                build_model_retry_backoff_cap_retries(
                    retry_backoff_cap_retries,
                    field_name="retry_backoff_cap_retries",
                )
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

        next_assistant_role_name = settings.assistant.role_name
        if assistant_role_name is not None:
            next_role_name = assistant_role_name.strip()
            if not next_role_name:
                return json.dumps({"error": "assistant_role_name must not be empty"})
            if find_role(settings, next_role_name) is None:
                return json.dumps({"error": f"Role '{next_role_name}' not found"})
            next_assistant_role_name = next_role_name

        next_leader_role_name = settings.leader.role_name
        if leader_role_name is not None:
            next_role_name = leader_role_name.strip()
            if not next_role_name:
                return json.dumps({"error": "leader_role_name must not be empty"})
            if find_role(settings, next_role_name) is None:
                return json.dumps({"error": f"Role '{next_role_name}' not found"})
            next_leader_role_name = next_role_name

        next_active_provider_id = settings.model.active_provider_id
        if active_provider_id is not None:
            next_active_provider_id = active_provider_id

        next_active_model = settings.model.active_model
        if active_model is not None:
            next_active_model = active_model

        next_retry_policy = settings.model.retry_policy
        if retry_policy is not None:
            next_retry_policy = build_model_retry_policy(
                retry_policy,
                field_name="retry_policy",
            )

        next_timeout_ms = settings.model.timeout_ms
        if timeout_ms is not None:
            next_timeout_ms = build_model_timeout_ms(
                timeout_ms,
                field_name="timeout_ms",
            )

        next_max_retries = settings.model.max_retries
        if max_retries is not None:
            next_max_retries = build_model_max_retries(
                max_retries,
                field_name="max_retries",
            )

        next_retry_initial_delay_seconds = settings.model.retry_initial_delay_seconds
        if retry_initial_delay_seconds is not None:
            next_retry_initial_delay_seconds = build_model_retry_initial_delay_seconds(
                retry_initial_delay_seconds,
                field_name="retry_initial_delay_seconds",
            )

        next_retry_max_delay_seconds = settings.model.retry_max_delay_seconds
        if retry_max_delay_seconds is not None:
            next_retry_max_delay_seconds = build_model_retry_max_delay_seconds(
                retry_max_delay_seconds,
                field_name="retry_max_delay_seconds",
            )

        next_retry_backoff_cap_retries = settings.model.retry_backoff_cap_retries
        if retry_backoff_cap_retries is not None:
            next_retry_backoff_cap_retries = build_model_retry_backoff_cap_retries(
                retry_backoff_cap_retries,
                field_name="retry_backoff_cap_retries",
            )
        try:
            validate_model_retry_backoff_settings(
                retry_initial_delay_seconds=next_retry_initial_delay_seconds,
                retry_max_delay_seconds=next_retry_max_delay_seconds,
            )
        except ValueError as exc:
            return json.dumps({"error": str(exc)})

        next_model_params = settings.model.params
        if "model_params" in args:
            try:
                next_model_params = (
                    build_model_params_from_mapping(model_params)
                    or build_default_model_params()
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})

        next_timestamp_format = settings.event_log.timestamp_format
        if timestamp_format is not None:
            next_timestamp_format = timestamp_format

        settings.assistant.role_name = next_assistant_role_name
        settings.leader.role_name = next_leader_role_name
        settings.model.active_provider_id = next_active_provider_id
        settings.model.active_model = next_active_model
        settings.model.retry_policy = next_retry_policy
        settings.model.timeout_ms = next_timeout_ms
        settings.model.max_retries = next_max_retries
        settings.model.retry_initial_delay_seconds = next_retry_initial_delay_seconds
        settings.model.retry_max_delay_seconds = next_retry_max_delay_seconds
        settings.model.retry_backoff_cap_retries = next_retry_backoff_cap_retries
        settings.model.params = next_model_params
        settings.event_log.timestamp_format = next_timestamp_format

        save_settings(settings)
        sync_assistant_role(reason="assistant settings updated")
        sync_tab_leaders(reason="leader settings updated")
        gateway.invalidate_cache()
        return json.dumps(_serialize_settings(settings))

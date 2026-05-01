from __future__ import annotations

import json
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

if TYPE_CHECKING:
    from flowent_api.agent import Agent

from flowent_api.providers.configuration import serialize_discovered_model_catalog_entry
from flowent_api.providers.management import (
    ProviderNotFoundError,
    create_provider_entry,
    delete_provider_entry,
    list_provider_payloads,
    update_provider_entry,
)
from flowent_api.settings import (
    build_provider_headers,
    build_provider_retry_429_delay_seconds,
)
from flowent_api.tools import Tool, re_raise_interrupt


class ManageProvidersTool(Tool):
    name = "manage_providers"
    description = (
        "Manage LLM provider configuration. Supports listing, creating, "
        "updating, deleting providers, and listing models for a provider."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "create", "update", "delete", "list_models"],
                "description": "Provider management action",
            },
            "id": {
                "type": "string",
                "description": "Target provider ID for update, delete, or list_models",
            },
            "name": {
                "type": "string",
                "description": "Provider display name",
            },
            "type": {
                "type": "string",
                "description": "Provider type, such as openai_compatible",
            },
            "base_url": {
                "type": "string",
                "description": "Provider API base URL",
            },
            "api_key": {
                "type": "string",
                "description": "Provider API key",
            },
            "headers": {
                "type": "object",
                "description": "Provider request header overrides",
                "additionalProperties": {"type": "string"},
            },
            "retry_429_delay_seconds": {
                "type": "integer",
                "description": "Extra wait time in seconds after HTTP 429 before retrying",
            },
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        from flowent_api.providers.gateway import gateway
        from flowent_api.settings import get_settings, save_settings

        on_output: Callable[[str], None] | None = kwargs.get("on_output")
        action = args.get("action")
        provider_id = args.get("id")
        name = args.get("name")
        provider_type = args.get("type")
        base_url = args.get("base_url")
        api_key = args.get("api_key")
        raw_headers = args.get("headers")
        retry_429_delay_seconds = args.get("retry_429_delay_seconds")

        if not isinstance(action, str):
            return json.dumps({"error": "action must be a string"})

        if provider_id is not None and not isinstance(provider_id, str):
            return json.dumps({"error": "id must be a string"})
        if name is not None and not isinstance(name, str):
            return json.dumps({"error": "name must be a string"})
        if provider_type is not None and not isinstance(provider_type, str):
            return json.dumps({"error": "type must be a string"})
        if base_url is not None and not isinstance(base_url, str):
            return json.dumps({"error": "base_url must be a string"})
        if api_key is not None and not isinstance(api_key, str):
            return json.dumps({"error": "api_key must be a string"})
        if raw_headers is not None and not isinstance(raw_headers, dict):
            return json.dumps({"error": "headers must be a JSON object"})
        if retry_429_delay_seconds is not None:
            try:
                build_provider_retry_429_delay_seconds(retry_429_delay_seconds)
            except ValueError as exc:
                return json.dumps({"error": str(exc)})

        try:
            headers = (
                build_provider_headers(raw_headers) if raw_headers is not None else None
            )
        except ValueError as exc:
            return json.dumps({"error": str(exc)})

        settings = get_settings()

        if action == "list":
            return json.dumps(list_provider_payloads(settings, include_api_key=False))

        if action == "create":
            if not isinstance(name, str) or not name.strip():
                return json.dumps({"error": "name is required"})
            if not isinstance(provider_type, str) or not provider_type.strip():
                return json.dumps({"error": "type is required"})
            if not isinstance(base_url, str) or not base_url.strip():
                return json.dumps({"error": "base_url is required"})
            try:
                provider = create_provider_entry(
                    settings,
                    name=name,
                    provider_type=provider_type,
                    base_url=base_url,
                    api_key=api_key or "",
                    raw_headers=headers,
                    raw_retry_429_delay_seconds=(
                        retry_429_delay_seconds
                        if retry_429_delay_seconds is not None
                        else 0
                    ),
                    base_url_required_message="base_url is required",
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
            save_settings(settings)
            gateway.invalidate_cache()
            return json.dumps(
                list_provider_payloads(settings, include_api_key=False)[-1]
            )

        if action == "update":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})

            try:
                provider = update_provider_entry(
                    settings,
                    provider_id,
                    name=name,
                    provider_type=provider_type,
                    base_url=base_url,
                    api_key=api_key,
                    raw_headers=headers,
                    raw_retry_429_delay_seconds=retry_429_delay_seconds,
                )
            except ValueError as exc:
                return json.dumps({"error": str(exc)})
            except ProviderNotFoundError:
                return json.dumps({"error": f"Provider '{provider_id}' not found"})
            save_settings(settings)
            gateway.invalidate_cache()
            return json.dumps(
                list_provider_payloads(settings, include_api_key=False)[
                    settings.providers.index(provider)
                ]
            )

        if action == "delete":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})

            try:
                delete_provider_entry(settings, provider_id)
            except ProviderNotFoundError:
                return json.dumps({"error": f"Provider '{provider_id}' not found"})
            save_settings(settings)
            gateway.invalidate_cache()
            return json.dumps({"status": "deleted"})

        if action == "list_models":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})
            try:
                if on_output is not None:
                    on_output(f"Listing models for {provider_id}\n")
                models = gateway.list_models_for(
                    provider_id,
                    register_interrupt=agent.set_interrupt_callback,
                )
                if on_output is not None:
                    for model in models:
                        on_output(f"{model.id}\n")
                return json.dumps(
                    [
                        serialize_discovered_model_catalog_entry(model)
                        for model in models
                    ]
                )
            except Exception as exc:
                re_raise_interrupt(agent, exc)
                logger.error(
                    "Failed to list models for provider '{}': {}",
                    provider_id,
                    exc,
                )
                return json.dumps({"error": str(exc)})
            finally:
                agent.set_interrupt_callback(None)

        return json.dumps({"error": f"Unsupported action: {action}"})

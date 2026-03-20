from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

if TYPE_CHECKING:
    from app.agent import Agent
    from app.settings import ProviderConfig

from app.tools import Tool


def _serialize_provider(provider: ProviderConfig) -> dict[str, str]:
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
    }


class ManageProvidersTool(Tool):
    name = "manage_providers"
    agent_visible = False
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
        },
        "required": ["action"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        from app.providers.gateway import gateway
        from app.settings import (
            ProviderConfig,
            clear_provider_references,
            get_settings,
            save_settings,
        )

        on_output: Callable[[str], None] | None = kwargs.get("on_output")
        action = args.get("action")
        provider_id = args.get("id")
        name = args.get("name")
        provider_type = args.get("type")
        base_url = args.get("base_url")
        api_key = args.get("api_key")

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

        settings = get_settings()

        if action == "list":
            return json.dumps(
                [_serialize_provider(provider) for provider in settings.providers]
            )

        if action == "create":
            if not isinstance(name, str) or not name.strip():
                return json.dumps({"error": "name is required"})
            if not isinstance(provider_type, str) or not provider_type.strip():
                return json.dumps({"error": "type is required"})
            if not isinstance(base_url, str) or not base_url.strip():
                return json.dumps({"error": "base_url is required"})

            provider = ProviderConfig(
                id=str(uuid.uuid4()),
                name=name,
                type=provider_type,
                base_url=base_url,
                api_key=api_key or "",
            )
            settings.providers.append(provider)
            save_settings(settings)
            gateway.invalidate_cache()
            return json.dumps(_serialize_provider(provider))

        if action == "update":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})

            for provider in settings.providers:
                if provider.id != provider_id:
                    continue
                if name is not None:
                    provider.name = name
                if provider_type is not None:
                    provider.type = provider_type
                if base_url is not None:
                    provider.base_url = base_url
                if api_key is not None:
                    provider.api_key = api_key
                save_settings(settings)
                gateway.invalidate_cache()
                return json.dumps(_serialize_provider(provider))

            return json.dumps({"error": f"Provider '{provider_id}' not found"})

        if action == "delete":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})

            for index, provider in enumerate(settings.providers):
                if provider.id != provider_id:
                    continue
                settings.providers.pop(index)
                clear_provider_references(settings, provider_id)
                save_settings(settings)
                gateway.invalidate_cache()
                return json.dumps({"status": "deleted"})

            return json.dumps({"error": f"Provider '{provider_id}' not found"})

        if action == "list_models":
            if not isinstance(provider_id, str) or not provider_id:
                return json.dumps({"error": "id is required"})
            try:
                if on_output is not None:
                    on_output(f"Listing models for {provider_id}\n")
                model_ids = [model.id for model in gateway.list_models_for(provider_id)]
                if on_output is not None:
                    for model_id in model_ids:
                        on_output(f"{model_id}\n")
                return json.dumps(model_ids)
            except Exception as exc:
                logger.error(
                    "Failed to list models for provider '{}': {}",
                    provider_id,
                    exc,
                )
                return json.dumps({"error": str(exc)})

        return json.dumps({"error": f"Unsupported action: {action}"})

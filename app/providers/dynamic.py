from __future__ import annotations

from collections.abc import Callable
from typing import Any

from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.providers import LLMProvider
from app.providers.registry import ProviderType


class DynamicProvider(LLMProvider):
    def __init__(self) -> None:
        self._cached_key: tuple[str, str, str, str] | None = None
        self._cached_provider: LLMProvider | None = None

    def _resolve(self) -> LLMProvider:
        from app.providers.registry import create_provider
        from app.user_settings import find_provider, get_user_settings

        us = get_user_settings()
        ms = us.model
        cfg = find_provider(ms, ms.active_provider)

        if cfg:
            provider_name = cfg.name
            provider_type = ProviderType(cfg.provider_type)
            api_base_url = cfg.api_base_url
            api_key = cfg.api_key
            model = ms.active_model
        else:
            provider_name = "OpenRouter"
            provider_type = ProviderType.OPENAI
            api_base_url = "https://openrouter.ai/api/v1"
            api_key = ""
            model = ms.active_model

        key = (provider_name, provider_type, api_base_url, model)

        if self._cached_key == key and self._cached_provider is not None:
            return self._cached_provider

        logger.debug(
            "DynamicProvider resolved: provider={}, type={}, model={}, base_url={}",
            provider_name,
            provider_type,
            model,
            api_base_url,
        )

        provider = create_provider(
            provider_name=provider_name,
            provider_type=provider_type,
            api_base_url=api_base_url,
            api_key=api_key,
            model=model,
        )

        self._cached_key = key
        self._cached_provider = provider
        return provider

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        return self._resolve().chat(messages, tools, on_chunk)

    def list_models(self) -> list[ModelInfo]:
        return self._resolve().list_models()

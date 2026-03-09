from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.providers import LLMProvider


class ProviderGateway:
    def __init__(self) -> None:
        self._cache: dict[tuple[str, ...], LLMProvider] = {}
        self._lock = threading.Lock()

    def invalidate_cache(self) -> None:
        with self._lock:
            self._cache.clear()

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        provider = self._resolve()
        return provider.chat(messages, tools, on_chunk)

    def list_models_for(self, provider_id: str) -> list[ModelInfo]:
        from app.providers.registry import create_provider
        from app.settings import find_provider, get_settings

        settings = get_settings()
        cfg = find_provider(settings, provider_id)
        if cfg is None:
            return []

        provider = create_provider(
            provider_type=cfg.type,
            base_url=cfg.base_url,
            api_key=cfg.api_key,
            model="",
            provider_name=cfg.name,
        )
        return provider.list_models()

    def _resolve(self) -> LLMProvider:
        from app.providers.registry import create_provider
        from app.settings import find_provider, get_settings

        settings = get_settings()
        ms = settings.model
        cfg = find_provider(settings, ms.active_provider_id)

        if cfg is None:
            raise RuntimeError("No active provider configured")

        provider_type = cfg.type
        base_url = cfg.base_url
        api_key = cfg.api_key
        model = ms.active_model
        provider_name = cfg.name
        cache_key = (
            cfg.id,
            provider_type,
            base_url,
            api_key,
            provider_name,
            model,
        )

        with self._lock:
            if cache_key in self._cache:
                return self._cache[cache_key]

            logger.debug(
                "ProviderGateway resolved: name={}, type={}, model={}",
                provider_name,
                provider_type,
                model,
            )

            provider = create_provider(
                provider_type=provider_type,
                base_url=base_url,
                api_key=api_key,
                model=model,
                provider_name=provider_name,
            )

            self._cache[cache_key] = provider
            return provider


gateway = ProviderGateway()

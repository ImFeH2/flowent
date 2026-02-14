from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.models import LLMResponse, ModelInfo
from app.providers import LLMProvider


class DynamicProvider(LLMProvider):
    def __init__(self) -> None:
        self._cached_key: tuple[str, str, str, str] | None = None
        self._cached_provider: LLMProvider | None = None

    def _resolve(self) -> LLMProvider:
        from app.providers.registry import create_provider
        from app.user_settings import get_user_settings, find_provider

        us = get_user_settings()
        ms = us.model
        cfg = find_provider(ms, ms.active_provider)

        if cfg:
            key = (cfg.provider_type, cfg.api_base_url, cfg.api_key, ms.active_model)
        else:
            key = ("openai", "https://openrouter.ai/api/v1", "", ms.active_model)

        if self._cached_key == key and self._cached_provider is not None:
            return self._cached_provider

        if cfg:
            provider = create_provider(
                provider_type=cfg.provider_type,
                api_base_url=cfg.api_base_url,
                api_key=cfg.api_key,
                model=ms.active_model,
            )
        else:
            provider = create_provider(
                provider_type="openai",
                api_base_url="https://openrouter.ai/api/v1",
                model=ms.active_model,
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

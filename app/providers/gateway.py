from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.providers import LLMProvider
from app.settings import merge_model_params


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
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        role_name: str | None = None,
    ) -> LLMResponse:
        from app.settings import find_role, get_settings

        settings = get_settings()
        role_cfg = find_role(settings, role_name) if role_name else None
        provider = self._resolve(settings=settings, role_cfg=role_cfg)
        model_params = merge_model_params(
            settings.model.params,
            role_cfg.model_params if role_cfg is not None else None,
        )
        return provider.chat(
            messages,
            tools,
            on_chunk,
            register_interrupt,
            model_params,
        )

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

    def _resolve(
        self,
        *,
        settings=None,
        role_cfg=None,
        role_name: str | None = None,
    ) -> LLMProvider:
        from app.providers.registry import create_provider
        from app.settings import find_provider, find_role, get_settings

        if settings is None:
            settings = get_settings()
        provider_id = settings.model.active_provider_id
        model = settings.model.active_model

        if role_cfg is None and role_name:
            role_cfg = find_role(settings, role_name)
        if (
            role_cfg is not None
            and role_cfg.model is not None
            and role_cfg.model.provider_id
            and role_cfg.model.model
        ):
            provider_id = role_cfg.model.provider_id
            model = role_cfg.model.model

        if not provider_id:
            raise RuntimeError("No active provider configured")

        cfg = find_provider(settings, provider_id)
        if cfg is None:
            raise RuntimeError(f"Provider '{provider_id}' not found")

        provider_type = cfg.type
        base_url = cfg.base_url
        api_key = cfg.api_key
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

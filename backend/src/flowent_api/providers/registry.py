from __future__ import annotations

from enum import StrEnum
from typing import Protocol

from flowent_api.providers import LLMProvider
from flowent_api.providers.base_url import resolve_provider_base_url


class ProviderType(StrEnum):
    OPENAI_COMPATIBLE = "openai_compatible"
    OPENAI_RESPONSES = "openai_responses"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"


class ProviderFactory(Protocol):
    def __call__(
        self,
        *,
        provider_name: str,
        api_base_url: str,
        api_key: str,
        headers: dict[str, str],
        model: str,
        request_timeout_seconds: float,
    ) -> LLMProvider: ...


def _build_openai_compatible_provider(
    *,
    provider_name: str,
    api_base_url: str,
    api_key: str,
    headers: dict[str, str],
    model: str,
    request_timeout_seconds: float,
) -> LLMProvider:
    from flowent_api.providers.openai import OpenAIProvider

    return OpenAIProvider(
        provider_name=provider_name,
        api_base_url=api_base_url,
        api_key=api_key,
        headers=headers,
        model=model,
        request_timeout_seconds=request_timeout_seconds,
    )


def _build_openai_responses_provider(
    *,
    provider_name: str,
    api_base_url: str,
    api_key: str,
    headers: dict[str, str],
    model: str,
    request_timeout_seconds: float,
) -> LLMProvider:
    from flowent_api.providers.openai_responses import OpenAIResponsesProvider

    return OpenAIResponsesProvider(
        provider_name=provider_name,
        api_base_url=api_base_url,
        api_key=api_key,
        headers=headers,
        model=model,
        request_timeout_seconds=request_timeout_seconds,
    )


def _build_anthropic_provider(
    *,
    provider_name: str,
    api_base_url: str,
    api_key: str,
    headers: dict[str, str],
    model: str,
    request_timeout_seconds: float,
) -> LLMProvider:
    from flowent_api.providers.anthropic import AnthropicProvider

    return AnthropicProvider(
        provider_name=provider_name,
        api_base_url=api_base_url,
        api_key=api_key,
        headers=headers,
        model=model,
        request_timeout_seconds=request_timeout_seconds,
    )


def _build_gemini_provider(
    *,
    provider_name: str,
    api_base_url: str,
    api_key: str,
    headers: dict[str, str],
    model: str,
    request_timeout_seconds: float,
) -> LLMProvider:
    from flowent_api.providers.gemini import GeminiProvider

    return GeminiProvider(
        provider_name=provider_name,
        api_base_url=api_base_url,
        api_key=api_key,
        headers=headers,
        model=model,
        request_timeout_seconds=request_timeout_seconds,
    )


PROVIDER_FACTORIES: dict[ProviderType, ProviderFactory] = {
    ProviderType.OPENAI_COMPATIBLE: _build_openai_compatible_provider,
    ProviderType.OPENAI_RESPONSES: _build_openai_responses_provider,
    ProviderType.ANTHROPIC: _build_anthropic_provider,
    ProviderType.GEMINI: _build_gemini_provider,
}


def create_provider(
    provider_type: str,
    base_url: str,
    api_key: str = "",
    headers: dict[str, str] | None = None,
    model: str = "",
    provider_name: str = "",
    request_timeout_seconds: float = 120.0,
) -> LLMProvider:
    try:
        normalized_type = ProviderType(provider_type.lower())
    except ValueError as exc:
        raise ValueError(f"Unknown provider type: {provider_type}") from exc

    resolved_base_url = resolve_provider_base_url(normalized_type, base_url)
    return PROVIDER_FACTORIES[normalized_type](
        provider_name=provider_name,
        api_base_url=resolved_base_url,
        api_key=api_key,
        headers=headers or {},
        model=model,
        request_timeout_seconds=request_timeout_seconds,
    )

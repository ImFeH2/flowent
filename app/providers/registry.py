from __future__ import annotations

from enum import StrEnum

from app.providers import LLMProvider
from app.providers.base_url import resolve_provider_base_url


class ProviderType(StrEnum):
    OPENAI_COMPATIBLE = "openai_compatible"
    OPENAI_RESPONSES = "openai_responses"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"


def create_provider(
    provider_type: str,
    base_url: str,
    api_key: str = "",
    model: str = "",
    provider_name: str = "",
) -> LLMProvider:
    pt = provider_type.lower()
    resolved_base_url = resolve_provider_base_url(pt, base_url)

    if pt == ProviderType.OPENAI_COMPATIBLE:
        from app.providers.openai import OpenAIProvider

        return OpenAIProvider(
            provider_name=provider_name,
            api_base_url=resolved_base_url,
            api_key=api_key,
            model=model,
        )

    if pt == ProviderType.OPENAI_RESPONSES:
        from app.providers.openai_responses import OpenAIResponsesProvider

        return OpenAIResponsesProvider(
            provider_name=provider_name,
            api_base_url=resolved_base_url,
            api_key=api_key,
            model=model,
        )

    if pt == ProviderType.ANTHROPIC:
        from app.providers.anthropic import AnthropicProvider

        return AnthropicProvider(
            provider_name=provider_name,
            api_base_url=resolved_base_url,
            api_key=api_key,
            model=model,
        )

    if pt == ProviderType.GEMINI:
        from app.providers.gemini import GeminiProvider

        return GeminiProvider(
            provider_name=provider_name,
            api_base_url=resolved_base_url,
            api_key=api_key,
            model=model,
        )

    raise ValueError(f"Unknown provider type: {provider_type}")

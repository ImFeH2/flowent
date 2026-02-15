from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.providers import LLMProvider


class ProviderType(StrEnum):
    OPENAI = "OpenAI"
    ANTHROPIC = "Anthropic"
    GEMINI = "Gemini"
    OLLAMA = "Ollama"


@dataclass
class ProviderDef:
    name: str
    provider_type: ProviderType
    api_base_url: str


BUILTIN_PROVIDERS: list[ProviderDef] = [
    ProviderDef("OpenRouter", ProviderType.OPENAI, "https://openrouter.ai/api/v1"),
    ProviderDef(
        "ModelScope",
        ProviderType.OPENAI,
        "https://api-inference.modelscope.cn/v1",
    ),
]


def create_provider(
    provider_name: str,
    provider_type: ProviderType,
    api_base_url: str,
    api_key: str = "",
    model: str = "",
) -> LLMProvider:
    if provider_type == ProviderType.OPENAI:
        from app.providers.openai import OpenAIProvider

        return OpenAIProvider(
            provider_name=provider_name,
            api_base_url=api_base_url,
            api_key=api_key,
            model=model,
        )
    if provider_type == ProviderType.ANTHROPIC:
        from app.providers.anthropic import AnthropicProvider

        return AnthropicProvider(
            provider_name=provider_name,
            api_base_url=api_base_url,
            api_key=api_key,
            model=model,
        )
    if provider_type == ProviderType.GEMINI:
        from app.providers.gemini import GeminiProvider

        return GeminiProvider(
            provider_name=provider_name,
            api_base_url=api_base_url,
            api_key=api_key,
            model=model,
        )
    if provider_type == ProviderType.OLLAMA:
        from app.providers.ollama import OllamaProvider

        return OllamaProvider(
            provider_name=provider_name,
            api_base_url=api_base_url,
            model=model,
        )

    raise ValueError(f"Unknown provider type: {provider_type}")

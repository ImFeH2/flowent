from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.providers import LLMProvider


class ProviderType(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OLLAMA = "ollama"


@dataclass
class ProviderDef:
    name: str
    provider_type: ProviderType
    api_base_url: str


BUILTIN_PROVIDERS: list[ProviderDef] = [
    ProviderDef("OpenRouter", ProviderType.OPENAI, "https://openrouter.ai/api/v1"),
    ProviderDef("ModelScope", ProviderType.OPENAI, "https://api-inference.modelscope.cn/v1"),
]


def create_provider(
    provider_type: str | ProviderType,
    api_base_url: str,
    api_key: str = "",
    model: str = "",
) -> LLMProvider:
    pt = ProviderType(provider_type)

    if pt == ProviderType.OPENAI:
        from app.providers.openai import OpenAIProvider
        return OpenAIProvider(api_base_url=api_base_url, api_key=api_key, model=model)
    elif pt == ProviderType.ANTHROPIC:
        from app.providers.anthropic import AnthropicProvider
        return AnthropicProvider(api_base_url=api_base_url, api_key=api_key, model=model)
    elif pt == ProviderType.GEMINI:
        from app.providers.gemini import GeminiProvider
        return GeminiProvider(api_base_url=api_base_url, api_key=api_key, model=model)
    elif pt == ProviderType.OLLAMA:
        from app.providers.ollama import OllamaProvider
        return OllamaProvider(api_base_url=api_base_url, model=model)

    raise ValueError(f"Unknown provider type: {pt}")

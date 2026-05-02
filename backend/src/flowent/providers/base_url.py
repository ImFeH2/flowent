from __future__ import annotations

from typing import Final

PROVIDER_VERSION_SUFFIXES: Final[dict[str, str]] = {
    "openai_compatible": "/v1",
    "openai_responses": "/v1",
    "anthropic": "/v1",
    "gemini": "/v1beta",
}

PROVIDER_REQUEST_PATHS: Final[dict[str, str]] = {
    "openai_compatible": "/chat/completions",
    "openai_responses": "/responses",
    "anthropic": "/messages",
    "gemini": "/models/{model}:streamGenerateContent",
}

_KNOWN_SUFFIXES: Final[tuple[str, ...]] = tuple(
    sorted(set(PROVIDER_VERSION_SUFFIXES.values()), key=len, reverse=True)
)


def _normalize_raw_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        raise ValueError("Provider base_url is required")
    return normalized


def _normalize_provider_type(provider_type: str) -> str:
    normalized = provider_type.strip().lower()
    if normalized not in PROVIDER_VERSION_SUFFIXES:
        raise ValueError(f"Unknown provider type: {provider_type}")
    return normalized


def resolve_provider_base_url(provider_type: str, base_url: str) -> str:
    normalized_type = _normalize_provider_type(provider_type)
    normalized_base_url = _normalize_raw_base_url(base_url)
    expected_suffix = PROVIDER_VERSION_SUFFIXES[normalized_type]
    lower_base_url = normalized_base_url.lower()

    for suffix in _KNOWN_SUFFIXES:
        if not lower_base_url.endswith(suffix):
            continue
        if suffix != expected_suffix:
            raise ValueError(
                f"Provider base_url suffix '{suffix}' does not match type "
                f"'{normalized_type}' (expected '{expected_suffix}')"
            )
        return normalized_base_url

    return f"{normalized_base_url}{expected_suffix}"


def build_provider_request_preview(provider_type: str, base_url: str) -> str:
    normalized_type = _normalize_provider_type(provider_type)
    resolved_base_url = resolve_provider_base_url(normalized_type, base_url)
    return f"{resolved_base_url}{PROVIDER_REQUEST_PATHS[normalized_type]}"

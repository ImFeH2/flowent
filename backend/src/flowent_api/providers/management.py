from __future__ import annotations

import uuid

from flowent_api.providers.configuration import (
    apply_provider_update,
    build_provider_config,
    serialize_provider,
)
from flowent_api.settings import (
    ProviderConfig,
    ProviderModelCatalogEntry,
    Settings,
    clear_provider_references,
    find_provider,
)


class ProviderNotFoundError(LookupError):
    def __init__(self, provider_id: str) -> None:
        super().__init__(provider_id)
        self.provider_id = provider_id


def list_provider_payloads(
    settings: Settings,
    *,
    include_api_key: bool = True,
) -> list[dict[str, object]]:
    return [
        serialize_provider(provider, include_api_key=include_api_key)
        for provider in settings.providers
    ]


def create_provider_entry(
    settings: Settings,
    *,
    name: str,
    provider_type: str,
    base_url: str,
    api_key: str = "",
    raw_headers: object = None,
    raw_retry_429_delay_seconds: object = 0,
    models: list[ProviderModelCatalogEntry] | None = None,
    base_url_required_message: str = "base_url is required",
) -> ProviderConfig:
    provider = build_provider_config(
        provider_id=str(uuid.uuid4()),
        name=name,
        provider_type=provider_type,
        base_url=base_url,
        api_key=api_key,
        raw_headers=raw_headers,
        raw_retry_429_delay_seconds=raw_retry_429_delay_seconds,
        models=models,
        base_url_required_message=base_url_required_message,
    )
    settings.providers.append(provider)
    return provider


def update_provider_entry(
    settings: Settings,
    provider_id: str,
    *,
    name: str | None = None,
    provider_type: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    raw_headers: object | None = None,
    raw_retry_429_delay_seconds: object | None = None,
    models: list[ProviderModelCatalogEntry] | None = None,
) -> ProviderConfig:
    provider = find_provider(settings, provider_id)
    if provider is None:
        raise ProviderNotFoundError(provider_id)
    apply_provider_update(
        provider,
        name=name,
        provider_type=provider_type,
        base_url=base_url,
        api_key=api_key,
        raw_headers=raw_headers,
        raw_retry_429_delay_seconds=raw_retry_429_delay_seconds,
        models=models,
    )
    return provider


def delete_provider_entry(settings: Settings, provider_id: str) -> None:
    provider = find_provider(settings, provider_id)
    if provider is None:
        raise ProviderNotFoundError(provider_id)
    settings.providers = [item for item in settings.providers if item.id != provider_id]
    clear_provider_references(settings, provider_id)

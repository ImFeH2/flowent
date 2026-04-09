import asyncio

import pytest
from fastapi import HTTPException

from app.models import ModelInfo
from app.routes.providers_route import (
    CreateProviderRequest,
    ListModelsRequest,
    UpdateProviderRequest,
    create_provider,
    list_provider_models,
    update_provider,
)
from app.settings import ProviderConfig, Settings


def test_create_provider_normalizes_base_url(monkeypatch):
    settings = Settings()
    saved: list[Settings] = []
    invalidations: list[str] = []

    monkeypatch.setattr("app.routes.providers_route.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.providers_route.save_settings",
        lambda current: saved.append(current),
    )
    monkeypatch.setattr(
        "app.providers.gateway.gateway.invalidate_cache",
        lambda: invalidations.append("invalidate"),
    )

    result = asyncio.run(
        create_provider(
            CreateProviderRequest(
                name="Primary",
                type="openai_responses",
                base_url="https://api.openai.com",
                api_key="secret",
                headers={"Authorization": "Bearer override"},
            )
        )
    )

    assert result["base_url"] == "https://api.openai.com/v1"
    assert result["headers"] == {"Authorization": "Bearer override"}
    assert settings.providers[0].base_url == "https://api.openai.com/v1"
    assert settings.providers[0].headers == {"Authorization": "Bearer override"}
    assert saved == [settings]
    assert invalidations == ["invalidate"]


def test_create_provider_rejects_mismatched_base_url_suffix(monkeypatch):
    monkeypatch.setattr("app.routes.providers_route.get_settings", lambda: Settings())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_provider(
                CreateProviderRequest(
                    name="Gemini",
                    type="gemini",
                    base_url="https://api.example.com/v1",
                    api_key="secret",
                )
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == (
        "Provider base_url suffix '/v1' does not match type 'gemini' "
        "(expected '/v1beta')"
    )


def test_update_provider_rejects_type_change_with_mismatched_existing_suffix(
    monkeypatch,
):
    settings = Settings(
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_compatible",
                base_url="https://api.example.com/v1",
                api_key="secret",
            )
        ]
    )

    monkeypatch.setattr("app.routes.providers_route.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_provider(
                "provider-1",
                UpdateProviderRequest(type="gemini"),
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == (
        "Provider base_url suffix '/v1' does not match type 'gemini' "
        "(expected '/v1beta')"
    )


def test_update_provider_persists_headers(monkeypatch):
    settings = Settings(
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_compatible",
                base_url="https://api.example.com/v1",
                api_key="secret",
                headers={"X-Old": "value"},
            )
        ]
    )
    saved: list[Settings] = []
    invalidations: list[str] = []

    monkeypatch.setattr("app.routes.providers_route.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.providers_route.save_settings",
        lambda current: saved.append(current),
    )
    monkeypatch.setattr(
        "app.providers.gateway.gateway.invalidate_cache",
        lambda: invalidations.append("invalidate"),
    )

    result = asyncio.run(
        update_provider(
            "provider-1",
            UpdateProviderRequest(headers={"X-New": "next"}),
        )
    )

    assert result["headers"] == {"X-New": "next"}
    assert settings.providers[0].headers == {"X-New": "next"}
    assert saved == [settings]
    assert invalidations == ["invalidate"]


def test_create_provider_rejects_non_string_header_values(monkeypatch):
    monkeypatch.setattr("app.routes.providers_route.get_settings", lambda: Settings())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_provider(
                CreateProviderRequest(
                    name="Primary",
                    type="openai_compatible",
                    base_url="https://api.example.com",
                    api_key="secret",
                    headers={"X-Test": 123},
                )
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "headers must be a JSON object of string values"


def test_list_provider_models_runs_gateway_in_threadpool(monkeypatch):
    calls: list[tuple[str, tuple[object, ...]]] = []

    def fake_list_models_for(provider_id: str) -> list[ModelInfo]:
        calls.append(("gateway", (provider_id,)))
        return [ModelInfo(id="gpt-5")]

    async def fake_run_in_threadpool(func, *args):
        calls.append(("threadpool", args))
        return func(*args)

    monkeypatch.setattr(
        "app.providers.gateway.gateway.list_models_for",
        fake_list_models_for,
    )
    monkeypatch.setattr(
        "app.routes.providers_route.run_in_threadpool",
        fake_run_in_threadpool,
    )

    result = asyncio.run(
        list_provider_models(
            ListModelsRequest(provider_id="provider-1"),
        )
    )

    assert result == {"models": [{"id": "gpt-5"}]}
    assert calls == [
        ("threadpool", ("provider-1",)),
        ("gateway", ("provider-1",)),
    ]

from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.models import ModelInfo
from app.network import truncate_text
from app.providers.base_url import resolve_provider_base_url
from app.providers.registry import create_provider as create_llm_provider
from app.settings import (
    PROVIDER_MODEL_SOURCE_OPTIONS,
    ProviderConfig,
    ProviderModelCatalogEntry,
    build_model_context_window_tokens,
    build_model_input_image,
    build_model_output_image,
    build_provider_headers,
    build_provider_retry_429_delay_seconds,
    clear_provider_references,
    find_provider,
    get_settings,
    save_settings,
    serialize_provider,
    serialize_provider_model_catalog_entry,
)

router = APIRouter()


class ProviderModelRequest(BaseModel):
    model: str
    source: str = "manual"
    context_window_tokens: int | None = None
    input_image: bool | None = None
    output_image: bool | None = None


class CreateProviderRequest(BaseModel):
    name: str
    type: str
    base_url: str
    api_key: str = ""
    headers: dict[str, object] | None = None
    retry_429_delay_seconds: int = 0
    models: list[ProviderModelRequest] = Field(default_factory=list)


class UpdateProviderRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    headers: dict[str, object] | None = None
    retry_429_delay_seconds: int | None = None
    models: list[ProviderModelRequest] | None = None


class ProviderDraftRequest(BaseModel):
    provider_id: str | None = None
    name: str | None = None
    type: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    headers: dict[str, object] | None = None


class ListModelsRequest(ProviderDraftRequest):
    pass


class ProviderModelTestRequest(ProviderDraftRequest):
    model: str


def _validate_provider_base_url_input(provider_type: str, base_url: str) -> str:
    raw_base_url = base_url.strip()
    if not raw_base_url:
        raise ValueError("provider base_url is required")
    resolve_provider_base_url(provider_type, raw_base_url)
    return raw_base_url


def _build_provider_model_entry(
    req: ProviderModelRequest,
) -> ProviderModelCatalogEntry:
    model = req.model.strip()
    if not model:
        raise ValueError("models[].model must not be empty")

    source = req.source.strip().lower()
    if source not in PROVIDER_MODEL_SOURCE_OPTIONS:
        raise ValueError("models[].source must be one of: discovered, manual")

    return ProviderModelCatalogEntry(
        model=model,
        source=source,
        context_window_tokens=build_model_context_window_tokens(
            req.context_window_tokens,
            field_name="models[].context_window_tokens",
        ),
        input_image=build_model_input_image(
            req.input_image,
            field_name="models[].input_image",
        ),
        output_image=build_model_output_image(
            req.output_image,
            field_name="models[].output_image",
        ),
    )


def _coerce_provider_models(
    payload: list[ProviderModelRequest] | None,
) -> list[ProviderModelCatalogEntry]:
    entries: list[ProviderModelCatalogEntry] = []
    seen_models: set[str] = set()
    for item in payload or []:
        entry = _build_provider_model_entry(item)
        if entry.model in seen_models:
            raise ValueError(f"models[].model '{entry.model}' is duplicated")
        seen_models.add(entry.model)
        entries.append(entry)
    return entries


def _serialize_discovered_model_entry(
    model: str,
    *,
    context_window_tokens: int | None,
    input_image: bool,
    output_image: bool,
) -> dict[str, object]:
    return serialize_provider_model_catalog_entry(
        ProviderModelCatalogEntry(
            model=model,
            source="discovered",
            context_window_tokens=context_window_tokens,
            input_image=input_image,
            output_image=output_image,
        )
    )


def _has_draft_provider_fields(req: ProviderDraftRequest) -> bool:
    return any(
        value is not None
        for value in (
            req.name,
            req.type,
            req.base_url,
            req.api_key,
            req.headers,
        )
    )


def _resolve_provider_from_request(req: ProviderDraftRequest) -> ProviderConfig:
    settings = get_settings()
    saved_provider = (
        find_provider(settings, req.provider_id)
        if req.provider_id is not None
        else None
    )
    if (
        req.provider_id is not None
        and saved_provider is None
        and not _has_draft_provider_fields(req)
    ):
        raise HTTPException(status_code=404, detail="Provider not found")

    provider_type = (
        req.type.strip()
        if isinstance(req.type, str) and req.type.strip()
        else saved_provider.type
        if saved_provider is not None
        else ""
    )
    if not provider_type:
        raise HTTPException(status_code=400, detail="provider type is required")

    base_url = (
        req.base_url.strip()
        if isinstance(req.base_url, str) and req.base_url.strip()
        else saved_provider.base_url
        if saved_provider is not None
        else ""
    )
    if not base_url:
        raise HTTPException(status_code=400, detail="provider base_url is required")

    try:
        raw_base_url = _validate_provider_base_url_input(provider_type, base_url)
        headers = build_provider_headers(
            req.headers
            if req.headers is not None
            else saved_provider.headers
            if saved_provider is not None
            else {},
            field_name="headers",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ProviderConfig(
        id=saved_provider.id if saved_provider is not None else req.provider_id or "",
        name=(
            req.name
            if isinstance(req.name, str)
            else saved_provider.name
            if saved_provider is not None
            else ""
        ),
        type=provider_type,
        base_url=raw_base_url,
        api_key=(
            req.api_key
            if isinstance(req.api_key, str)
            else saved_provider.api_key
            if saved_provider is not None
            else ""
        ),
        headers=headers,
        retry_429_delay_seconds=(
            saved_provider.retry_429_delay_seconds if saved_provider is not None else 0
        ),
        models=list(saved_provider.models) if saved_provider is not None else [],
    )


def _list_models_with_provider(provider: ProviderConfig) -> list[ModelInfo]:
    llm_provider = create_llm_provider(
        provider_type=provider.type,
        base_url=provider.base_url,
        api_key=provider.api_key,
        headers=provider.headers,
        model="",
        provider_name=provider.name,
        request_timeout_seconds=120.0,
    )
    return llm_provider.list_models()


def _summarize_provider_error(error: Exception) -> str:
    detail = str(error).strip()
    if not detail:
        return "Provider test failed"

    for line in detail.splitlines():
        stripped = line.strip()
        if stripped.startswith("Detail:"):
            normalized = stripped.removeprefix("Detail:").strip()
            if normalized:
                return truncate_text(normalized, limit=240)

    first_line = next(
        (line.strip() for line in detail.splitlines() if line.strip()), ""
    )
    if not first_line or first_line.lower().startswith("traceback"):
        return "Provider returned an unexpected error response"
    return truncate_text(first_line, limit=240)


def _test_provider_model(provider: ProviderConfig, model: str) -> dict[str, object]:
    settings = get_settings()
    llm_provider = create_llm_provider(
        provider_type=provider.type,
        base_url=provider.base_url,
        api_key=provider.api_key,
        headers=provider.headers,
        model=model,
        provider_name=provider.name,
        request_timeout_seconds=max(settings.model.timeout_ms / 1000, 1.0),
    )
    started_at = time.perf_counter()
    llm_provider.chat(
        [{"role": "user", "content": "Reply with OK."}],
    )
    ended_at = time.perf_counter()
    return {
        "ok": True,
        "duration_ms": int((ended_at - started_at) * 1000),
    }


@router.get("/api/providers")
async def list_providers() -> dict[str, object]:
    settings = get_settings()
    return {
        "providers": [serialize_provider(provider) for provider in settings.providers]
    }


@router.post("/api/providers")
async def create_provider(req: CreateProviderRequest) -> dict[str, object]:
    from app.providers.gateway import gateway

    settings = get_settings()
    try:
        raw_base_url = _validate_provider_base_url_input(req.type, req.base_url)
        headers = build_provider_headers(req.headers)
        retry_429_delay_seconds = build_provider_retry_429_delay_seconds(
            req.retry_429_delay_seconds
        )
        models = _coerce_provider_models(req.models)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    provider = ProviderConfig(
        id=str(uuid.uuid4()),
        name=req.name,
        type=req.type,
        base_url=raw_base_url,
        api_key=req.api_key,
        headers=headers,
        retry_429_delay_seconds=retry_429_delay_seconds,
        models=models,
    )
    settings.providers.append(provider)
    save_settings(settings)
    gateway.invalidate_cache()
    return serialize_provider(provider)


@router.put("/api/providers/{provider_id}")
async def update_provider(
    provider_id: str, req: UpdateProviderRequest
) -> dict[str, object]:
    from app.providers.gateway import gateway

    settings = get_settings()
    for provider in settings.providers:
        if provider.id != provider_id:
            continue
        next_name = req.name if req.name is not None else provider.name
        next_type = req.type if req.type is not None else provider.type
        next_base_url = (
            req.base_url.strip() if req.base_url is not None else provider.base_url
        )
        try:
            raw_base_url = _validate_provider_base_url_input(next_type, next_base_url)
            next_headers = (
                build_provider_headers(req.headers)
                if req.headers is not None
                else dict(provider.headers)
            )
            next_retry_429_delay_seconds = (
                build_provider_retry_429_delay_seconds(req.retry_429_delay_seconds)
                if req.retry_429_delay_seconds is not None
                else provider.retry_429_delay_seconds
            )
            next_models = (
                _coerce_provider_models(req.models)
                if req.models is not None
                else list(provider.models)
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if req.name is not None:
            provider.name = next_name
        if req.type is not None:
            provider.type = next_type
        if req.base_url is not None or req.type is not None:
            provider.base_url = raw_base_url
        if req.api_key is not None:
            provider.api_key = req.api_key
        if req.headers is not None:
            provider.headers = next_headers
        if req.retry_429_delay_seconds is not None:
            provider.retry_429_delay_seconds = next_retry_429_delay_seconds
        if req.models is not None:
            provider.models = next_models
        save_settings(settings)
        gateway.invalidate_cache()
        return serialize_provider(provider)
    raise HTTPException(status_code=404, detail="Provider not found")


@router.delete("/api/providers/{provider_id}")
async def delete_provider(provider_id: str) -> dict[str, object]:
    from app.providers.gateway import gateway

    settings = get_settings()
    before = len(settings.providers)
    settings.providers = [p for p in settings.providers if p.id != provider_id]
    if len(settings.providers) == before:
        raise HTTPException(status_code=404, detail="Provider not found")
    clear_provider_references(settings, provider_id)
    save_settings(settings)
    gateway.invalidate_cache()
    return {"status": "deleted"}


@router.post("/api/providers/models")
async def list_provider_models(req: ListModelsRequest) -> dict[str, object]:
    from app.providers.gateway import gateway

    if req.provider_id is not None and not _has_draft_provider_fields(req):
        try:
            models = await run_in_threadpool(gateway.list_models_for, req.provider_id)
            return {
                "models": [
                    _serialize_discovered_model_entry(
                        model=model.id,
                        context_window_tokens=model.context_window_tokens,
                        input_image=model.capabilities.input_image,
                        output_image=model.capabilities.output_image,
                    )
                    for model in models
                ]
            }
        except Exception as exc:
            logger.error(
                "Failed to list models for provider '{}': {}",
                req.provider_id,
                exc,
            )
            raise HTTPException(
                status_code=500,
                detail=_summarize_provider_error(exc),
            ) from exc

    provider = _resolve_provider_from_request(req)

    try:
        models = await run_in_threadpool(_list_models_with_provider, provider)
        return {
            "models": [
                _serialize_discovered_model_entry(
                    model=model.id,
                    context_window_tokens=model.context_window_tokens,
                    input_image=model.capabilities.input_image,
                    output_image=model.capabilities.output_image,
                )
                for model in models
            ]
        }
    except Exception as exc:
        logger.error(
            "Failed to list models for provider '{}': {}",
            provider.id or provider.name or provider.base_url,
            exc,
        )
        raise HTTPException(
            status_code=500, detail=_summarize_provider_error(exc)
        ) from exc


@router.post("/api/providers/models/test")
async def run_provider_model_test_route(
    req: ProviderModelTestRequest,
) -> dict[str, object]:
    model = req.model.strip()
    if not model:
        raise HTTPException(status_code=400, detail="model is required")

    provider = _resolve_provider_from_request(req)
    try:
        return await run_in_threadpool(_test_provider_model, provider, model)
    except Exception as exc:
        logger.error(
            "Failed to test model '{}' for provider '{}': {}",
            model,
            provider.id or provider.name or provider.base_url,
            exc,
        )
        return {
            "ok": False,
            "error_summary": _summarize_provider_error(exc),
        }

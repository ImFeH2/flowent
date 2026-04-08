from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.providers.base_url import resolve_provider_base_url
from app.settings import (
    ProviderConfig,
    build_provider_headers,
    get_settings,
    save_settings,
    serialize_provider,
)

router = APIRouter()


class CreateProviderRequest(BaseModel):
    name: str
    type: str
    base_url: str
    api_key: str = ""
    headers: dict[str, object] | None = None


class UpdateProviderRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    headers: dict[str, object] | None = None


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
        resolved_base_url = resolve_provider_base_url(req.type, req.base_url)
        headers = build_provider_headers(req.headers)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    provider = ProviderConfig(
        id=str(uuid.uuid4()),
        name=req.name,
        type=req.type,
        base_url=resolved_base_url,
        api_key=req.api_key,
        headers=headers,
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
    for p in settings.providers:
        if p.id != provider_id:
            continue
        next_name = req.name if req.name is not None else p.name
        next_type = req.type if req.type is not None else p.type
        next_base_url = req.base_url if req.base_url is not None else p.base_url
        try:
            resolved_base_url = resolve_provider_base_url(next_type, next_base_url)
            next_headers = (
                build_provider_headers(req.headers)
                if req.headers is not None
                else dict(p.headers)
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if req.name is not None:
            p.name = next_name
        if req.type is not None:
            p.type = next_type
        if req.base_url is not None or req.type is not None:
            p.base_url = resolved_base_url
        if req.api_key is not None:
            p.api_key = req.api_key
        if req.headers is not None:
            p.headers = next_headers
        save_settings(settings)
        gateway.invalidate_cache()
        return serialize_provider(p)
    raise HTTPException(status_code=404, detail="Provider not found")


@router.delete("/api/providers/{provider_id}")
async def delete_provider(provider_id: str) -> dict[str, object]:
    from app.providers.gateway import gateway

    settings = get_settings()
    before = len(settings.providers)
    settings.providers = [p for p in settings.providers if p.id != provider_id]
    if len(settings.providers) == before:
        raise HTTPException(status_code=404, detail="Provider not found")
    if settings.model.active_provider_id == provider_id:
        settings.model.active_provider_id = ""
        settings.model.active_model = ""
    for role in settings.roles:
        if role.model is not None and role.model.provider_id == provider_id:
            role.model = None
    save_settings(settings)
    gateway.invalidate_cache()
    return {"status": "deleted"}


class ListModelsRequest(BaseModel):
    provider_id: str


@router.post("/api/providers/models")
async def list_provider_models(req: ListModelsRequest) -> dict[str, object]:
    from app.providers.gateway import gateway

    try:
        models = gateway.list_models_for(req.provider_id)
        return {"models": [{"id": m.id} for m in models]}
    except Exception as e:
        logger.error("Failed to list models for provider '{}': {}", req.provider_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e

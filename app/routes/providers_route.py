from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.settings import ProviderConfig, get_settings, save_settings

router = APIRouter()


class CreateProviderRequest(BaseModel):
    name: str
    type: str
    base_url: str
    api_key: str = ""
    default_model: str = ""


class UpdateProviderRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None


@router.get("/api/providers")
async def list_providers() -> dict:
    settings = get_settings()
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "type": p.type,
                "base_url": p.base_url,
                "api_key": p.api_key,
                "default_model": p.default_model,
            }
            for p in settings.providers
        ]
    }


@router.post("/api/providers")
async def create_provider(req: CreateProviderRequest) -> dict:
    settings = get_settings()
    provider = ProviderConfig(
        id=str(uuid.uuid4()),
        name=req.name,
        type=req.type,
        base_url=req.base_url,
        api_key=req.api_key,
        default_model=req.default_model,
    )
    settings.providers.append(provider)
    save_settings(settings)
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
        "api_key": provider.api_key,
        "default_model": provider.default_model,
    }


@router.put("/api/providers/{provider_id}")
async def update_provider(provider_id: str, req: UpdateProviderRequest) -> dict:
    settings = get_settings()
    for p in settings.providers:
        if p.id == provider_id:
            if req.name is not None:
                p.name = req.name
            if req.type is not None:
                p.type = req.type
            if req.base_url is not None:
                p.base_url = req.base_url
            if req.api_key is not None:
                p.api_key = req.api_key
            if req.default_model is not None:
                p.default_model = req.default_model
            save_settings(settings)
            return {
                "id": p.id,
                "name": p.name,
                "type": p.type,
                "base_url": p.base_url,
                "api_key": p.api_key,
                "default_model": p.default_model,
            }
    raise HTTPException(status_code=404, detail="Provider not found")


@router.delete("/api/providers/{provider_id}")
async def delete_provider(provider_id: str) -> dict:
    settings = get_settings()
    before = len(settings.providers)
    settings.providers = [p for p in settings.providers if p.id != provider_id]
    if len(settings.providers) == before:
        raise HTTPException(status_code=404, detail="Provider not found")
    save_settings(settings)
    return {"status": "deleted"}


class ListModelsRequest(BaseModel):
    provider_id: str


@router.post("/api/providers/models")
async def list_provider_models(req: ListModelsRequest) -> dict:
    from app.providers.gateway import gateway

    try:
        models = gateway.list_models_for(req.provider_id)
        return {"models": [{"id": m.id} for m in models]}
    except Exception as e:
        logger.error("Failed to list models for provider '{}': {}", req.provider_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/api/meta")
async def get_meta() -> dict:
    from app.providers.registry import ProviderType

    return {
        "provider_types": [pt.value for pt in ProviderType],
    }

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/api/meta")
async def get_meta() -> dict:
    from flowent_api._version import __version__
    from flowent_api.providers.registry import ProviderType

    return {
        "provider_types": [pt.value for pt in ProviderType],
        "version": __version__,
    }


@router.get("/api/tools")
async def list_tools() -> dict:
    from flowent_api.tools import list_agent_visible_tool_descriptors

    return {"tools": list_agent_visible_tool_descriptors()}

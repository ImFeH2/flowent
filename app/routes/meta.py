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


@router.get("/api/tools")
async def list_tools() -> dict:
    from app.tools import build_tool_registry

    registry = build_tool_registry()
    tools = []
    for tool in registry._tools.values():
        tools.append(
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            }
        )
    return {"tools": tools}

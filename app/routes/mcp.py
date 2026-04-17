from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.mcp_service import MCPError, mcp_service
from app.settings import get_settings
from app.workspace_store import workspace_store

router = APIRouter()


class MCPServerMutationRequest(BaseModel):
    name: str
    transport: str
    enabled: bool = True
    required: bool = False
    startup_timeout_sec: int = 10
    tool_timeout_sec: int = 30
    enabled_tools: list[str] = []
    disabled_tools: list[str] = []
    scopes: list[str] = []
    oauth_resource: str = ""
    command: str = ""
    args: list[str] = []
    env: dict[str, str] = {}
    env_vars: list[str] = []
    cwd: str = ""
    url: str = ""
    bearer_token_env_var: str = ""
    http_headers: dict[str, str] = {}
    env_http_headers: list[str] = []


class MCPMountRequest(BaseModel):
    mounted: bool


class MCPPromptPreviewRequest(BaseModel):
    name: str
    arguments: dict[str, object] = {}


@router.get("/api/mcp")
async def get_mcp_state() -> dict[str, object]:
    settings = get_settings()
    return {
        "assistant_mcp_servers": list(settings.assistant.mcp_servers),
        "tabs": [
            {
                "id": tab.id,
                "title": tab.title,
                "mcp_servers": list(tab.mcp_servers),
            }
            for tab in workspace_store.list_tabs()
        ],
        "servers": mcp_service.list_server_payloads(),
        "autopoe_server": mcp_service.get_autopoe_server_summary(),
    }


@router.post("/api/mcp/refresh")
async def refresh_all_mcp_servers() -> dict[str, object]:
    return {"servers": mcp_service.refresh_all()}


@router.post("/api/mcp/servers")
async def create_mcp_server(req: MCPServerMutationRequest) -> dict[str, object]:
    try:
        snapshot = mcp_service.create_or_update_server(
            current_name=None,
            config_data=req.model_dump(),
        )
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"snapshot": snapshot}


@router.patch("/api/mcp/servers/{server_name}")
async def update_mcp_server(
    server_name: str,
    req: MCPServerMutationRequest,
) -> dict[str, object]:
    try:
        snapshot = mcp_service.create_or_update_server(
            current_name=server_name,
            config_data=req.model_dump(),
        )
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"snapshot": snapshot}


@router.delete("/api/mcp/servers/{server_name}")
async def delete_mcp_server(server_name: str) -> dict[str, object]:
    try:
        mcp_service.delete_server(server_name)
    except MCPError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted", "server_name": server_name}


@router.post("/api/mcp/servers/{server_name}/refresh")
async def refresh_mcp_server(server_name: str) -> dict[str, object]:
    try:
        snapshot = mcp_service.refresh_server(server_name)
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"snapshot": snapshot}


@router.post("/api/mcp/servers/{server_name}/login")
async def login_mcp_server(server_name: str) -> dict[str, object]:
    try:
        snapshot = mcp_service.login_server(server_name)
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"snapshot": snapshot}


@router.post("/api/mcp/servers/{server_name}/logout")
async def logout_mcp_server(server_name: str) -> dict[str, object]:
    try:
        snapshot = mcp_service.logout_server(server_name)
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"snapshot": snapshot}


@router.post("/api/mcp/servers/{server_name}/assistant-mount")
async def update_assistant_mcp_mount(
    server_name: str,
    req: MCPMountRequest,
) -> dict[str, object]:
    try:
        mounts = mcp_service.set_assistant_mount(
            server_name=server_name,
            mounted=req.mounted,
        )
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"assistant_mcp_servers": mounts}


@router.post("/api/mcp/servers/{server_name}/tabs/{tab_id}/mount")
async def update_tab_mcp_mount(
    server_name: str,
    tab_id: str,
    req: MCPMountRequest,
) -> dict[str, object]:
    try:
        tab = mcp_service.set_tab_mount(
            server_name=server_name,
            tab_id=tab_id,
            mounted=req.mounted,
        )
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"tab": tab}


@router.post("/api/mcp/servers/{server_name}/prompt-preview")
async def preview_mcp_prompt(
    server_name: str,
    req: MCPPromptPreviewRequest,
) -> dict[str, object]:
    try:
        preview = mcp_service.preview_server_prompt(
            server_name=server_name,
            name=req.name,
            arguments=req.arguments,
        )
    except MCPError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"preview": preview}

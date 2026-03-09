from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.settings import (
    RoleConfig,
    get_settings,
    is_builtin_role_name,
    normalize_tool_names,
    save_settings,
    serialize_role,
    validate_role_tool_config,
)

router = APIRouter()


class CreateRoleRequest(BaseModel):
    name: str
    system_prompt: str
    included_tools: list[str] = Field(default_factory=list)
    excluded_tools: list[str] = Field(default_factory=list)


class UpdateRoleRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    included_tools: list[str] | None = None
    excluded_tools: list[str] | None = None


def _resolve_role_tool_config(
    current: RoleConfig | None,
    included_tools: list[str] | None,
    excluded_tools: list[str] | None,
) -> tuple[list[str], list[str]]:
    next_included = normalize_tool_names(
        included_tools
        if included_tools is not None
        else current.included_tools
        if current
        else []
    )
    next_excluded = normalize_tool_names(
        excluded_tools
        if excluded_tools is not None
        else current.excluded_tools
        if current
        else []
    )
    try:
        validate_role_tool_config(next_included, next_excluded)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return next_included, next_excluded


@router.get("/api/roles")
async def list_roles() -> dict:
    settings = get_settings()
    return {"roles": [serialize_role(role) for role in settings.roles]}


@router.post("/api/roles")
async def create_role(req: CreateRoleRequest) -> dict:
    settings = get_settings()
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if any(role.name == name for role in settings.roles):
        raise HTTPException(status_code=409, detail=f"Role '{name}' already exists")
    included_tools, excluded_tools = _resolve_role_tool_config(
        None,
        req.included_tools,
        req.excluded_tools,
    )

    role = RoleConfig(
        name=name,
        system_prompt=req.system_prompt,
        included_tools=included_tools,
        excluded_tools=excluded_tools,
    )
    settings.roles.append(role)
    save_settings(settings)
    return serialize_role(role)


@router.put("/api/roles/{role_name:path}")
async def update_role(role_name: str, req: UpdateRoleRequest) -> dict:
    settings = get_settings()
    for r in settings.roles:
        if r.name == role_name:
            included_tools, excluded_tools = _resolve_role_tool_config(
                r,
                req.included_tools,
                req.excluded_tools,
            )
            if req.name is not None:
                next_name = req.name.strip()
                if not next_name:
                    raise HTTPException(status_code=400, detail="Role name is required")
                if is_builtin_role_name(role_name) and next_name != role_name:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot rename built-in role '{role_name}'",
                    )
                if any(
                    role.name == next_name and role.name != role_name
                    for role in settings.roles
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Role '{next_name}' already exists",
                    )
                r.name = next_name
            if req.system_prompt is not None:
                r.system_prompt = req.system_prompt
            r.included_tools = included_tools
            r.excluded_tools = excluded_tools
            save_settings(settings)
            return serialize_role(r)
    raise HTTPException(status_code=404, detail="Role not found")


@router.delete("/api/roles/{role_name:path}")
async def delete_role(role_name: str) -> dict:
    if is_builtin_role_name(role_name):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete built-in role '{role_name}'",
        )

    settings = get_settings()
    before = len(settings.roles)
    settings.roles = [r for r in settings.roles if r.name != role_name]
    if len(settings.roles) == before:
        raise HTTPException(status_code=404, detail="Role not found")
    save_settings(settings)
    return {"status": "deleted"}

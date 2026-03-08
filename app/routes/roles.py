from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import RoleConfig, get_settings, save_settings

router = APIRouter()


class CreateRoleRequest(BaseModel):
    name: str
    system_prompt: str


class UpdateRoleRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None


@router.get("/api/roles")
async def list_roles() -> dict:
    settings = get_settings()
    return {
        "roles": [
            {"name": r.name, "system_prompt": r.system_prompt} for r in settings.roles
        ]
    }


@router.post("/api/roles")
async def create_role(req: CreateRoleRequest) -> dict:
    settings = get_settings()
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if any(role.name == name for role in settings.roles):
        raise HTTPException(status_code=409, detail=f"Role '{name}' already exists")

    role = RoleConfig(name=name, system_prompt=req.system_prompt)
    settings.roles.append(role)
    save_settings(settings)
    return {"name": role.name, "system_prompt": role.system_prompt}


@router.put("/api/roles/{role_name:path}")
async def update_role(role_name: str, req: UpdateRoleRequest) -> dict:
    settings = get_settings()
    for r in settings.roles:
        if r.name == role_name:
            if req.name is not None:
                next_name = req.name.strip()
                if not next_name:
                    raise HTTPException(status_code=400, detail="Role name is required")
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
            save_settings(settings)
            return {"name": r.name, "system_prompt": r.system_prompt}
    raise HTTPException(status_code=404, detail="Role not found")


@router.delete("/api/roles/{role_name:path}")
async def delete_role(role_name: str) -> dict:
    settings = get_settings()
    before = len(settings.roles)
    settings.roles = [r for r in settings.roles if r.name != role_name]
    if len(settings.roles) == before:
        raise HTTPException(status_code=404, detail="Role not found")
    save_settings(settings)
    return {"status": "deleted"}

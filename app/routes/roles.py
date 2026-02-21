from __future__ import annotations

import uuid

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
            {"id": r.id, "name": r.name, "system_prompt": r.system_prompt}
            for r in settings.roles
        ]
    }


@router.post("/api/roles")
async def create_role(req: CreateRoleRequest) -> dict:
    settings = get_settings()
    role = RoleConfig(
        id=str(uuid.uuid4()),
        name=req.name,
        system_prompt=req.system_prompt,
    )
    settings.roles.append(role)
    save_settings(settings)
    return {"id": role.id, "name": role.name, "system_prompt": role.system_prompt}


@router.put("/api/roles/{role_id}")
async def update_role(role_id: str, req: UpdateRoleRequest) -> dict:
    settings = get_settings()
    for r in settings.roles:
        if r.id == role_id:
            if req.name is not None:
                r.name = req.name
            if req.system_prompt is not None:
                r.system_prompt = req.system_prompt
            save_settings(settings)
            return {"id": r.id, "name": r.name, "system_prompt": r.system_prompt}
    raise HTTPException(status_code=404, detail="Role not found")


@router.delete("/api/roles/{role_id}")
async def delete_role(role_id: str) -> dict:
    settings = get_settings()
    before = len(settings.roles)
    settings.roles = [r for r in settings.roles if r.id != role_id]
    if len(settings.roles) == before:
        raise HTTPException(status_code=404, detail="Role not found")
    save_settings(settings)
    return {"status": "deleted"}

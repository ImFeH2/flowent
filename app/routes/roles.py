from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.settings import (
    ModelParams,
    RoleConfig,
    RoleModelConfig,
    Settings,
    build_model_params_from_mapping,
    clear_role_references,
    find_provider,
    get_settings,
    is_builtin_role_name,
    normalize_tool_names,
    rename_role_references,
    save_settings,
    serialize_provider,
    serialize_role,
    validate_role_tool_config,
)

router = APIRouter()


class RoleModelRequest(BaseModel):
    provider_id: str
    model: str


class CreateRoleRequest(BaseModel):
    name: str
    description: str
    system_prompt: str
    model: RoleModelRequest | None = None
    model_params: dict[str, object] | None = None
    included_tools: list[str] = Field(default_factory=list)
    excluded_tools: list[str] = Field(default_factory=list)


class UpdateRoleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    model: RoleModelRequest | None = None
    model_params: dict[str, object] | None = None
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


def _resolve_role_model(
    requested: RoleModelRequest | None,
    *,
    settings: Settings,
    current: RoleModelConfig | None,
    provided: bool,
) -> RoleModelConfig | None:
    if not provided:
        return current
    if requested is None:
        return None

    provider_id = requested.provider_id.strip()
    model = requested.model.strip()

    if not provider_id:
        raise HTTPException(
            status_code=400, detail="Role model provider_id is required"
        )
    if not model:
        raise HTTPException(status_code=400, detail="Role model is required")
    if find_provider(settings, provider_id) is None:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_id}' not found",
        )

    return RoleModelConfig(provider_id=provider_id, model=model)


def _resolve_role_model_params(
    requested: dict[str, object] | None,
    *,
    current: ModelParams | None,
    provided: bool,
) -> ModelParams | None:
    if not provided:
        return current
    try:
        return build_model_params_from_mapping(requested)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _sync_running_system_roles() -> None:
    from app.graph_service import sync_assistant_role, sync_tab_leaders

    sync_assistant_role(reason="assistant role updated")
    sync_tab_leaders(reason="leader role updated")


def _enforce_builtin_role_guards(
    role: RoleConfig,
    *,
    next_name: str | None,
    next_description: str | None,
    next_system_prompt: str | None,
    next_included_tools: list[str],
    next_excluded_tools: list[str],
) -> None:
    if not is_builtin_role_name(role.name):
        return
    if next_name is not None and next_name != role.name:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot rename built-in role '{role.name}'",
        )
    if next_description is not None and next_description != role.description:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot modify built-in role '{role.name}' fields other than "
                "model or model_params"
            ),
        )
    if next_system_prompt is not None and next_system_prompt != role.system_prompt:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot modify built-in role '{role.name}' fields other than "
                "model or model_params"
            ),
        )
    if (
        next_included_tools != role.included_tools
        or next_excluded_tools != role.excluded_tools
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot modify built-in role '{role.name}' fields other than "
                "model or model_params"
            ),
        )


@router.get("/api/roles")
async def list_roles() -> dict:
    settings = get_settings()
    return {"roles": [serialize_role(role) for role in settings.roles]}


@router.get("/api/roles/bootstrap")
async def get_roles_bootstrap() -> dict[str, object]:
    from app.tools import list_agent_visible_tool_descriptors

    settings = get_settings()
    return {
        "roles": [serialize_role(role) for role in settings.roles],
        "providers": [serialize_provider(provider) for provider in settings.providers],
        "tools": list_agent_visible_tool_descriptors(),
    }


@router.post("/api/roles")
async def create_role(req: CreateRoleRequest) -> dict:
    from app.providers.gateway import gateway

    settings = get_settings()
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    description = req.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Role description is required")
    if any(role.name == name for role in settings.roles):
        raise HTTPException(status_code=409, detail=f"Role '{name}' already exists")

    included_tools, excluded_tools = _resolve_role_tool_config(
        None,
        req.included_tools,
        req.excluded_tools,
    )
    role = RoleConfig(
        name=name,
        description=description,
        system_prompt=req.system_prompt,
        model=_resolve_role_model(
            req.model,
            settings=settings,
            current=None,
            provided="model" in req.model_fields_set,
        ),
        model_params=_resolve_role_model_params(
            req.model_params,
            current=None,
            provided="model_params" in req.model_fields_set,
        ),
        included_tools=included_tools,
        excluded_tools=excluded_tools,
    )
    settings.roles.append(role)
    save_settings(settings)
    gateway.invalidate_cache()
    return serialize_role(role)


@router.put("/api/roles/{role_name:path}")
async def update_role(role_name: str, req: UpdateRoleRequest) -> dict:
    from app.providers.gateway import gateway

    settings = get_settings()
    for role in settings.roles:
        if role.name != role_name:
            continue

        included_tools, excluded_tools = _resolve_role_tool_config(
            role,
            req.included_tools,
            req.excluded_tools,
        )

        next_name = req.name.strip() if req.name is not None else None
        if next_name is not None and not next_name:
            raise HTTPException(status_code=400, detail="Role name is required")
        next_description = (
            req.description.strip() if req.description is not None else None
        )
        if next_description is not None and not next_description:
            raise HTTPException(
                status_code=400,
                detail="Role description is required",
            )
        if next_name is not None and any(
            existing.name == next_name and existing.name != role_name
            for existing in settings.roles
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Role '{next_name}' already exists",
            )

        _enforce_builtin_role_guards(
            role,
            next_name=next_name,
            next_description=next_description,
            next_system_prompt=req.system_prompt,
            next_included_tools=included_tools,
            next_excluded_tools=excluded_tools,
        )

        previous_name = role.name
        if next_name is not None:
            role.name = next_name
            rename_role_references(settings, previous_name, role.name)
        if next_description is not None:
            role.description = next_description
        if req.system_prompt is not None:
            role.system_prompt = req.system_prompt
        if "model" in req.model_fields_set:
            role.model = _resolve_role_model(
                req.model,
                settings=settings,
                current=role.model,
                provided=True,
            )
        if "model_params" in req.model_fields_set:
            role.model_params = _resolve_role_model_params(
                req.model_params,
                current=role.model_params,
                provided=True,
            )
        role.included_tools = included_tools
        role.excluded_tools = excluded_tools
        save_settings(settings)
        _sync_running_system_roles()
        gateway.invalidate_cache()
        return serialize_role(role)

    raise HTTPException(status_code=404, detail="Role not found")


@router.delete("/api/roles/{role_name:path}")
async def delete_role(role_name: str) -> dict:
    from app.providers.gateway import gateway

    if is_builtin_role_name(role_name):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete built-in role '{role_name}'",
        )

    settings = get_settings()
    before = len(settings.roles)
    settings.roles = [role for role in settings.roles if role.name != role_name]
    if len(settings.roles) == before:
        raise HTTPException(status_code=404, detail="Role not found")
    clear_role_references(settings, role_name)
    save_settings(settings)
    _sync_running_system_roles()
    gateway.invalidate_cache()
    return {"status": "deleted"}

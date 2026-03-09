import asyncio

import pytest
from fastapi import HTTPException

from app.routes.roles import (
    CreateRoleRequest,
    UpdateRoleRequest,
    create_role,
    delete_role,
    list_roles,
    update_role,
)
from app.settings import RoleConfig, Settings


def test_list_roles_returns_is_builtin_flags(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(
                name="Worker",
                system_prompt="Do work.",
                included_tools=["read", "exec"],
            ),
            RoleConfig(
                name="Reviewer",
                system_prompt="Review code carefully",
                included_tools=["read"],
                excluded_tools=["fetch"],
            ),
        ]
    )

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    result = asyncio.run(list_roles())

    assert result == {
        "roles": [
            {
                "name": "Worker",
                "system_prompt": "Do work.",
                "included_tools": ["read", "exec"],
                "excluded_tools": [],
                "is_builtin": True,
            },
            {
                "name": "Reviewer",
                "system_prompt": "Review code carefully",
                "included_tools": ["read"],
                "excluded_tools": ["fetch"],
                "is_builtin": False,
            },
        ]
    }


def test_create_role_uses_name_as_identifier(monkeypatch):
    settings = Settings()
    saved: list[list[str]] = []

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.roles.save_settings",
        lambda current: saved.append([role.name for role in current.roles]),
    )

    result = asyncio.run(
        create_role(
            CreateRoleRequest(
                name="Reviewer",
                system_prompt="Review code carefully",
                included_tools=["read"],
            )
        )
    )

    assert result == {
        "name": "Reviewer",
        "system_prompt": "Review code carefully",
        "included_tools": ["read"],
        "excluded_tools": [],
        "is_builtin": False,
    }
    assert settings.roles == [
        RoleConfig(
            name="Reviewer",
            system_prompt="Review code carefully",
            included_tools=["read"],
        )
    ]
    assert saved == [["Reviewer"]]


def test_create_role_rejects_duplicate_name(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Reviewer", system_prompt="Review code carefully")]
    )

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            create_role(
                CreateRoleRequest(name="Reviewer", system_prompt="Different prompt")
            )
        )

    assert excinfo.value.status_code == 409
    assert excinfo.value.detail == "Role 'Reviewer' already exists"


def test_update_role_uses_name_path_parameter(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(
                name="Reviewer",
                system_prompt="Review code carefully",
                included_tools=["read"],
            )
        ]
    )
    saved: list[list[str]] = []

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.roles.save_settings",
        lambda current: saved.append([role.name for role in current.roles]),
    )

    result = asyncio.run(
        update_role(
            "Reviewer",
            UpdateRoleRequest(
                name="Architect",
                system_prompt="Design systems",
                excluded_tools=["fetch"],
            ),
        )
    )

    assert result == {
        "name": "Architect",
        "system_prompt": "Design systems",
        "included_tools": ["read"],
        "excluded_tools": ["fetch"],
        "is_builtin": False,
    }
    assert settings.roles == [
        RoleConfig(
            name="Architect",
            system_prompt="Design systems",
            included_tools=["read"],
            excluded_tools=["fetch"],
        )
    ]
    assert saved == [["Architect"]]


def test_update_role_rejects_duplicate_name(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Reviewer", system_prompt="Review code carefully"),
            RoleConfig(name="Architect", system_prompt="Design systems"),
        ]
    )

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(update_role("Reviewer", UpdateRoleRequest(name="Architect")))

    assert excinfo.value.status_code == 409
    assert excinfo.value.detail == "Role 'Architect' already exists"


def test_update_role_rejects_renaming_builtin_role(monkeypatch):
    settings = Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")])

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(update_role("Worker", UpdateRoleRequest(name="Helper")))

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Cannot rename built-in role 'Worker'"


def test_delete_role_uses_name_path_parameter(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Reviewer", system_prompt="Review code carefully"),
            RoleConfig(name="Architect", system_prompt="Design systems"),
        ]
    )
    saved: list[list[str]] = []

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.roles.save_settings",
        lambda current: saved.append([role.name for role in current.roles]),
    )

    result = asyncio.run(delete_role("Reviewer"))

    assert result == {"status": "deleted"}
    assert settings.roles == [
        RoleConfig(name="Architect", system_prompt="Design systems")
    ]
    assert saved == [["Architect"]]


def test_delete_role_rejects_builtin_role(monkeypatch):
    settings = Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")])

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(delete_role("Worker"))

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Cannot delete built-in role 'Worker'"


def test_create_role_rejects_overlapping_included_and_excluded_tools(monkeypatch):
    monkeypatch.setattr("app.routes.roles.get_settings", lambda: Settings())

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            create_role(
                CreateRoleRequest(
                    name="Reviewer",
                    system_prompt="Review code carefully",
                    included_tools=["read"],
                    excluded_tools=["read"],
                )
            )
        )

    assert excinfo.value.status_code == 400
    assert (
        excinfo.value.detail == "included_tools and excluded_tools cannot overlap: read"
    )

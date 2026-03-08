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


def test_list_roles_returns_name_and_system_prompt(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Reviewer", system_prompt="Review code carefully")]
    )

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)

    result = asyncio.run(list_roles())

    assert result == {
        "roles": [{"name": "Reviewer", "system_prompt": "Review code carefully"}]
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
            CreateRoleRequest(name="Reviewer", system_prompt="Review code carefully")
        )
    )

    assert result == {"name": "Reviewer", "system_prompt": "Review code carefully"}
    assert settings.roles == [
        RoleConfig(name="Reviewer", system_prompt="Review code carefully")
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
        roles=[RoleConfig(name="Reviewer", system_prompt="Review code carefully")]
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
            UpdateRoleRequest(name="Architect", system_prompt="Design systems"),
        )
    )

    assert result == {"name": "Architect", "system_prompt": "Design systems"}
    assert settings.roles == [
        RoleConfig(name="Architect", system_prompt="Design systems")
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

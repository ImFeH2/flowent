import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.settings import RoleConfig, Settings
from app.tools.manage_roles import ManageRolesTool


def test_manage_roles_list_includes_builtin_flags(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings(
        roles=[
            RoleConfig(name="Worker", system_prompt="Do work."),
            RoleConfig(name="Reviewer", system_prompt="Review work."),
        ]
    )

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(ManageRolesTool().execute(agent, {"action": "list"}))

    assert result == [
        {
            "name": "Worker",
            "system_prompt": "Do work.",
            "included_tools": [],
            "excluded_tools": [],
            "is_builtin": True,
        },
        {
            "name": "Reviewer",
            "system_prompt": "Review work.",
            "included_tools": [],
            "excluded_tools": [],
            "is_builtin": False,
        },
    ]


def test_manage_roles_create_adds_custom_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings()
    saved: list[Settings] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {
                "action": "create",
                "name": "Reviewer",
                "system_prompt": "Review carefully.",
                "included_tools": ["read", "read", "exec"],
                "excluded_tools": ["fetch"],
            },
        )
    )

    assert result == {
        "name": "Reviewer",
        "system_prompt": "Review carefully.",
        "included_tools": ["read", "exec"],
        "excluded_tools": ["fetch"],
        "is_builtin": False,
    }
    assert settings.roles == [
        RoleConfig(
            name="Reviewer",
            system_prompt="Review carefully.",
            included_tools=["read", "exec"],
            excluded_tools=["fetch"],
        )
    ]
    assert saved == [settings]


def test_manage_roles_create_rejects_duplicate_name(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings(roles=[RoleConfig(name="Reviewer", system_prompt="Review.")])

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {
                "action": "create",
                "name": "Reviewer",
                "system_prompt": "Another prompt.",
            },
        )
    )

    assert result == {"error": "Role 'Reviewer' already exists"}


def test_manage_roles_create_rejects_overlapping_tool_config(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    monkeypatch.setattr("app.settings.get_settings", lambda: Settings())

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {
                "action": "create",
                "name": "Reviewer",
                "system_prompt": "Review carefully.",
                "included_tools": ["read"],
                "excluded_tools": ["read"],
            },
        )
    )

    assert result == {"error": "included_tools and excluded_tools cannot overlap: read"}


def test_manage_roles_update_renames_and_updates_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings(
        roles=[RoleConfig(name="Reviewer", system_prompt="Review carefully.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {
                "action": "update",
                "name": "Reviewer",
                "new_name": "Researcher",
                "system_prompt": "Investigate carefully.",
                "included_tools": ["read"],
                "excluded_tools": ["fetch"],
            },
        )
    )

    assert result == {
        "name": "Researcher",
        "system_prompt": "Investigate carefully.",
        "included_tools": ["read"],
        "excluded_tools": ["fetch"],
        "is_builtin": False,
    }
    assert settings.roles == [
        RoleConfig(
            name="Researcher",
            system_prompt="Investigate carefully.",
            included_tools=["read"],
            excluded_tools=["fetch"],
        )
    ]
    assert saved == [settings]


def test_manage_roles_update_rejects_builtin_rename(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings(roles=[RoleConfig(name="Worker", system_prompt="Do work.")])

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {
                "action": "update",
                "name": "Worker",
                "new_name": "Builder",
            },
        )
    )

    assert result == {"error": "Cannot rename built-in role 'Worker'"}


def test_manage_roles_delete_removes_custom_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    settings = Settings(roles=[RoleConfig(name="Reviewer", system_prompt="Review.")])
    saved: list[Settings] = []

    monkeypatch.setattr("app.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.settings.save_settings", lambda current: saved.append(current)
    )

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {"action": "delete", "name": "Reviewer"},
        )
    )

    assert result == {"status": "deleted"}
    assert settings.roles == []
    assert saved == [settings]


def test_manage_roles_delete_rejects_builtin_role(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["manage_roles"]))
    monkeypatch.setattr("app.settings.get_settings", lambda: Settings())

    result = json.loads(
        ManageRolesTool().execute(
            agent,
            {"action": "delete", "name": "Worker"},
        )
    )

    assert result == {"error": "Cannot delete built-in role 'Worker'"}

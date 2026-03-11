import json

import app.settings as settings_module
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    WORKER_ROLE_INCLUDED_TOOLS,
    WORKER_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
    RootBoundary,
    Settings,
)


def test_load_settings_migrates_legacy_role_field(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [
                    {
                        "id": "legacy-worker",
                        "name": "Worker",
                        "system_prompt": "Do work.",
                        "required_tools": ["read"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    loaded = settings_module.load_settings()

    assert loaded.roles == [
        RoleConfig(
            name="Worker",
            system_prompt="Do work.",
            included_tools=["read"],
        )
    ]

    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["roles"] == [
        {
            "name": "Worker",
            "system_prompt": "Do work.",
            "included_tools": ["read"],
            "excluded_tools": [],
        }
    ]


def test_load_settings_preserves_custom_prompt(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "custom_prompt": "Apply extra guardrails.",
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    loaded = settings_module.load_settings()

    assert loaded.custom_prompt == "Apply extra guardrails."
    assert loaded.root_boundary == RootBoundary()


def test_load_settings_parses_root_boundary(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "root_boundary": {
                    "write_dirs": ["/project/workspace"],
                    "allow_network": True,
                },
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    loaded = settings_module.load_settings()

    assert loaded.root_boundary == RootBoundary(
        write_dirs=["/project/workspace"],
        allow_network=True,
    )


def test_load_settings_parses_role_tool_configuration(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [
                    {
                        "name": "Reviewer",
                        "system_prompt": "Review carefully.",
                        "included_tools": ["read", "exec"],
                        "excluded_tools": ["fetch"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    loaded = settings_module.load_settings()

    assert loaded.roles == [
        RoleConfig(
            name="Reviewer",
            system_prompt="Review carefully.",
            included_tools=["read", "exec"],
            excluded_tools=["fetch"],
        )
    ]


def test_ensure_builtin_roles_repairs_and_creates_builtin_roles():
    settings = Settings(
        roles=[
            RoleConfig(
                name=WORKER_ROLE_NAME,
                system_prompt="Outdated prompt.",
                included_tools=[],
                excluded_tools=["fetch"],
            )
        ]
    )

    changed = settings_module.ensure_builtin_roles(settings)

    assert changed is True
    assert settings.roles == [
        RoleConfig(
            name=WORKER_ROLE_NAME,
            system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
            included_tools=WORKER_ROLE_INCLUDED_TOOLS,
            excluded_tools=[],
        ),
        RoleConfig(
            name=CONDUCTOR_ROLE_NAME,
            system_prompt=CONDUCTOR_ROLE_SYSTEM_PROMPT,
            included_tools=CONDUCTOR_ROLE_INCLUDED_TOOLS,
            excluded_tools=[],
        ),
    ]

import json

import app.settings as settings_module
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_NAME,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    STEWARD_ROLE_NAME,
    STEWARD_ROLE_SYSTEM_PROMPT,
    WORKER_ROLE_INCLUDED_TOOLS,
    WORKER_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    AssistantSettings,
    RoleConfig,
    RoleModelConfig,
    Settings,
    TelegramApprovedChat,
    TelegramSettings,
)


def test_load_settings_migrates_legacy_role_field(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {
                    "active_provider_id": "provider-1",
                    "active_model": "gpt-default",
                },
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
    assert loaded.assistant == AssistantSettings()
    assert loaded.telegram == TelegramSettings()

    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["assistant"] == {"role_name": STEWARD_ROLE_NAME}
    assert persisted["telegram"] == {
        "bot_token": "",
        "pending_chats": [],
        "approved_chats": [],
    }
    assert persisted["roles"] == [
        {
            "name": "Worker",
            "system_prompt": "Do work.",
            "model": None,
            "model_params": None,
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
    assert loaded.assistant == AssistantSettings()
    assert loaded.telegram == TelegramSettings()


def test_load_settings_migrates_legacy_model_override(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {
                    "active_provider_id": "provider-1",
                    "active_model": "gpt-default",
                },
                "providers": [],
                "roles": [
                    {
                        "name": "Reviewer",
                        "system_prompt": "Review carefully.",
                        "model_override": "gpt-4.1-mini",
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
            model=RoleModelConfig(
                provider_id="provider-1",
                model="gpt-4.1-mini",
            ),
            included_tools=["read", "exec"],
            excluded_tools=["fetch"],
        )
    ]

    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["roles"] == [
        {
            "name": "Reviewer",
            "system_prompt": "Review carefully.",
            "model": {
                "provider_id": "provider-1",
                "model": "gpt-4.1-mini",
            },
            "model_params": None,
            "included_tools": ["read", "exec"],
            "excluded_tools": ["fetch"],
        }
    ]


def test_load_settings_parses_role_model_object(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {
                    "active_provider_id": "provider-1",
                    "active_model": "gpt-default",
                },
                "providers": [],
                "roles": [
                    {
                        "name": "Reviewer",
                        "system_prompt": "Review carefully.",
                        "model": {
                            "provider_id": "provider-2",
                            "model": "gpt-4.1-mini",
                        },
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
            model=RoleModelConfig(
                provider_id="provider-2",
                model="gpt-4.1-mini",
            ),
        )
    ]


def test_load_settings_parses_telegram_settings(monkeypatch, tmp_path):
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "assistant": {"role_name": STEWARD_ROLE_NAME},
                "telegram": {
                    "bot_token": "123456:ABCDE",
                    "registered_chat_ids": ["-1001", 2002],
                },
                "model": {"active_provider_id": "", "active_model": ""},
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    loaded = settings_module.load_settings()

    assert loaded.telegram == TelegramSettings(
        bot_token="123456:ABCDE",
        pending_chats=[],
        approved_chats=[
            TelegramApprovedChat(chat_id=-1001, approved_at=0.0),
            TelegramApprovedChat(chat_id=2002, approved_at=0.0),
        ],
    )

    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["telegram"] == {
        "bot_token": "123456:ABCDE",
        "pending_chats": [],
        "approved_chats": [
            {
                "chat_id": -1001,
                "username": None,
                "display_name": "",
                "approved_at": 0.0,
            },
            {
                "chat_id": 2002,
                "username": None,
                "display_name": "",
                "approved_at": 0.0,
            },
        ],
    }


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
            name=STEWARD_ROLE_NAME,
            system_prompt=STEWARD_ROLE_SYSTEM_PROMPT,
            included_tools=[],
            excluded_tools=[],
        ),
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
    assert settings.assistant.role_name == STEWARD_ROLE_NAME

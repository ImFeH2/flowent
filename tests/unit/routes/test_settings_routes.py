import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.routes.settings import (
    UpdateSettingsRequest,
    UpdateTelegramSettingsRequest,
    approve_telegram_chat,
    delete_pending_telegram_chat,
    delete_telegram_chat,
    get_settings_api,
    get_settings_bootstrap,
    get_telegram_settings,
    update_settings,
    update_telegram_settings,
)
from app.settings import (
    ProviderConfig,
    RoleConfig,
    Settings,
    TelegramApprovedChat,
    TelegramPendingChat,
    TelegramSettings,
    build_default_assistant_write_dirs,
)


def test_get_settings_returns_assistant_configuration(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    result = asyncio.run(get_settings_api())

    assert result["assistant"] == {
        "role_name": "Steward",
        "allow_network": True,
        "write_dirs": build_default_assistant_write_dirs(),
        "mcp_servers": [],
    }
    assert result["leader"] == {"role_name": "Conductor"}


def test_get_settings_bootstrap_returns_related_resources(monkeypatch):
    settings = Settings(
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_compatible",
                base_url="https://api.example.com/v1",
                api_key="secret",
            )
        ],
        roles=[
            RoleConfig(
                name="Steward",
                description="Default assistant role.",
                system_prompt="Default assistant role.",
            )
        ],
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr("app._version.__version__", "1.2.3")

    result = asyncio.run(get_settings_bootstrap())

    assert result == {
        "settings": {
            "event_log": {"timestamp_format": "absolute"},
            "assistant": {
                "role_name": "Steward",
                "allow_network": True,
                "write_dirs": build_default_assistant_write_dirs(),
                "mcp_servers": [],
            },
            "leader": {"role_name": "Conductor"},
            "telegram": {
                "bot_token": "",
                "pending_chats": [],
                "approved_chats": [],
            },
            "model": {
                "active_provider_id": "",
                "active_model": "",
                "input_image": None,
                "output_image": None,
                "capabilities": None,
                "context_window_tokens": None,
                "resolved_context_window_tokens": None,
                "timeout_ms": 10000,
                "retry_policy": "limited",
                "max_retries": 5,
                "retry_initial_delay_seconds": 0.5,
                "retry_max_delay_seconds": 8.0,
                "retry_backoff_cap_retries": 5,
                "auto_compact_token_limit": None,
                "params": {
                    "reasoning_effort": None,
                    "verbosity": None,
                    "max_output_tokens": None,
                    "temperature": None,
                    "top_p": None,
                },
            },
            "custom_prompt": "",
            "custom_post_prompt": "",
            "providers": [
                {
                    "id": "provider-1",
                    "name": "Primary",
                    "type": "openai_compatible",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "secret",
                    "headers": {},
                    "retry_429_delay_seconds": 0,
                    "models": [],
                }
            ],
            "roles": [
                {
                    "name": "Steward",
                    "description": "Default assistant role.",
                    "system_prompt": "Default assistant role.",
                    "model": None,
                    "model_params": None,
                    "included_tools": [],
                    "excluded_tools": [],
                }
            ],
            "mcp_servers": [],
        },
        "providers": [
            {
                "id": "provider-1",
                "name": "Primary",
                "type": "openai_compatible",
                "base_url": "https://api.example.com/v1",
                "api_key": "secret",
                "headers": {},
                "retry_429_delay_seconds": 0,
                "models": [],
            }
        ],
        "roles": [
            {
                "name": "Steward",
                "description": "Default assistant role.",
                "system_prompt": "Default assistant role.",
                "model": None,
                "model_params": None,
                "included_tools": [],
                "excluded_tools": [],
                "is_builtin": True,
            }
        ],
        "version": "1.2.3",
    }


def test_get_telegram_settings_masks_bot_token(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="123456:ABCDE",
            pending_chats=[
                TelegramPendingChat(
                    chat_id=1001,
                    username="alice",
                    display_name="Alice",
                    first_seen_at=1.0,
                    last_seen_at=2.0,
                )
            ],
            approved_chats=[
                TelegramApprovedChat(
                    chat_id=-2002,
                    username="bob",
                    display_name="Bob",
                    approved_at=3.0,
                )
            ],
        )
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    result = asyncio.run(get_telegram_settings())

    assert result == {
        "bot_token": "sk-...BCDE",
        "pending_chats": [
            {
                "chat_id": 1001,
                "username": "alice",
                "display_name": "Alice",
                "first_seen_at": 1.0,
                "last_seen_at": 2.0,
            }
        ],
        "approved_chats": [
            {
                "chat_id": -2002,
                "username": "bob",
                "display_name": "Bob",
                "approved_at": 3.0,
            }
        ],
    }


def test_update_telegram_settings_restarts_channel_when_token_changes(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="old-token",
            pending_chats=[
                TelegramPendingChat(
                    chat_id=1001,
                    username="alice",
                    display_name="Alice",
                    first_seen_at=1.0,
                    last_seen_at=2.0,
                )
            ],
            approved_chats=[
                TelegramApprovedChat(
                    chat_id=-2002,
                    username="bob",
                    display_name="Bob",
                    approved_at=3.0,
                )
            ],
        )
    )
    saved: list[Settings] = []
    restarted: list[str] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings",
        lambda current: saved.append(current),
    )
    monkeypatch.setattr(
        "app.runtime.restart_telegram_channel",
        lambda: restarted.append("restart"),
    )

    result = asyncio.run(
        update_telegram_settings(
            UpdateTelegramSettingsRequest(
                bot_token="new-token",
            )
        )
    )

    assert settings.telegram == TelegramSettings(
        bot_token="new-token",
        pending_chats=[
            TelegramPendingChat(
                chat_id=1001,
                username="alice",
                display_name="Alice",
                first_seen_at=1.0,
                last_seen_at=2.0,
            )
        ],
        approved_chats=[
            TelegramApprovedChat(
                chat_id=-2002,
                username="bob",
                display_name="Bob",
                approved_at=3.0,
            )
        ],
    )
    assert saved == [settings]
    assert restarted == ["restart"]
    assert result == {
        "status": "saved",
        "telegram": {
            "bot_token": "sk-...oken",
            "pending_chats": [
                {
                    "chat_id": 1001,
                    "username": "alice",
                    "display_name": "Alice",
                    "first_seen_at": 1.0,
                    "last_seen_at": 2.0,
                }
            ],
            "approved_chats": [
                {
                    "chat_id": -2002,
                    "username": "bob",
                    "display_name": "Bob",
                    "approved_at": 3.0,
                }
            ],
        },
    }


def test_approve_telegram_chat_moves_pending_chat_to_approved(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="token",
            pending_chats=[
                TelegramPendingChat(
                    chat_id=3003,
                    username="alice",
                    display_name="Alice",
                    first_seen_at=1.0,
                    last_seen_at=2.0,
                )
            ],
            approved_chats=[],
        )
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings",
        lambda current: saved.append(current),
    )
    monkeypatch.setattr("app.routes.settings.time.time", lambda: 42.0)

    result = asyncio.run(approve_telegram_chat(3003))

    assert settings.telegram.pending_chats == []
    assert settings.telegram.approved_chats == [
        TelegramApprovedChat(
            chat_id=3003,
            username="alice",
            display_name="Alice",
            approved_at=42.0,
        )
    ]
    assert saved == [settings]
    assert result == {
        "status": "approved",
        "telegram": {
            "bot_token": "sk-...oken",
            "pending_chats": [],
            "approved_chats": [
                {
                    "chat_id": 3003,
                    "username": "alice",
                    "display_name": "Alice",
                    "approved_at": 42.0,
                }
            ],
        },
    }


def test_delete_pending_telegram_chat_removes_pending_chat(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="token",
            pending_chats=[
                TelegramPendingChat(
                    chat_id=3003,
                    username="alice",
                    display_name="Alice",
                    first_seen_at=1.0,
                    last_seen_at=2.0,
                )
            ],
        )
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings",
        lambda current: saved.append(current),
    )

    result = asyncio.run(delete_pending_telegram_chat(3003))

    assert settings.telegram.pending_chats == []
    assert saved == [settings]
    assert result == {
        "status": "deleted",
        "telegram": {
            "bot_token": "sk-...oken",
            "pending_chats": [],
            "approved_chats": [],
        },
    }


def test_delete_telegram_chat_removes_approved_chat(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="token",
            approved_chats=[
                TelegramApprovedChat(
                    chat_id=-2002,
                    username="bob",
                    display_name="Bob",
                    approved_at=3.0,
                ),
                TelegramApprovedChat(
                    chat_id=3003,
                    username="alice",
                    display_name="Alice",
                    approved_at=4.0,
                ),
            ],
        )
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings",
        lambda current: saved.append(current),
    )

    result = asyncio.run(delete_telegram_chat(-2002))

    assert settings.telegram.approved_chats == [
        TelegramApprovedChat(
            chat_id=3003,
            username="alice",
            display_name="Alice",
            approved_at=4.0,
        )
    ]
    assert saved == [settings]
    assert result == {
        "status": "deleted",
        "telegram": {
            "bot_token": "sk-...oken",
            "pending_chats": [],
            "approved_chats": [
                {
                    "chat_id": 3003,
                    "username": "alice",
                    "display_name": "Alice",
                    "approved_at": 4.0,
                }
            ],
        },
    }


def test_update_settings_accepts_xhigh_reasoning_effort(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={"params": {"reasoning_effort": "xhigh"}},
            )
        )
    )

    assert settings.model.params.reasoning_effort == "xhigh"
    assert result["settings"]["model"]["params"]["reasoning_effort"] == "xhigh"
    assert saved == [settings]


def test_update_settings_accepts_model_max_retries(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={"max_retries": 8},
            )
        )
    )

    assert settings.model.max_retries == 8
    assert result["settings"]["model"]["max_retries"] == 8
    assert saved == [settings]


def test_update_settings_accepts_model_metadata_overrides_and_token_limit(
    monkeypatch,
):
    settings = Settings(
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_responses",
                base_url="https://api.example.com/v1",
                api_key="secret",
            )
        ],
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")],
    )
    settings.model.active_provider_id = "provider-1"
    settings.model.active_model = "gpt-5.2"
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={
                    "context_window_tokens": 64000,
                    "input_image": True,
                    "output_image": False,
                    "auto_compact_token_limit": 48000,
                },
            )
        )
    )

    assert settings.model.context_window_tokens == 64000
    assert settings.model.input_image is True
    assert settings.model.output_image is False
    assert settings.model.auto_compact_token_limit == 48000
    assert result["settings"]["model"]["context_window_tokens"] == 64000
    assert result["settings"]["model"]["resolved_context_window_tokens"] == 64000
    assert result["settings"]["model"]["capabilities"] == {
        "input_image": True,
        "output_image": False,
    }
    assert result["settings"]["model"]["auto_compact_token_limit"] == 48000
    assert saved == [settings]


def test_update_settings_accepts_model_retry_policy(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={"retry_policy": "unlimited"},
            )
        )
    )

    assert settings.model.retry_policy == "unlimited"
    assert result["settings"]["model"]["retry_policy"] == "unlimited"
    assert saved == [settings]


def test_update_settings_rejects_invalid_model_retry_policy(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(
                    model={"retry_policy": "forever"},
                )
            )
        )

    assert excinfo.value.status_code == 400
    assert (
        excinfo.value.detail
        == "model.retry_policy must be one of: limited, no_retry, unlimited"
    )


def test_update_settings_accepts_model_timeout_ms(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={"timeout_ms": 15000},
            )
        )
    )

    assert settings.model.timeout_ms == 15000
    assert result["settings"]["model"]["timeout_ms"] == 15000
    assert saved == [settings]


def test_update_settings_accepts_retry_backoff_fields(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                model={
                    "retry_initial_delay_seconds": 0.75,
                    "retry_max_delay_seconds": 12.0,
                    "retry_backoff_cap_retries": 3,
                },
            )
        )
    )

    assert settings.model.retry_initial_delay_seconds == 0.75
    assert settings.model.retry_max_delay_seconds == 12.0
    assert settings.model.retry_backoff_cap_retries == 3
    assert result["settings"]["model"]["retry_initial_delay_seconds"] == 0.75
    assert result["settings"]["model"]["retry_max_delay_seconds"] == 12.0
    assert result["settings"]["model"]["retry_backoff_cap_retries"] == 3
    assert saved == [settings]


def test_update_settings_rejects_retry_backoff_when_max_below_initial(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(
                    model={
                        "retry_initial_delay_seconds": 1.5,
                        "retry_max_delay_seconds": 1.0,
                    },
                )
            )
        )

    assert excinfo.value.status_code == 400
    assert (
        excinfo.value.detail
        == "model.retry_max_delay_seconds must be greater than or equal to model.retry_initial_delay_seconds"
    )


def test_update_settings_rejects_non_positive_model_timeout_ms(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(
                    model={"timeout_ms": 0},
                )
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "model.timeout_ms must be greater than 0"


def test_update_settings_persists_assistant_role(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Steward", system_prompt="Default assistant role."),
            RoleConfig(name="Reviewer", system_prompt="Review carefully."),
        ]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(assistant={"role_name": "Reviewer"}),
        )
    )

    assert settings.assistant.role_name == "Reviewer"
    assert result["settings"]["assistant"] == {
        "role_name": "Reviewer",
        "allow_network": True,
        "write_dirs": build_default_assistant_write_dirs(),
        "mcp_servers": [],
    }
    assert saved == [settings]


def test_update_settings_persists_assistant_permissions(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(
                assistant={
                    "allow_network": False,
                    "write_dirs": [" ./tmp ", "./tmp/", ""],
                }
            ),
        )
    )

    expected_write_dirs = [str((Path.cwd() / "tmp").resolve())]
    assert settings.assistant.allow_network is False
    assert settings.assistant.write_dirs == expected_write_dirs
    assert result["settings"]["assistant"] == {
        "role_name": "Steward",
        "allow_network": False,
        "write_dirs": expected_write_dirs,
        "mcp_servers": [],
    }
    assert saved == [settings]


def test_update_settings_persists_leader_role(monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Conductor", system_prompt="Default leader role."),
            RoleConfig(name="Reviewer", system_prompt="Review carefully."),
        ]
    )
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.settings.save_settings", lambda current: saved.append(current)
    )
    monkeypatch.setattr("app.providers.gateway.gateway.invalidate_cache", lambda: None)

    result = asyncio.run(
        update_settings(
            UpdateSettingsRequest(leader={"role_name": "Reviewer"}),
        )
    )

    assert settings.leader.role_name == "Reviewer"
    assert result["settings"]["leader"] == {"role_name": "Reviewer"}
    assert saved == [settings]


def test_update_settings_rejects_unknown_assistant_role(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(assistant={"role_name": "Ghost"}),
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Role 'Ghost' not found"


def test_update_settings_rejects_invalid_assistant_allow_network(monkeypatch):
    settings = Settings(
        roles=[RoleConfig(name="Steward", system_prompt="Default assistant role.")]
    )

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(assistant={"allow_network": "yes"}),
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "assistant.allow_network must be a boolean"


def test_update_settings_rejects_unknown_leader_role(monkeypatch):
    settings = Settings(roles=[RoleConfig(name="Conductor", system_prompt="Default.")])

    monkeypatch.setattr("app.routes.settings.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            update_settings(
                UpdateSettingsRequest(leader={"role_name": "Ghost"}),
            )
        )

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Role 'Ghost' not found"

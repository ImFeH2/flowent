from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class EventLogSettings:
    timestamp_format: str = "absolute"


@dataclass
class ModelSettings:
    provider: str = "openrouter"
    default_model: str = "anthropic/claude-3.5-sonnet"
    api_base_url: str = "https://openrouter.ai/api/v1"
    api_key: str = ""


@dataclass
class UserSettings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    model: ModelSettings = field(default_factory=ModelSettings)


_SETTINGS_FILE = Path.home() / ".synora" / "user_settings.json"
_cached_settings: UserSettings | None = None


def load_user_settings() -> UserSettings:
    global _cached_settings
    if _cached_settings is not None:
        return _cached_settings

    from app.settings import Settings
    env_settings = Settings()

    if not _SETTINGS_FILE.exists():
        model_settings = ModelSettings()
        if env_settings.MODEL:
            model_settings.default_model = env_settings.MODEL
        if env_settings.API_KEY:
            model_settings.api_key = env_settings.API_KEY
        _cached_settings = UserSettings(model=model_settings)
        return _cached_settings

    try:
        with open(_SETTINGS_FILE) as f:
            data = json.load(f)

        model_data = data.get("model", {})
        if env_settings.MODEL:
            model_data["default_model"] = env_settings.MODEL
        if env_settings.API_KEY:
            model_data["api_key"] = env_settings.API_KEY

        _cached_settings = UserSettings(
            event_log=EventLogSettings(**data.get("event_log", {})),
            model=ModelSettings(**model_data),
        )
    except Exception:
        _cached_settings = UserSettings()

    return _cached_settings


def save_user_settings(settings: UserSettings) -> None:
    global _cached_settings
    _cached_settings = settings

    os.makedirs(_SETTINGS_FILE.parent, exist_ok=True)
    with open(_SETTINGS_FILE, "w") as f:
        json.dump(asdict(settings), f, indent=2)


def get_user_settings() -> UserSettings:
    return load_user_settings()

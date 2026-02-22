from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

WORKING_DIR = Path(os.getcwd())
_SETTINGS_FILE = WORKING_DIR / "settings.json"


@dataclass
class EventLogSettings:
    timestamp_format: str = "absolute"


@dataclass
class ProviderConfig:
    id: str
    name: str
    type: str
    base_url: str
    api_key: str
    default_model: str


@dataclass
class RoleConfig:
    id: str
    name: str
    system_prompt: str


@dataclass
class ModelSettings:
    active_provider_id: str = ""
    active_model: str = ""


@dataclass
class Settings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    model: ModelSettings = field(default_factory=ModelSettings)
    providers: list[ProviderConfig] = field(default_factory=list)
    roles: list[RoleConfig] = field(default_factory=list)


_cached_settings: Settings | None = None
_settings_lock = threading.Lock()


def load_settings() -> Settings:
    global _cached_settings
    with _settings_lock:
        if _cached_settings is not None:
            return _cached_settings

    if not _SETTINGS_FILE.exists():
        loaded_settings = Settings()
        with _settings_lock:
            if _cached_settings is None:
                _cached_settings = loaded_settings
            return _cached_settings

    try:
        with open(_SETTINGS_FILE) as f:
            data = json.load(f)

        event_log = EventLogSettings(**data.get("event_log", {}))

        model_data = data.get("model", {})
        model_settings = ModelSettings(
            active_provider_id=model_data.get("active_provider_id", ""),
            active_model=model_data.get("active_model", ""),
        )

        providers_raw = data.get("providers", [])
        providers = [ProviderConfig(**p) for p in providers_raw]

        roles_raw = data.get("roles", [])
        roles = [RoleConfig(**r) for r in roles_raw]

        loaded_settings = Settings(
            event_log=event_log,
            model=model_settings,
            providers=providers,
            roles=roles,
        )
    except Exception:
        loaded_settings = Settings()

    with _settings_lock:
        if _cached_settings is None:
            _cached_settings = loaded_settings
        return _cached_settings


def save_settings(settings: Settings) -> None:
    global _cached_settings
    with _settings_lock:
        _cached_settings = settings

    with open(_SETTINGS_FILE, "w") as f:
        json.dump(asdict(settings), f, indent=2)


def get_settings() -> Settings:
    return load_settings()


def find_provider(settings: Settings, provider_id: str) -> ProviderConfig | None:
    for p in settings.providers:
        if p.id == provider_id:
            return p
    return None


def find_role(settings: Settings, role_id: str) -> RoleConfig | None:
    for r in settings.roles:
        if r.id == role_id:
            return r
    return None

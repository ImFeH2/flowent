from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class EventLogSettings:
    timestamp_format: str = "absolute"


@dataclass
class ProviderConfig:
    name: str
    provider_type: str
    api_base_url: str
    api_key: str = ""


@dataclass
class ModelSettings:
    active_provider: str = "OpenRouter"
    active_model: str = "anthropic/claude-3.5-sonnet"
    providers: list[ProviderConfig] = field(default_factory=list)


@dataclass
class UserSettings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    model: ModelSettings = field(default_factory=ModelSettings)


_SETTINGS_FILE = Path(os.getcwd()) / "settings.json"
_cached_settings: UserSettings | None = None


def _get_all_providers(custom_providers: list[ProviderConfig]) -> list[ProviderConfig]:
    from app.providers.registry import BUILTIN_PROVIDERS

    builtin = [
        ProviderConfig(
            name=p.name,
            provider_type=p.provider_type.value,
            api_base_url=p.api_base_url,
        )
        for p in BUILTIN_PROVIDERS
    ]

    builtin_names = {p.name for p in builtin}
    for cp in custom_providers:
        if cp.name not in builtin_names:
            builtin.append(cp)
        else:
            for i, b in enumerate(builtin):
                if b.name == cp.name:
                    builtin[i] = cp
                    break

    return builtin


def get_all_providers(settings: ModelSettings) -> list[ProviderConfig]:
    return _get_all_providers(settings.providers)


def find_provider(settings: ModelSettings, name: str) -> ProviderConfig | None:
    for p in get_all_providers(settings):
        if p.name == name:
            return p
    return None


def load_user_settings() -> UserSettings:
    global _cached_settings
    if _cached_settings is not None:
        return _cached_settings

    if not _SETTINGS_FILE.exists():
        _cached_settings = UserSettings()
        return _cached_settings

    try:
        with open(_SETTINGS_FILE) as f:
            data = json.load(f)

        model_data = data.get("model", {})
        providers_raw = model_data.pop("providers", [])
        providers = [ProviderConfig(**p) for p in providers_raw]

        model_settings = ModelSettings(
            active_provider=model_data.get("active_provider", "OpenRouter"),
            active_model=model_data.get("active_model", "anthropic/claude-3.5-sonnet"),
            providers=providers,
        )

        _cached_settings = UserSettings(
            event_log=EventLogSettings(**data.get("event_log", {})),
            model=model_settings,
        )
    except Exception:
        _cached_settings = UserSettings()

    return _cached_settings


def save_user_settings(settings: UserSettings) -> None:
    global _cached_settings
    _cached_settings = settings

    with open(_SETTINGS_FILE, "w") as f:
        json.dump(asdict(settings), f, indent=2)


def get_user_settings() -> UserSettings:
    return load_user_settings()

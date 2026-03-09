from __future__ import annotations

import json
import os
import tempfile
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

from loguru import logger

WORKING_DIR = Path(os.getcwd())
_SETTINGS_FILE = WORKING_DIR / "settings.json"
WORKER_ROLE_NAME = "Worker"
WORKER_ROLE_SYSTEM_PROMPT = (
    "You are a general-purpose worker. Follow the assigned task_prompt, use the "
    "tools you were given to complete the task, and report back clearly. You do "
    "not have any special domain expertise beyond careful execution."
)
BUILTIN_ROLE_NAMES = frozenset({WORKER_ROLE_NAME})
WORKER_ROLE_REQUIRED_TOOLS = ["read", "exec"]


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


@dataclass
class RoleConfig:
    name: str
    system_prompt: str
    required_tools: list[str] = field(default_factory=list)
    excluded_tools: list[str] = field(default_factory=list)


@dataclass
class ModelSettings:
    active_provider_id: str = ""
    active_model: str = ""


@dataclass
class Settings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    model: ModelSettings = field(default_factory=ModelSettings)
    custom_prompt: str = ""
    providers: list[ProviderConfig] = field(default_factory=list)
    roles: list[RoleConfig] = field(default_factory=list)


_cached_settings: Settings | None = None
_settings_lock = threading.Lock()


def normalize_tool_names(tool_names: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tool_name in tool_names:
        name = tool_name.strip()
        if not name or name in seen:
            continue
        normalized.append(name)
        seen.add(name)
    return normalized


def validate_role_tool_config(
    required_tools: list[str],
    excluded_tools: list[str],
) -> None:
    overlap = sorted(set(required_tools) & set(excluded_tools))
    if overlap:
        raise ValueError(
            "required_tools and excluded_tools cannot overlap: " + ", ".join(overlap)
        )


def serialize_role(role: RoleConfig) -> dict[str, object]:
    return {
        "name": role.name,
        "system_prompt": role.system_prompt,
        "required_tools": list(role.required_tools),
        "excluded_tools": list(role.excluded_tools),
        "is_builtin": is_builtin_role_name(role.name),
    }


def _build_settings(data: dict[str, object]) -> tuple[Settings, bool]:
    migrated = False

    event_log_data = data.get("event_log", {})
    if not isinstance(event_log_data, dict):
        event_log_data = {}
    event_log = EventLogSettings(**event_log_data)

    model_data = data.get("model", {})
    if not isinstance(model_data, dict):
        model_data = {}
    model_settings = ModelSettings(
        active_provider_id=str(model_data.get("active_provider_id", "")),
        active_model=str(model_data.get("active_model", "")),
    )
    custom_prompt = str(data.get("custom_prompt", ""))

    providers_raw = data.get("providers", [])
    if not isinstance(providers_raw, list):
        providers_raw = []
    providers = []
    for provider in providers_raw:
        if not isinstance(provider, dict):
            continue
        providers.append(
            ProviderConfig(
                id=str(provider.get("id", "")),
                name=str(provider.get("name", "")),
                type=str(provider.get("type", "openai_compatible")),
                base_url=str(provider.get("base_url", "")),
                api_key=str(provider.get("api_key", "")),
            )
        )

    roles_raw = data.get("roles", [])
    if not isinstance(roles_raw, list):
        roles_raw = []
    roles = []
    for role in roles_raw:
        if not isinstance(role, dict):
            continue
        role_name = str(role.get("name", ""))
        if "id" in role:
            migrated = True
            if not role_name:
                role_name = str(role.get("id", ""))
        required_tools_raw = role.get("required_tools", [])
        if not isinstance(required_tools_raw, list):
            required_tools_raw = []
        excluded_tools_raw = role.get("excluded_tools", [])
        if not isinstance(excluded_tools_raw, list):
            excluded_tools_raw = []
        roles.append(
            RoleConfig(
                name=role_name,
                system_prompt=str(role.get("system_prompt", "")),
                required_tools=normalize_tool_names(
                    [name for name in required_tools_raw if isinstance(name, str)]
                ),
                excluded_tools=normalize_tool_names(
                    [name for name in excluded_tools_raw if isinstance(name, str)]
                ),
            )
        )

    return (
        Settings(
            event_log=event_log,
            model=model_settings,
            custom_prompt=custom_prompt,
            providers=providers,
            roles=roles,
        ),
        migrated,
    )


def _read_settings_file() -> tuple[Settings, bool]:
    with _SETTINGS_FILE.open(encoding="utf-8") as settings_file:
        data = json.load(settings_file)
    if not isinstance(data, dict):
        raise ValueError("settings file must contain a JSON object")
    return _build_settings(data)


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
        loaded_settings, migrated = _read_settings_file()
    except Exception as exc:
        logger.warning(
            "Failed to load settings from {}: {}. Falling back to defaults.",
            _SETTINGS_FILE,
            exc,
        )
        loaded_settings = Settings()
        migrated = False

    if migrated:
        try:
            save_settings(loaded_settings)
        except Exception as exc:
            logger.warning(
                "Failed to persist migrated settings to {}: {}",
                _SETTINGS_FILE,
                exc,
            )

    with _settings_lock:
        if _cached_settings is None:
            _cached_settings = loaded_settings
        return _cached_settings


def save_settings(settings: Settings) -> None:
    global _cached_settings
    temp_path: Path | None = None
    _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=_SETTINGS_FILE.parent,
            prefix=f"{_SETTINGS_FILE.name}.",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            json.dump(asdict(settings), temp_file, indent=2)
            temp_file.flush()
            os.fsync(temp_file.fileno())

        os.replace(temp_path, _SETTINGS_FILE)
    except Exception:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
        raise

    with _settings_lock:
        _cached_settings = settings


def get_settings() -> Settings:
    return load_settings()


def find_provider(settings: Settings, provider_id: str) -> ProviderConfig | None:
    for p in settings.providers:
        if p.id == provider_id:
            return p
    return None


def find_role(settings: Settings, role_name: str) -> RoleConfig | None:
    for r in settings.roles:
        if r.name == role_name:
            return r
    return None


def build_worker_role() -> RoleConfig:
    return RoleConfig(
        name=WORKER_ROLE_NAME,
        system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
        required_tools=list(WORKER_ROLE_REQUIRED_TOOLS),
        excluded_tools=[],
    )


def ensure_builtin_roles(settings: Settings) -> bool:
    changed = False

    if find_role(settings, WORKER_ROLE_NAME) is None:
        settings.roles.append(build_worker_role())
        changed = True

    return changed


def is_builtin_role_name(role_name: str) -> bool:
    return role_name in BUILTIN_ROLE_NAMES

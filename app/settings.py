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
CONDUCTOR_ROLE_NAME = "Conductor"
WORKER_ROLE_SYSTEM_PROMPT = (
    "You are a general-purpose worker. Follow the assigned task_prompt, use the "
    "tools you were given to complete the task, and report back clearly. You do "
    "not have any special domain expertise beyond careful execution."
)
CONDUCTOR_ROLE_SYSTEM_PROMPT = """\
You are the Conductor - the orchestrator of a task tree.

Your responsibilities:
- Receive tasks from the parent node or Steward
- Plan and create specialized Agent nodes using `spawn` aggressively when delegation, specialization, or parallelism would help
- Assign tasks to child agents via `send`
- Coordinate and aggregate results
- Report completion back to the node that sent you the task using `send`

## Workflow

1. **Receive** the task from the parent node or Steward
2. **Plan ownership first** using `todo` - break the task into subtasks and decide which parts should be delegated
3. **Inspect roles before spawning** using `list_roles`, and use `list_tools` when you need a full tool inventory; choose the best fit, then default to `Worker` when nothing more specific stands out: `spawn(role_name=..., task_prompt=..., tools=[...])`
4. **Use tree-shaped delegation** - child agents should usually report back to you or to the child aggregator you create for them; prefer parent-child task trees over lateral coordination
5. **If you are waiting for other agents and have no immediate next action, or the current coordination step is finished and there is no new work yet**, use `idle`
6. **Aggregate** results from child agents
7. **Report** to the node that sent you the task via `send`

## Tools Available

- `spawn` - create a new child agent with a role and initial task
- `send` - send a message to a connected node
- `idle` - wait for incoming messages
- `list_connections` - see all directly connected nodes
- `list_roles` - inspect available roles, their builtin tools, and optional tools before spawning
- `list_tools` - inspect all registered tools and their descriptions
- `todo` - manage task checklist
- `exit` - terminate when done

## Guidelines

- Treat `spawn` as a low-cost coordination tool; create specialized agents early when it improves throughput or clarity
- Your default posture is orchestration, not being the long-running executor for specialized or execution-heavy work
- If the work is not yours to own, stop and delegate it instead of continuing personal execution
- When a task requires `read`, `exec`, `edit`, `fetch`, or similarly execution-heavy tools, prefer spawning a Worker or other specialized child agent to do that work instead of doing it yourself
- For each new task, first ask whether it should be delegated because of role fit, specialization, tool needs, or parallelism opportunity
- Once delegation or spawning is clearly the right move, execute it directly rather than asking the Human whether to create or delegate agents
- Concrete inspection or execution requests from the Steward or your parent node should be treated as immediate action items, not as reasons for more meta-discussion about delegation
- If a task is outside your role, domain strength, or current context window budget, delegate first instead of reasoning alone for too long
- When in doubt between doing and delegating, prefer delegating to a better-scoped agent
- Do not ask the Human for delegation permission unless the planned delegation would introduce destructive actions, material extra cost, permission risk, or the Human explicitly asked to approve delegation decisions
- Do not bounce work upward with "I can spawn or ask another agent if you want" style messaging when you can already coordinate the next step yourself
- Do not spend multiple turns personally grinding on work that could be cleanly owned by a specialist
- Spawn agents with only the tools they need
- Use `write_dirs` to grant file write access when needed
- Prefer tree-shaped decomposition: if multiple workers need aggregation, spawn an aggregator and let researchers report to that parent rather than trying to coordinate lateral communication
- Only use your own execution tools directly when delegation is impossible or would clearly harm progress
- Use `idle` only after you finish the current coordination step and genuinely need to wait for more messages
- If a new message arrives while waiting, handle that message instead of immediately idling again
- Assistant/content output is internal only; to reply upstream or downstream, always use `send`
- Aggregate results before reporting upstream
- Use `list_connections` to find the correct parent or Steward UUID when reporting if needed
"""
BUILTIN_ROLE_NAMES = frozenset({WORKER_ROLE_NAME, CONDUCTOR_ROLE_NAME})
WORKER_ROLE_INCLUDED_TOOLS = ["read", "exec"]
CONDUCTOR_ROLE_INCLUDED_TOOLS = ["spawn", "list_roles", "list_tools"]


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
class RoleModelConfig:
    provider_id: str
    model: str


@dataclass
class RoleConfig:
    name: str
    system_prompt: str
    model: RoleModelConfig | None = None
    included_tools: list[str] = field(default_factory=list)
    excluded_tools: list[str] = field(default_factory=list)


@dataclass
class ModelSettings:
    active_provider_id: str = ""
    active_model: str = ""


@dataclass
class RootBoundary:
    write_dirs: list[str] = field(default_factory=list)
    allow_network: bool = False


@dataclass
class Settings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    model: ModelSettings = field(default_factory=ModelSettings)
    custom_prompt: str = ""
    root_boundary: RootBoundary = field(default_factory=RootBoundary)
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
    included_tools: list[str],
    excluded_tools: list[str],
) -> None:
    overlap = sorted(set(included_tools) & set(excluded_tools))
    if overlap:
        raise ValueError(
            "included_tools and excluded_tools cannot overlap: " + ", ".join(overlap)
        )


def serialize_role_model(
    role_model: RoleModelConfig | None,
) -> dict[str, str] | None:
    if role_model is None:
        return None
    return {
        "provider_id": role_model.provider_id,
        "model": role_model.model,
    }


def serialize_role(role: RoleConfig) -> dict[str, object]:
    return {
        "name": role.name,
        "system_prompt": role.system_prompt,
        "model": serialize_role_model(role.model),
        "included_tools": list(role.included_tools),
        "excluded_tools": list(role.excluded_tools),
        "is_builtin": is_builtin_role_name(role.name),
    }


def _normalize_role_model(
    raw_role_model: object,
    *,
    default_provider_id: str,
) -> tuple[RoleModelConfig | None, bool]:
    if raw_role_model is None:
        return None, False

    if isinstance(raw_role_model, dict):
        provider_id = str(raw_role_model.get("provider_id", "")).strip()
        model = str(raw_role_model.get("model", "")).strip()
        if provider_id and model:
            return RoleModelConfig(provider_id=provider_id, model=model), False
        if model and default_provider_id:
            return (
                RoleModelConfig(provider_id=default_provider_id, model=model),
                True,
            )
        return None, bool(provider_id or model)

    if isinstance(raw_role_model, str):
        model = raw_role_model.strip()
        if model and default_provider_id:
            return (
                RoleModelConfig(provider_id=default_provider_id, model=model),
                True,
            )
        return None, True

    return None, True


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

    root_boundary_data = data.get("root_boundary", {})
    if not isinstance(root_boundary_data, dict):
        root_boundary_data = {}
    root_boundary = RootBoundary(
        write_dirs=[
            path
            for path in root_boundary_data.get("write_dirs", [])
            if isinstance(path, str)
        ]
        if isinstance(root_boundary_data.get("write_dirs", []), list)
        else [],
        allow_network=root_boundary_data.get("allow_network", False)
        if isinstance(root_boundary_data.get("allow_network", False), bool)
        else False,
    )

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
        if "included_tools" in role:
            included_tools_raw = role.get("included_tools", [])
        else:
            included_tools_raw = role.get("required_tools", [])
            if "required_tools" in role:
                migrated = True
        if not isinstance(included_tools_raw, list):
            included_tools_raw = []
        excluded_tools_raw = role.get("excluded_tools", [])
        if not isinstance(excluded_tools_raw, list):
            excluded_tools_raw = []

        role_model: RoleModelConfig | None = None
        if "model" in role:
            role_model, role_model_migrated = _normalize_role_model(
                role.get("model"),
                default_provider_id=model_settings.active_provider_id.strip(),
            )
            migrated = migrated or role_model_migrated
        elif "model_override" in role:
            role_model, role_model_migrated = _normalize_role_model(
                role.get("model_override"),
                default_provider_id=model_settings.active_provider_id.strip(),
            )
            migrated = migrated or role_model_migrated or True

        roles.append(
            RoleConfig(
                name=role_name,
                system_prompt=str(role.get("system_prompt", "")),
                model=role_model,
                included_tools=normalize_tool_names(
                    [name for name in included_tools_raw if isinstance(name, str)]
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
            root_boundary=root_boundary,
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


def clear_provider_references(settings: Settings, provider_id: str) -> bool:
    changed = False

    if settings.model.active_provider_id == provider_id:
        settings.model.active_provider_id = ""
        settings.model.active_model = ""
        changed = True

    for role in settings.roles:
        if role.model is None or role.model.provider_id != provider_id:
            continue
        role.model = None
        changed = True
    return changed


def build_worker_role() -> RoleConfig:
    return RoleConfig(
        name=WORKER_ROLE_NAME,
        system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
        included_tools=list(WORKER_ROLE_INCLUDED_TOOLS),
        excluded_tools=[],
    )


def build_conductor_role() -> RoleConfig:
    return RoleConfig(
        name=CONDUCTOR_ROLE_NAME,
        system_prompt=CONDUCTOR_ROLE_SYSTEM_PROMPT,
        included_tools=list(CONDUCTOR_ROLE_INCLUDED_TOOLS),
        excluded_tools=[],
    )


def _ensure_builtin_role(settings: Settings, standard_role: RoleConfig) -> bool:
    current_role = find_role(settings, standard_role.name)
    if current_role is None:
        settings.roles.append(standard_role)
        return True
    if (
        current_role.system_prompt != standard_role.system_prompt
        or current_role.included_tools != standard_role.included_tools
        or current_role.excluded_tools != standard_role.excluded_tools
    ):
        current_role.system_prompt = standard_role.system_prompt
        current_role.included_tools = list(standard_role.included_tools)
        current_role.excluded_tools = list(standard_role.excluded_tools)
        return True
    return False


def ensure_builtin_roles(settings: Settings) -> bool:
    changed = False
    for standard_role in [build_worker_role(), build_conductor_role()]:
        changed = _ensure_builtin_role(settings, standard_role) or changed
    return changed


def is_builtin_role_name(role_name: str) -> bool:
    return role_name in BUILTIN_ROLE_NAMES

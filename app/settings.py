from __future__ import annotations

import json
import os
import tempfile
import threading
from dataclasses import asdict, dataclass, field
from math import isfinite
from pathlib import Path

from loguru import logger

from app.prompts.steward import STEWARD_ROLE_SYSTEM_PROMPT

WORKING_DIR = Path(os.getcwd())
_SETTINGS_FILE = WORKING_DIR / "settings.json"
STEWARD_ROLE_NAME = "Steward"
WORKER_ROLE_NAME = "Worker"
CONDUCTOR_ROLE_NAME = "Conductor"
WORKER_ROLE_SYSTEM_PROMPT = (
    "You are a general-purpose worker. Follow the assigned task, use the "
    "tools you were given to complete the task, and report back clearly. You do "
    "not have any special domain expertise beyond careful execution."
)
CONDUCTOR_ROLE_SYSTEM_PROMPT = """\
You are the Conductor - the orchestrator of a task graph.

Your responsibilities:
- Receive tasks from the parent node or Assistant
- Plan and create specialized Agent nodes using `spawn`, and when available evolve the task graph with `create_graph`, `connect_nodes`, and `disconnect_nodes`
- Coordinate and aggregate results
- Return a coherent final result to the node that assigned the work

## Workflow

1. **Receive** the task from the parent node or Assistant
2. **Plan ownership first** using `todo` - break the task into subtasks and decide which parts should be delegated
3. **Inspect roles before spawning** using `list_roles`, and use `list_tools` when you need a full tool inventory; choose the best fit, then default to `Worker` when nothing more specific stands out: `spawn(role_name=..., tools=[...])`
4. **Use graph-shaped coordination** - edges only express message permissions. Create the smallest graph that supports the task: fan-out, shared specialists, synthesizers, reviewers, and feedback loops are all allowed when useful
5. **Coordinate** child agents as results arrive and update your plan when needed
6. **Aggregate** results from child agents into a coherent deliverable
7. **Return** the final result upstream

## Tools Available

- `spawn` - create a new child agent with a role
- `create_graph` - create a child graph that you own and can populate
- `connect_nodes` - create directed message edges
- `disconnect_nodes` - remove directed message edges
- `list_graphs` - inspect registered graphs
- `describe_graph` - inspect a graph, its nodes, and its edges
- `idle` - wait for incoming messages
- `list_connections` - see all directly connected nodes
- `list_roles` - inspect available roles, their builtin tools, and optional tools before spawning
- `list_tools` - inspect all registered tools and their descriptions
- `todo` - manage task checklist

## Guidelines

- Treat `spawn` as a low-cost coordination tool; create specialized agents early when it improves throughput or clarity
- Your default posture is orchestration, not being the long-running executor for specialized or execution-heavy work
- If the work is not yours to own, stop and delegate it instead of continuing personal execution
- When a task requires `read`, `exec`, `edit`, `fetch`, or similarly execution-heavy tools, prefer spawning a Worker or other specialized child agent to do that work instead of doing it yourself
- For each new task, first ask whether it should be delegated because of role fit, specialization, tool needs, or parallelism opportunity
- Once delegation or spawning is clearly the right move, execute it directly rather than asking the Human whether to create or delegate agents
- Concrete inspection or execution requests from the Assistant or the assigning node should be treated as immediate action items, not as reasons for more meta-discussion about delegation
- If a task is outside your role, domain strength, or current context window budget, delegate first instead of reasoning alone for too long
- When in doubt between doing and delegating, prefer delegating to a better-scoped agent
- Do not ask the Human for delegation permission unless the planned delegation would introduce destructive actions, material extra cost, permission risk, or the Human explicitly asked to approve delegation decisions
- Do not bounce work upward with "I can spawn or ask another agent if you want" style messaging when you can already coordinate the next step yourself
- Do not spend multiple turns personally grinding on work that could be cleanly owned by a specialist
- Spawn agents with only the tools they need
- Use `write_dirs` to grant file write access when needed
- Prefer explicit graph design over ad-hoc chatter: if multiple workers need aggregation, create a synthesizer node and connect researchers to it rather than manually relaying every message yourself
- Only use your own execution tools directly when delegation is impossible or would clearly harm progress
- Keep the overall graph understandable; add complexity only when it materially improves throughput, quality, or resilience
"""
BUILTIN_ROLE_NAMES = frozenset(
    {STEWARD_ROLE_NAME, WORKER_ROLE_NAME, CONDUCTOR_ROLE_NAME}
)
WORKER_ROLE_INCLUDED_TOOLS = ["read", "exec"]
CONDUCTOR_ROLE_INCLUDED_TOOLS = [
    "spawn",
    "create_graph",
    "connect_nodes",
    "disconnect_nodes",
    "list_graphs",
    "describe_graph",
    "list_roles",
    "list_tools",
]
MODEL_REASONING_EFFORT_OPTIONS = frozenset({"none", "low", "medium", "high", "xhigh"})
MODEL_VERBOSITY_OPTIONS = frozenset({"low", "medium", "high"})


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
class ModelParams:
    reasoning_effort: str | None = None
    verbosity: str | None = None
    max_output_tokens: int | None = None
    temperature: float | None = None
    top_p: float | None = None


def build_default_model_params() -> ModelParams:
    return ModelParams()


@dataclass
class RoleConfig:
    name: str
    system_prompt: str
    model: RoleModelConfig | None = None
    model_params: ModelParams | None = None
    included_tools: list[str] = field(default_factory=list)
    excluded_tools: list[str] = field(default_factory=list)


@dataclass
class ModelSettings:
    active_provider_id: str = ""
    active_model: str = ""
    params: ModelParams = field(default_factory=build_default_model_params)


@dataclass
class AssistantSettings:
    role_name: str = STEWARD_ROLE_NAME


@dataclass
class RootBoundary:
    write_dirs: list[str] = field(default_factory=list)
    allow_network: bool = False


@dataclass
class Settings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    assistant: AssistantSettings = field(default_factory=AssistantSettings)
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


def serialize_model_params(
    model_params: ModelParams | None,
) -> dict[str, object] | None:
    if model_params is None:
        return None
    return {
        "reasoning_effort": model_params.reasoning_effort,
        "verbosity": model_params.verbosity,
        "max_output_tokens": model_params.max_output_tokens,
        "temperature": model_params.temperature,
        "top_p": model_params.top_p,
    }


def is_empty_model_params(model_params: ModelParams | None) -> bool:
    return model_params is None or all(
        value is None for value in asdict(model_params).values()
    )


def merge_model_params(
    defaults: ModelParams | None,
    override: ModelParams | None,
) -> ModelParams | None:
    merged = asdict(defaults) if defaults is not None else asdict(ModelParams())
    if override is not None:
        for key, value in asdict(override).items():
            if value is not None:
                merged[key] = value
    params = ModelParams(**merged)
    return None if is_empty_model_params(params) else params


def build_model_params_from_mapping(raw_model_params: object) -> ModelParams | None:
    if raw_model_params is None:
        return None
    if not isinstance(raw_model_params, dict):
        raise ValueError("model_params must be an object or null")

    raw_reasoning_effort = raw_model_params.get("reasoning_effort")
    raw_verbosity = raw_model_params.get("verbosity")
    raw_max_output_tokens = raw_model_params.get("max_output_tokens")
    raw_temperature = raw_model_params.get("temperature")
    raw_top_p = raw_model_params.get("top_p")

    if raw_reasoning_effort is not None:
        if not isinstance(raw_reasoning_effort, str):
            raise ValueError("model_params.reasoning_effort must be a string")
        reasoning_effort = raw_reasoning_effort.strip().lower()
        if reasoning_effort and reasoning_effort not in MODEL_REASONING_EFFORT_OPTIONS:
            raise ValueError(
                "model_params.reasoning_effort must be one of: "
                + ", ".join(sorted(MODEL_REASONING_EFFORT_OPTIONS))
            )
    else:
        reasoning_effort = None

    if raw_verbosity is not None:
        if not isinstance(raw_verbosity, str):
            raise ValueError("model_params.verbosity must be a string")
        verbosity = raw_verbosity.strip().lower()
        if verbosity and verbosity not in MODEL_VERBOSITY_OPTIONS:
            raise ValueError(
                "model_params.verbosity must be one of: "
                + ", ".join(sorted(MODEL_VERBOSITY_OPTIONS))
            )
    else:
        verbosity = None

    if raw_max_output_tokens is not None:
        if isinstance(raw_max_output_tokens, bool) or not isinstance(
            raw_max_output_tokens, int
        ):
            raise ValueError("model_params.max_output_tokens must be an integer")
        if raw_max_output_tokens <= 0:
            raise ValueError("model_params.max_output_tokens must be greater than 0")
        max_output_tokens = raw_max_output_tokens
    else:
        max_output_tokens = None

    if raw_temperature is not None:
        if isinstance(raw_temperature, bool) or not isinstance(
            raw_temperature, (int, float)
        ):
            raise ValueError("model_params.temperature must be a number")
        temperature = float(raw_temperature)
        if not isfinite(temperature) or temperature < 0 or temperature > 2:
            raise ValueError("model_params.temperature must be between 0 and 2")
    else:
        temperature = None

    if raw_top_p is not None:
        if isinstance(raw_top_p, bool) or not isinstance(raw_top_p, (int, float)):
            raise ValueError("model_params.top_p must be a number")
        top_p = float(raw_top_p)
        if not isfinite(top_p) or top_p <= 0 or top_p > 1:
            raise ValueError("model_params.top_p must be greater than 0 and at most 1")
    else:
        top_p = None

    params = ModelParams(
        reasoning_effort=reasoning_effort or None,
        verbosity=verbosity or None,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        top_p=top_p,
    )
    return None if is_empty_model_params(params) else params


def serialize_provider(provider: ProviderConfig) -> dict[str, object]:
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
        "api_key": provider.api_key,
    }


def serialize_role(role: RoleConfig) -> dict[str, object]:
    return {
        "name": role.name,
        "system_prompt": role.system_prompt,
        "model": serialize_role_model(role.model),
        "model_params": serialize_model_params(role.model_params),
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


def _normalize_model_param_choice(
    raw_value: object,
    *,
    allowed: frozenset[str],
) -> tuple[str | None, bool]:
    if raw_value is None:
        return None, False
    if not isinstance(raw_value, str):
        return None, True

    value = raw_value.strip().lower()
    if not value:
        return None, raw_value != ""
    if value not in allowed:
        return None, True
    return value, value != raw_value


def _normalize_positive_int(raw_value: object) -> tuple[int | None, bool]:
    if raw_value is None:
        return None, False
    if isinstance(raw_value, bool):
        return None, True
    if isinstance(raw_value, int):
        return (raw_value, False) if raw_value > 0 else (None, True)
    if isinstance(raw_value, float) and raw_value.is_integer():
        value = int(raw_value)
        return (value, True) if value > 0 else (None, True)
    return None, True


def _normalize_temperature(raw_value: object) -> tuple[float | None, bool]:
    if raw_value is None:
        return None, False
    if isinstance(raw_value, bool):
        return None, True
    if not isinstance(raw_value, (int, float)):
        return None, True

    value = float(raw_value)
    if not isfinite(value) or value < 0 or value > 2:
        return None, True
    return value, False


def _normalize_top_p(raw_value: object) -> tuple[float | None, bool]:
    if raw_value is None:
        return None, False
    if isinstance(raw_value, bool):
        return None, True
    if not isinstance(raw_value, (int, float)):
        return None, True

    value = float(raw_value)
    if not isfinite(value) or value <= 0 or value > 1:
        return None, True
    return value, False


def _normalize_optional_model_params(
    raw_model_params: object,
) -> tuple[ModelParams | None, bool]:
    if raw_model_params is None:
        return None, False
    if not isinstance(raw_model_params, dict):
        return None, True

    reasoning_effort, migrated_reasoning = _normalize_model_param_choice(
        raw_model_params.get("reasoning_effort"),
        allowed=MODEL_REASONING_EFFORT_OPTIONS,
    )
    verbosity, migrated_verbosity = _normalize_model_param_choice(
        raw_model_params.get("verbosity"),
        allowed=MODEL_VERBOSITY_OPTIONS,
    )
    max_output_tokens, migrated_max_output_tokens = _normalize_positive_int(
        raw_model_params.get("max_output_tokens")
    )
    temperature, migrated_temperature = _normalize_temperature(
        raw_model_params.get("temperature")
    )
    top_p, migrated_top_p = _normalize_top_p(raw_model_params.get("top_p"))

    params = ModelParams(
        reasoning_effort=reasoning_effort,
        verbosity=verbosity,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
        top_p=top_p,
    )
    migrated = (
        migrated_reasoning
        or migrated_verbosity
        or migrated_max_output_tokens
        or migrated_temperature
        or migrated_top_p
    )

    if is_empty_model_params(params):
        return None, migrated or bool(raw_model_params)

    return params, migrated


def _normalize_model_params_with_defaults(
    raw_model_params: object,
) -> tuple[ModelParams, bool]:
    params, migrated = _normalize_optional_model_params(raw_model_params)
    if params is not None:
        return params, migrated
    return build_default_model_params(), migrated or raw_model_params is None


def _build_settings(data: dict[str, object]) -> tuple[Settings, bool]:
    migrated = False

    event_log_data = data.get("event_log", {})
    if not isinstance(event_log_data, dict):
        event_log_data = {}
    event_log = EventLogSettings(**event_log_data)

    assistant_data = data.get("assistant", {})
    if not isinstance(assistant_data, dict):
        assistant_data = {}
        migrated = True
    if "assistant" not in data:
        migrated = True
    assistant_role_name = assistant_data.get("role_name")
    assistant = AssistantSettings(
        role_name=assistant_role_name.strip()
        if isinstance(assistant_role_name, str) and assistant_role_name.strip()
        else STEWARD_ROLE_NAME
    )
    if assistant.role_name == STEWARD_ROLE_NAME and (
        not isinstance(assistant_role_name, str) or not assistant_role_name.strip()
    ):
        migrated = True

    model_data = data.get("model", {})
    if not isinstance(model_data, dict):
        model_data = {}
        migrated = True
    model_params, model_params_migrated = _normalize_model_params_with_defaults(
        model_data.get("params")
    )
    migrated = migrated or model_params_migrated
    model_settings = ModelSettings(
        active_provider_id=str(model_data.get("active_provider_id", "")),
        active_model=str(model_data.get("active_model", "")),
        params=model_params,
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
        role_model_params: ModelParams | None = None
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
        if "model_params" in role:
            role_model_params, role_model_params_migrated = (
                _normalize_optional_model_params(role.get("model_params"))
            )
            migrated = migrated or role_model_params_migrated

        roles.append(
            RoleConfig(
                name=role_name,
                system_prompt=str(role.get("system_prompt", "")),
                model=role_model,
                model_params=role_model_params,
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
            assistant=assistant,
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


def build_steward_role() -> RoleConfig:
    return RoleConfig(
        name=STEWARD_ROLE_NAME,
        system_prompt=STEWARD_ROLE_SYSTEM_PROMPT,
        included_tools=[],
        excluded_tools=[],
    )


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


def rename_role_references(
    settings: Settings,
    old_role_name: str,
    new_role_name: str,
) -> bool:
    if settings.assistant.role_name != old_role_name:
        return False
    settings.assistant.role_name = new_role_name
    return True


def clear_role_references(settings: Settings, role_name: str) -> bool:
    if settings.assistant.role_name != role_name:
        return False
    settings.assistant.role_name = STEWARD_ROLE_NAME
    return True


def ensure_assistant_role(settings: Settings) -> bool:
    if find_role(settings, settings.assistant.role_name) is not None:
        return False
    settings.assistant.role_name = STEWARD_ROLE_NAME
    return True


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
    builtin_role_order = [
        build_steward_role(),
        build_worker_role(),
        build_conductor_role(),
    ]
    for standard_role in builtin_role_order:
        changed = _ensure_builtin_role(settings, standard_role) or changed
    changed = ensure_assistant_role(settings) or changed

    ordered_roles: list[RoleConfig] = []
    builtin_role_names = {role.name for role in builtin_role_order}
    for standard_role in builtin_role_order:
        current_role = find_role(settings, standard_role.name)
        if current_role is not None:
            ordered_roles.append(current_role)
    for role in settings.roles:
        if role.name not in builtin_role_names:
            ordered_roles.append(role)
    if ordered_roles != settings.roles:
        settings.roles = ordered_roles
        changed = True
    return changed


def is_builtin_role_name(role_name: str) -> bool:
    return role_name in BUILTIN_ROLE_NAMES

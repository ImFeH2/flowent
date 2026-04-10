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
STEWARD_ROLE_INCLUDED_TOOLS = [
    "create_tab",
    "delete_tab",
    "list_tabs",
    "list_roles",
    "list_tools",
    "manage_providers",
    "manage_roles",
    "manage_settings",
    "manage_prompts",
]
WORKER_ROLE_SYSTEM_PROMPT = (
    "You are the Worker role - a narrow execution node inside a task tab. "
    "Follow the assigned subtask, use the tools you were given to complete it, "
    "and report back clearly. You are not the Human-facing system entrypoint "
    "and you are not the tab-level orchestrator."
)
CONDUCTOR_ROLE_SYSTEM_PROMPT = """\
You are the Conductor role currently used by a task tab's Leader.

Your responsibilities:
- Receive execution briefs from the Assistant for this tab through the tab's Leader identity
- Decide how the task should be decomposed inside the current tab
- Design, expand, adjust, and simplify this tab's Agent Graph as the work evolves
- Coordinate agents, aggregate their results, and return a coherent result upstream to the Assistant

## Ownership

- This role is the default behavior template for a tab's Leader, not a separate product identity outside the Leader
- The tab's Leader is the only owner-level entrypoint for this tab
- You are not a global orchestrator shared across tabs
- The Assistant owns Human-facing intake and task-boundary management; the Leader owns this tab's internal execution structure
- Regular task-node results should usually come back to you first, then you summarize and escalate upstream when appropriate

## Decision Framework

- Start from the Assistant's brief, not from the Human directly.
- Analyze the task first, then choose the structure that best fits it: one Worker, fan-out, pipeline, fan-out-fan-in, reviewer loop, or another topology that matches the work.
- Do not default to creating a single Worker and handing it the entire task. Only choose that structure when the task is truly atomic and there is no clear orchestration, review, parallelism, or synthesis value.
- Prefer multi-agent parallelism over serial single-agent execution. If subtasks are independent, create separate nodes for them rather than assigning everything to one Worker.
- Prefer adding peer nodes to the current tab with `create_agent`, then wire them with `connect` to match the topology you want.
- Treat this tab as the execution boundary. Do not push internal graph design back to the Assistant.
- Do not treat any single topology as the default. Match the graph design to the task's decomposition, dependencies, and coordination needs.

## Workflow

1. **Receive** the brief from the Assistant as the current tab's Leader
2. **Plan** using `todo` - break into subtasks, decide what to delegate, and design the graph structure that best fits the work
3. **Inspect roles** with `list_roles`; use `list_tools` for a full tool inventory
4. **Create the graph structure** with `create_agent` and `connect`
5. **Dispatch immediately** after creation: send each node that should begin working its first concrete task, including where its result should go; creating nodes does not begin execution by itself
6. **Adjust topology dynamically** with `create_agent` and `connect` when the structure needs to change during execution
7. **Coordinate** as results arrive; update your plan when needed
8. **Aggregate** and return the final result or escalation upstream to the Assistant

## Guidelines

- Prefer `create_agent` and `connect` as the primary control plane for the current tab
- Do not create a node and then `idle` without dispatching work unless you intentionally want the new node to stay idle
- Your default posture is orchestration, not being the long-running executor for specialized work
- When a task requires `read`, `exec`, `edit`, `fetch`, or similarly execution-heavy tools, create a Worker node to do that work
- Create agents with only the tools they need
- Use `write_dirs` for file write access
- When dispatching tasks to nodes, specify where each node should send its result (e.g. "send your result to @Synthesizer"). Use `connect` to wire direct communication paths between nodes, so results flow directly to the right destination without relaying through you.
- Prefer explicit graph topology over ad-hoc relaying: wire synthesizers, reviewers, and feedback loops with `connect` rather than manually relaying every message yourself
- Once delegation is clearly the right move, execute it directly without asking the Assistant or Human
- Keep the overall tab graph understandable; add complexity only when it materially improves throughput, quality, or resilience
"""
BUILTIN_ROLE_NAMES = frozenset(
    {STEWARD_ROLE_NAME, WORKER_ROLE_NAME, CONDUCTOR_ROLE_NAME}
)
WORKER_ROLE_INCLUDED_TOOLS = ["read", "exec"]
CONDUCTOR_ROLE_INCLUDED_TOOLS = [
    "create_agent",
    "connect",
    "list_tabs",
    "list_roles",
    "list_tools",
]
MODEL_REASONING_EFFORT_OPTIONS = frozenset({"none", "low", "medium", "high", "xhigh"})
MODEL_VERBOSITY_OPTIONS = frozenset({"low", "medium", "high"})
MODEL_RETRY_POLICY_OPTIONS = frozenset({"no_retry", "limited", "unlimited"})
REMOVED_TOOL_NAMES = frozenset({"exit", "list_connections"})
DEFAULT_LLM_TIMEOUT_MS = 10000
DEFAULT_LLM_MAX_RETRIES = 5
DEFAULT_LLM_RETRY_POLICY = "limited"
DEFAULT_LLM_RETRY_INITIAL_DELAY_SECONDS = 0.5
DEFAULT_LLM_RETRY_MAX_DELAY_SECONDS = 8.0
DEFAULT_LLM_RETRY_BACKOFF_CAP_RETRIES = 5
DEFAULT_ASSISTANT_ALLOW_NETWORK = True


def build_default_assistant_write_dirs() -> list[str]:
    return [str(WORKING_DIR.resolve())]


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
    headers: dict[str, str] = field(default_factory=dict)
    retry_429_delay_seconds: int = 0


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


def _normalize_assistant_write_dir(raw_write_dir: str) -> str:
    return str(Path(raw_write_dir).expanduser().resolve(strict=False))


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
    timeout_ms: int = DEFAULT_LLM_TIMEOUT_MS
    retry_policy: str = DEFAULT_LLM_RETRY_POLICY
    max_retries: int = DEFAULT_LLM_MAX_RETRIES
    retry_initial_delay_seconds: float = DEFAULT_LLM_RETRY_INITIAL_DELAY_SECONDS
    retry_max_delay_seconds: float = DEFAULT_LLM_RETRY_MAX_DELAY_SECONDS
    retry_backoff_cap_retries: int = DEFAULT_LLM_RETRY_BACKOFF_CAP_RETRIES


@dataclass
class AssistantSettings:
    role_name: str = STEWARD_ROLE_NAME
    allow_network: bool = DEFAULT_ASSISTANT_ALLOW_NETWORK
    write_dirs: list[str] = field(default_factory=build_default_assistant_write_dirs)


@dataclass
class LeaderSettings:
    role_name: str = CONDUCTOR_ROLE_NAME


@dataclass
class TelegramPendingChat:
    chat_id: int
    username: str | None = None
    display_name: str = ""
    first_seen_at: float = 0.0
    last_seen_at: float = 0.0


@dataclass
class TelegramApprovedChat:
    chat_id: int
    username: str | None = None
    display_name: str = ""
    approved_at: float = 0.0


@dataclass
class TelegramSettings:
    bot_token: str = ""
    pending_chats: list[TelegramPendingChat] = field(default_factory=list)
    approved_chats: list[TelegramApprovedChat] = field(default_factory=list)


@dataclass
class Settings:
    event_log: EventLogSettings = field(default_factory=EventLogSettings)
    assistant: AssistantSettings = field(default_factory=AssistantSettings)
    leader: LeaderSettings = field(default_factory=LeaderSettings)
    telegram: TelegramSettings = field(default_factory=TelegramSettings)
    model: ModelSettings = field(default_factory=ModelSettings)
    custom_prompt: str = ""
    custom_post_prompt: str = ""
    providers: list[ProviderConfig] = field(default_factory=list)
    roles: list[RoleConfig] = field(default_factory=list)


_cached_settings: Settings | None = None
_settings_lock = threading.Lock()


def normalize_tool_names(tool_names: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tool_name in tool_names:
        name = tool_name.strip()
        if not name or name in seen or name in REMOVED_TOOL_NAMES:
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


def build_model_max_retries(
    raw_max_retries: object,
    *,
    field_name: str = "model.max_retries",
) -> int:
    if isinstance(raw_max_retries, bool) or not isinstance(raw_max_retries, int):
        raise ValueError(f"{field_name} must be an integer")
    if raw_max_retries <= 0:
        raise ValueError(f"{field_name} must be greater than 0")
    return raw_max_retries


def build_assistant_allow_network(
    raw_allow_network: object,
    *,
    field_name: str = "assistant.allow_network",
) -> bool:
    if not isinstance(raw_allow_network, bool):
        raise ValueError(f"{field_name} must be a boolean")
    return raw_allow_network


def build_assistant_write_dirs(
    raw_write_dirs: object,
    *,
    field_name: str = "assistant.write_dirs",
) -> list[str]:
    if not isinstance(raw_write_dirs, list):
        raise ValueError(f"{field_name} must be an array of strings")

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_item in raw_write_dirs:
        if not isinstance(raw_item, str):
            raise ValueError(f"{field_name} must be an array of strings")
        stripped = raw_item.strip()
        if not stripped:
            continue
        normalized_item = _normalize_assistant_write_dir(stripped)
        if normalized_item in seen:
            continue
        seen.add(normalized_item)
        normalized.append(normalized_item)
    return normalized


def build_model_retry_policy(
    raw_retry_policy: object,
    *,
    field_name: str = "model.retry_policy",
) -> str:
    if not isinstance(raw_retry_policy, str):
        raise ValueError(f"{field_name} must be a string")
    retry_policy = raw_retry_policy.strip().lower()
    if retry_policy not in MODEL_RETRY_POLICY_OPTIONS:
        raise ValueError(
            f"{field_name} must be one of: "
            + ", ".join(sorted(MODEL_RETRY_POLICY_OPTIONS))
        )
    return retry_policy


def build_model_retry_initial_delay_seconds(
    raw_delay_seconds: object,
    *,
    field_name: str = "model.retry_initial_delay_seconds",
) -> float:
    if isinstance(raw_delay_seconds, bool) or not isinstance(
        raw_delay_seconds, (int, float)
    ):
        raise ValueError(f"{field_name} must be a number")
    delay_seconds = float(raw_delay_seconds)
    if not isfinite(delay_seconds) or delay_seconds <= 0:
        raise ValueError(f"{field_name} must be greater than 0")
    return delay_seconds


def build_model_retry_max_delay_seconds(
    raw_delay_seconds: object,
    *,
    field_name: str = "model.retry_max_delay_seconds",
) -> float:
    if isinstance(raw_delay_seconds, bool) or not isinstance(
        raw_delay_seconds, (int, float)
    ):
        raise ValueError(f"{field_name} must be a number")
    delay_seconds = float(raw_delay_seconds)
    if not isfinite(delay_seconds) or delay_seconds <= 0:
        raise ValueError(f"{field_name} must be greater than 0")
    return delay_seconds


def build_model_retry_backoff_cap_retries(
    raw_cap_retries: object,
    *,
    field_name: str = "model.retry_backoff_cap_retries",
) -> int:
    if isinstance(raw_cap_retries, bool) or not isinstance(raw_cap_retries, int):
        raise ValueError(f"{field_name} must be an integer")
    if raw_cap_retries <= 0:
        raise ValueError(f"{field_name} must be greater than 0")
    return raw_cap_retries


def validate_model_retry_backoff_settings(
    *,
    retry_initial_delay_seconds: float,
    retry_max_delay_seconds: float,
) -> None:
    if retry_max_delay_seconds < retry_initial_delay_seconds:
        raise ValueError(
            "model.retry_max_delay_seconds must be greater than or equal to "
            "model.retry_initial_delay_seconds"
        )


def build_model_timeout_ms(
    raw_timeout_ms: object,
    *,
    field_name: str = "model.timeout_ms",
) -> int:
    if isinstance(raw_timeout_ms, bool) or not isinstance(raw_timeout_ms, int):
        raise ValueError(f"{field_name} must be an integer")
    if raw_timeout_ms <= 0:
        raise ValueError(f"{field_name} must be greater than 0")
    return raw_timeout_ms


def build_provider_headers(
    raw_headers: object,
    *,
    field_name: str = "headers",
) -> dict[str, str]:
    if raw_headers is None:
        return {}
    if not isinstance(raw_headers, dict):
        raise ValueError(f"{field_name} must be a JSON object")

    headers: dict[str, str] = {}
    for key, value in raw_headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise ValueError(f"{field_name} must be a JSON object of string values")
        headers[key] = value
    return headers


def build_provider_retry_429_delay_seconds(
    raw_delay_seconds: object,
    *,
    field_name: str = "retry_429_delay_seconds",
) -> int:
    if isinstance(raw_delay_seconds, bool) or not isinstance(raw_delay_seconds, int):
        raise ValueError(f"{field_name} must be an integer")
    if raw_delay_seconds < 0:
        raise ValueError(f"{field_name} must be greater than or equal to 0")
    return raw_delay_seconds


def _normalize_provider_headers(raw_headers: object) -> tuple[dict[str, str], bool]:
    if raw_headers is None:
        return {}, False
    if not isinstance(raw_headers, dict):
        return {}, True

    headers: dict[str, str] = {}
    migrated = False
    for key, value in raw_headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            migrated = True
            continue
        headers[key] = value
    return headers, migrated


def serialize_provider(provider: ProviderConfig) -> dict[str, object]:
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
        "api_key": provider.api_key,
        "headers": dict(provider.headers),
        "retry_429_delay_seconds": provider.retry_429_delay_seconds,
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


def mask_secret(secret: str) -> str:
    if not secret:
        return ""
    return f"sk-...{secret[-4:]}"


def serialize_telegram_settings(
    telegram: TelegramSettings,
    *,
    mask_token: bool = True,
) -> dict[str, object]:
    return {
        "bot_token": mask_secret(telegram.bot_token)
        if mask_token
        else telegram.bot_token,
        "pending_chats": [asdict(chat) for chat in telegram.pending_chats],
        "approved_chats": [asdict(chat) for chat in telegram.approved_chats],
    }


def serialize_settings(
    settings: Settings,
    *,
    mask_telegram_token: bool = True,
) -> dict[str, object]:
    data = asdict(settings)
    data["telegram"] = serialize_telegram_settings(
        settings.telegram,
        mask_token=mask_telegram_token,
    )
    return data


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


def _normalize_int_list(raw_values: object) -> tuple[list[int], bool]:
    if raw_values is None:
        return [], False
    if not isinstance(raw_values, list):
        return [], True

    normalized: list[int] = []
    migrated = False
    for raw_value in raw_values:
        if isinstance(raw_value, bool):
            migrated = True
            continue
        if isinstance(raw_value, int):
            value = raw_value
        elif isinstance(raw_value, float) and raw_value.is_integer():
            value = int(raw_value)
            migrated = True
        elif isinstance(raw_value, str):
            stripped = raw_value.strip()
            if not stripped:
                migrated = True
                continue
            try:
                value = int(stripped)
            except ValueError:
                migrated = True
                continue
            migrated = True
        else:
            migrated = True
            continue

        if value in normalized:
            migrated = True
            continue
        normalized.append(value)

    return normalized, migrated


def _normalize_float(raw_value: object) -> tuple[float, bool]:
    if isinstance(raw_value, bool):
        return 0.0, True
    if isinstance(raw_value, (int, float)):
        value = float(raw_value)
        return value, False
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return 0.0, True
        try:
            return float(stripped), True
        except ValueError:
            return 0.0, True
    return 0.0, raw_value is not None


def _normalize_optional_string(raw_value: object) -> tuple[str | None, bool]:
    if raw_value is None:
        return None, False
    if not isinstance(raw_value, str):
        return None, True
    stripped = raw_value.strip()
    if not stripped:
        return None, raw_value != ""
    return stripped, stripped != raw_value


def _normalize_required_string(raw_value: object) -> tuple[str, bool]:
    if not isinstance(raw_value, str):
        return "", raw_value is not None
    stripped = raw_value.strip()
    return stripped, stripped != raw_value


def _build_pending_chat(raw_chat: object) -> tuple[TelegramPendingChat | None, bool]:
    if not isinstance(raw_chat, dict):
        return None, True

    chat_id_value = raw_chat.get("chat_id")
    if isinstance(chat_id_value, bool) or not isinstance(chat_id_value, int):
        return None, True

    username, username_migrated = _normalize_optional_string(raw_chat.get("username"))
    display_name, display_name_migrated = _normalize_required_string(
        raw_chat.get("display_name")
    )
    first_seen_at, first_seen_migrated = _normalize_float(raw_chat.get("first_seen_at"))
    last_seen_at, last_seen_migrated = _normalize_float(raw_chat.get("last_seen_at"))

    pending_chat = TelegramPendingChat(
        chat_id=chat_id_value,
        username=username,
        display_name=display_name,
        first_seen_at=first_seen_at,
        last_seen_at=last_seen_at,
    )
    migrated = (
        username_migrated
        or display_name_migrated
        or first_seen_migrated
        or last_seen_migrated
    )
    return pending_chat, migrated


def _build_approved_chat(
    raw_chat: object,
) -> tuple[TelegramApprovedChat | None, bool]:
    if not isinstance(raw_chat, dict):
        return None, True

    chat_id_value = raw_chat.get("chat_id")
    if isinstance(chat_id_value, bool) or not isinstance(chat_id_value, int):
        return None, True

    username, username_migrated = _normalize_optional_string(raw_chat.get("username"))
    display_name, display_name_migrated = _normalize_required_string(
        raw_chat.get("display_name")
    )
    approved_at, approved_at_migrated = _normalize_float(raw_chat.get("approved_at"))

    approved_chat = TelegramApprovedChat(
        chat_id=chat_id_value,
        username=username,
        display_name=display_name,
        approved_at=approved_at,
    )
    migrated = username_migrated or display_name_migrated or approved_at_migrated
    return approved_chat, migrated


def _normalize_pending_chats(
    raw_chats: object,
) -> tuple[list[TelegramPendingChat], bool]:
    if raw_chats is None:
        return [], False
    if not isinstance(raw_chats, list):
        return [], True

    normalized: list[TelegramPendingChat] = []
    seen_chat_ids: set[int] = set()
    migrated = False
    for raw_chat in raw_chats:
        chat, chat_migrated = _build_pending_chat(raw_chat)
        migrated = migrated or chat_migrated
        if chat is None:
            continue
        if chat.chat_id in seen_chat_ids:
            migrated = True
            continue
        seen_chat_ids.add(chat.chat_id)
        normalized.append(chat)
    return normalized, migrated


def _normalize_approved_chats(
    raw_chats: object,
) -> tuple[list[TelegramApprovedChat], bool]:
    if raw_chats is None:
        return [], False
    if not isinstance(raw_chats, list):
        return [], True

    normalized: list[TelegramApprovedChat] = []
    seen_chat_ids: set[int] = set()
    migrated = False
    for raw_chat in raw_chats:
        chat, chat_migrated = _build_approved_chat(raw_chat)
        migrated = migrated or chat_migrated
        if chat is None:
            continue
        if chat.chat_id in seen_chat_ids:
            migrated = True
            continue
        seen_chat_ids.add(chat.chat_id)
        normalized.append(chat)
    return normalized, migrated


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
    raw_assistant_allow_network = assistant_data.get("allow_network")
    if raw_assistant_allow_network is None:
        assistant_allow_network = DEFAULT_ASSISTANT_ALLOW_NETWORK
        migrated = True
    else:
        try:
            assistant_allow_network = build_assistant_allow_network(
                raw_assistant_allow_network
            )
        except ValueError:
            assistant_allow_network = DEFAULT_ASSISTANT_ALLOW_NETWORK
            migrated = True
    raw_assistant_write_dirs = assistant_data.get("write_dirs")
    if raw_assistant_write_dirs is None or not isinstance(
        raw_assistant_write_dirs, list
    ):
        assistant_write_dirs = build_default_assistant_write_dirs()
        migrated = True
    else:
        assistant_write_dirs = []
        seen_assistant_write_dirs: set[str] = set()
        for raw_item in raw_assistant_write_dirs:
            if not isinstance(raw_item, str):
                migrated = True
                continue
            stripped = raw_item.strip()
            if not stripped:
                migrated = True
                continue
            normalized_item = _normalize_assistant_write_dir(stripped)
            if normalized_item != raw_item:
                migrated = True
            if normalized_item in seen_assistant_write_dirs:
                migrated = True
                continue
            seen_assistant_write_dirs.add(normalized_item)
            assistant_write_dirs.append(normalized_item)
    assistant = AssistantSettings(
        role_name=assistant_role_name.strip()
        if isinstance(assistant_role_name, str) and assistant_role_name.strip()
        else STEWARD_ROLE_NAME,
        allow_network=assistant_allow_network,
        write_dirs=assistant_write_dirs,
    )
    if assistant.role_name == STEWARD_ROLE_NAME and (
        not isinstance(assistant_role_name, str) or not assistant_role_name.strip()
    ):
        migrated = True

    leader_data = data.get("leader", {})
    if not isinstance(leader_data, dict):
        leader_data = {}
        migrated = True
    if "leader" not in data:
        migrated = True
    leader_role_name = leader_data.get("role_name")
    leader = LeaderSettings(
        role_name=leader_role_name.strip()
        if isinstance(leader_role_name, str) and leader_role_name.strip()
        else CONDUCTOR_ROLE_NAME
    )
    if leader.role_name == CONDUCTOR_ROLE_NAME and (
        not isinstance(leader_role_name, str) or not leader_role_name.strip()
    ):
        migrated = True

    telegram_data = data.get("telegram", {})
    if not isinstance(telegram_data, dict):
        telegram_data = {}
        migrated = True
    if "telegram" not in data:
        migrated = True
    bot_token = telegram_data.get("bot_token", "")
    pending_chats, pending_chats_migrated = _normalize_pending_chats(
        telegram_data.get("pending_chats")
    )
    approved_chats, approved_chats_migrated = _normalize_approved_chats(
        telegram_data.get("approved_chats")
    )
    migrated = migrated or pending_chats_migrated or approved_chats_migrated
    if "pending_links" in telegram_data:
        migrated = True
    if "allowed_user_ids" in telegram_data or "registered_chat_ids" in telegram_data:
        migrated = True
        legacy_registered_chat_ids, _ = _normalize_int_list(
            telegram_data.get("registered_chat_ids")
        )
        for chat_id in legacy_registered_chat_ids:
            if any(chat.chat_id == chat_id for chat in approved_chats):
                continue
            approved_chats.append(
                TelegramApprovedChat(
                    chat_id=chat_id,
                    approved_at=0.0,
                )
            )
    telegram = TelegramSettings(
        bot_token=bot_token.strip() if isinstance(bot_token, str) else "",
        pending_chats=pending_chats,
        approved_chats=approved_chats,
    )
    if bot_token is not None and not isinstance(bot_token, str):
        migrated = True

    model_data = data.get("model", {})
    if not isinstance(model_data, dict):
        model_data = {}
        migrated = True
    model_params, model_params_migrated = _normalize_model_params_with_defaults(
        model_data.get("params")
    )
    migrated = migrated or model_params_migrated
    raw_model_retry_policy = model_data.get("retry_policy")
    if raw_model_retry_policy is None:
        model_retry_policy = DEFAULT_LLM_RETRY_POLICY
        migrated = True
    else:
        try:
            model_retry_policy = build_model_retry_policy(raw_model_retry_policy)
        except ValueError:
            model_retry_policy = DEFAULT_LLM_RETRY_POLICY
            migrated = True
    raw_model_max_retries = model_data.get("max_retries")
    if raw_model_max_retries is None:
        model_max_retries = DEFAULT_LLM_MAX_RETRIES
        migrated = True
    else:
        try:
            model_max_retries = build_model_max_retries(raw_model_max_retries)
        except ValueError:
            model_max_retries = DEFAULT_LLM_MAX_RETRIES
            migrated = True
    raw_retry_initial_delay_seconds = model_data.get("retry_initial_delay_seconds")
    if raw_retry_initial_delay_seconds is None:
        retry_initial_delay_seconds = DEFAULT_LLM_RETRY_INITIAL_DELAY_SECONDS
        migrated = True
    else:
        try:
            retry_initial_delay_seconds = build_model_retry_initial_delay_seconds(
                raw_retry_initial_delay_seconds
            )
        except ValueError:
            retry_initial_delay_seconds = DEFAULT_LLM_RETRY_INITIAL_DELAY_SECONDS
            migrated = True
    raw_retry_max_delay_seconds = model_data.get("retry_max_delay_seconds")
    if raw_retry_max_delay_seconds is None:
        retry_max_delay_seconds = DEFAULT_LLM_RETRY_MAX_DELAY_SECONDS
        migrated = True
    else:
        try:
            retry_max_delay_seconds = build_model_retry_max_delay_seconds(
                raw_retry_max_delay_seconds
            )
        except ValueError:
            retry_max_delay_seconds = DEFAULT_LLM_RETRY_MAX_DELAY_SECONDS
            migrated = True
    raw_retry_backoff_cap_retries = model_data.get("retry_backoff_cap_retries")
    if raw_retry_backoff_cap_retries is None:
        retry_backoff_cap_retries = DEFAULT_LLM_RETRY_BACKOFF_CAP_RETRIES
        migrated = True
    else:
        try:
            retry_backoff_cap_retries = build_model_retry_backoff_cap_retries(
                raw_retry_backoff_cap_retries
            )
        except ValueError:
            retry_backoff_cap_retries = DEFAULT_LLM_RETRY_BACKOFF_CAP_RETRIES
            migrated = True
    try:
        validate_model_retry_backoff_settings(
            retry_initial_delay_seconds=retry_initial_delay_seconds,
            retry_max_delay_seconds=retry_max_delay_seconds,
        )
    except ValueError:
        retry_initial_delay_seconds = DEFAULT_LLM_RETRY_INITIAL_DELAY_SECONDS
        retry_max_delay_seconds = DEFAULT_LLM_RETRY_MAX_DELAY_SECONDS
        migrated = True
    raw_model_timeout_ms = model_data.get("timeout_ms")
    if raw_model_timeout_ms is None:
        model_timeout_ms = DEFAULT_LLM_TIMEOUT_MS
        migrated = True
    else:
        try:
            model_timeout_ms = build_model_timeout_ms(raw_model_timeout_ms)
        except ValueError:
            model_timeout_ms = DEFAULT_LLM_TIMEOUT_MS
            migrated = True
    model_settings = ModelSettings(
        active_provider_id=str(model_data.get("active_provider_id", "")),
        active_model=str(model_data.get("active_model", "")),
        params=model_params,
        timeout_ms=model_timeout_ms,
        retry_policy=model_retry_policy,
        max_retries=model_max_retries,
        retry_initial_delay_seconds=retry_initial_delay_seconds,
        retry_max_delay_seconds=retry_max_delay_seconds,
        retry_backoff_cap_retries=retry_backoff_cap_retries,
    )
    custom_prompt = str(data.get("custom_prompt", ""))
    if "custom_post_prompt" in data:
        custom_post_prompt = str(data.get("custom_post_prompt", ""))
    else:
        custom_post_prompt = str(data.get("post_prompt", ""))
        if "post_prompt" in data:
            migrated = True

    providers_raw = data.get("providers", [])
    if not isinstance(providers_raw, list):
        providers_raw = []
    providers = []
    for provider in providers_raw:
        if not isinstance(provider, dict):
            continue
        headers, headers_migrated = _normalize_provider_headers(provider.get("headers"))
        migrated = migrated or headers_migrated
        raw_retry_429_delay_seconds = provider.get("retry_429_delay_seconds")
        if raw_retry_429_delay_seconds is None:
            retry_429_delay_seconds = 0
            migrated = True
        else:
            try:
                retry_429_delay_seconds = build_provider_retry_429_delay_seconds(
                    raw_retry_429_delay_seconds
                )
            except ValueError:
                retry_429_delay_seconds = 0
                migrated = True
        providers.append(
            ProviderConfig(
                id=str(provider.get("id", "")),
                name=str(provider.get("name", "")),
                type=str(provider.get("type", "openai_compatible")),
                base_url=str(provider.get("base_url", "")),
                api_key=str(provider.get("api_key", "")),
                headers=headers,
                retry_429_delay_seconds=retry_429_delay_seconds,
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
            leader=leader,
            telegram=telegram,
            model=model_settings,
            custom_prompt=custom_prompt,
            custom_post_prompt=custom_post_prompt,
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
        included_tools=list(STEWARD_ROLE_INCLUDED_TOOLS),
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
    changed = False
    if settings.assistant.role_name == old_role_name:
        settings.assistant.role_name = new_role_name
        changed = True
    if settings.leader.role_name == old_role_name:
        settings.leader.role_name = new_role_name
        changed = True
    return changed


def clear_role_references(settings: Settings, role_name: str) -> bool:
    changed = False
    if settings.assistant.role_name == role_name:
        settings.assistant.role_name = STEWARD_ROLE_NAME
        changed = True
    if settings.leader.role_name == role_name:
        settings.leader.role_name = CONDUCTOR_ROLE_NAME
        changed = True
    return changed


def ensure_assistant_role(settings: Settings) -> bool:
    if find_role(settings, settings.assistant.role_name) is not None:
        return False
    settings.assistant.role_name = STEWARD_ROLE_NAME
    return True


def ensure_leader_role(settings: Settings) -> bool:
    if find_role(settings, settings.leader.role_name) is not None:
        return False
    settings.leader.role_name = CONDUCTOR_ROLE_NAME
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
    changed = ensure_leader_role(settings) or changed

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

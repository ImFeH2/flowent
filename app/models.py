from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class Role(StrEnum):
    STEWARD = "steward"
    SUPERVISOR = "supervisor"
    WORKER = "worker"


class AgentState(StrEnum):
    INITIALIZING = "initializing"
    IDLE = "idle"
    RUNNING = "running"
    ERROR = "error"
    TERMINATED = "terminated"


class HistoryType(StrEnum):
    SYSTEM = "system"
    SYSTEM_INJECTION = "system_injection"
    RECEIVED_MESSAGE = "received_message"
    ASSISTANT_TEXT = "assistant_text"
    ASSISTANT_THINKING = "assistant_thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    SENT_MESSAGE = "sent_message"
    ERROR = "error"


@dataclass
class HistoryEntry:
    type: HistoryType
    content: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    tool_name: str | None = None
    tool_call_id: str | None = None
    arguments: dict[str, Any] | None = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class Message:
    from_id: str
    to_id: str
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class Permissions:
    allowed_paths: list[str] = field(default_factory=list)
    blocked_paths: list[str] = field(default_factory=list)
    writable_paths: list[str] = field(default_factory=list)

    allowed_commands: list[str] = field(default_factory=list)

    network_access: bool = False


@dataclass
class TestSuite:
    scripts: list[str] = field(default_factory=list)


@dataclass
class AgentConfig:
    task_prompt: str
    role: Role
    permissions: Permissions = field(default_factory=Permissions)
    testsuite: TestSuite = field(default_factory=TestSuite)
    supervisor_id: str | None = None
    worktree_path: str | None = None
    branch: str | None = None
    name: str | None = None


@dataclass
class ModelInfo:
    id: str
    name: str | None = None


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    thinking: str | None = None


class EventType(StrEnum):
    AGENT_CREATED = "agent_created"
    AGENT_STATE_CHANGED = "agent_state_changed"
    AGENT_MESSAGE = "agent_message"
    AGENT_TERMINATED = "agent_terminated"
    TOOL_CALLED = "tool_called"
    HISTORY_ENTRY_ADDED = "history_entry_added"
    HISTORY_ENTRY_DELTA = "history_entry_delta"
    PATH_ACCESS_REQUESTED = "path_access_requested"


DISPLAY_EVENTS: set[EventType] = {
    EventType.AGENT_CREATED,
    EventType.AGENT_STATE_CHANGED,
    EventType.AGENT_MESSAGE,
    EventType.AGENT_TERMINATED,
    EventType.TOOL_CALLED,
    EventType.PATH_ACCESS_REQUESTED,
}


@dataclass
class Event:
    type: EventType
    agent_id: str
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

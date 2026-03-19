from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.models.base import Serializable


@dataclass
class SystemEntry(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ReceivedMessage(Serializable):
    content: str
    from_id: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class AssistantText(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class SentMessage(Serializable):
    content: str
    to_ids: list[str]
    timestamp: float = field(default_factory=time.time)


@dataclass
class AssistantThinking(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ToolCall(Serializable):
    tool_name: str
    tool_call_id: str
    arguments: dict[str, Any]
    result: str | None = None
    streaming: bool = False
    timestamp: float = field(default_factory=time.time)


@dataclass
class ErrorEntry(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


HistoryEntry = (
    SystemEntry
    | ReceivedMessage
    | AssistantText
    | SentMessage
    | AssistantThinking
    | ToolCall
    | ErrorEntry
)

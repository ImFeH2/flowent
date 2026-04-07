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
    message_id: str | None = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class AssistantText(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class SentMessage(Serializable):
    content: str
    to_ids: list[str]
    message_id: str | None = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class AssistantThinking(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class StateEntry(Serializable):
    state: str
    reason: str = ""
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
    | StateEntry
    | ToolCall
    | ErrorEntry
)


def deserialize_history_entry(data: dict[str, Any]) -> HistoryEntry:
    entry_type = data.get("type")
    timestamp = data.get("timestamp")
    timestamp_value = timestamp if isinstance(timestamp, (int, float)) else time.time()

    if entry_type == "SystemEntry":
        return SystemEntry(
            content=str(data.get("content", "")),
            timestamp=timestamp_value,
        )
    if entry_type == "ReceivedMessage":
        return ReceivedMessage(
            content=str(data.get("content", "")),
            from_id=str(data.get("from_id", "")),
            message_id=(
                str(data["message_id"])
                if isinstance(data.get("message_id"), str)
                else None
            ),
            timestamp=timestamp_value,
        )
    if entry_type == "AssistantText":
        return AssistantText(
            content=str(data.get("content", "")),
            timestamp=timestamp_value,
        )
    if entry_type == "SentMessage":
        raw_to_ids = data.get("to_ids")
        to_ids = (
            [str(item) for item in raw_to_ids if isinstance(item, str)]
            if isinstance(raw_to_ids, list)
            else []
        )
        return SentMessage(
            content=str(data.get("content", "")),
            to_ids=to_ids,
            message_id=(
                str(data["message_id"])
                if isinstance(data.get("message_id"), str)
                else None
            ),
            timestamp=timestamp_value,
        )
    if entry_type == "AssistantThinking":
        return AssistantThinking(
            content=str(data.get("content", "")),
            timestamp=timestamp_value,
        )
    if entry_type == "StateEntry":
        return StateEntry(
            state=str(data.get("state", "")),
            reason=str(data.get("reason", "")),
            timestamp=timestamp_value,
        )
    if entry_type == "ToolCall":
        arguments = data.get("arguments")
        return ToolCall(
            tool_name=str(data.get("tool_name", "")),
            tool_call_id=str(data.get("tool_call_id", "")),
            arguments=arguments if isinstance(arguments, dict) else {},
            result=str(data["result"]) if isinstance(data.get("result"), str) else None,
            streaming=bool(data.get("streaming", False)),
            timestamp=timestamp_value,
        )
    if entry_type == "ErrorEntry":
        return ErrorEntry(
            content=str(data.get("content", "")),
            timestamp=timestamp_value,
        )
    raise ValueError(f"Unknown history entry type: {entry_type}")


def deserialize_history_entries(items: list[dict[str, Any]]) -> list[HistoryEntry]:
    return [deserialize_history_entry(item) for item in items]

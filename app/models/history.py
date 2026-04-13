from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.models.base import Serializable
from app.models.content import (
    ContentPart,
    content_parts_to_text,
    deserialize_content_parts,
)


@dataclass
class SystemEntry(Serializable):
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ReceivedMessage(Serializable):
    from_id: str
    parts: list[ContentPart] = field(default_factory=list)
    content: str = ""
    message_id: str | None = None
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.parts and not self.content:
            self.content = content_parts_to_text(self.parts)
        elif self.content and not self.parts:
            self.parts = deserialize_content_parts(None, fallback_text=self.content)


@dataclass
class AssistantText(Serializable):
    parts: list[ContentPart] = field(default_factory=list)
    content: str = ""
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.parts and not self.content:
            self.content = content_parts_to_text(self.parts)
        elif self.content and not self.parts:
            self.parts = deserialize_content_parts(None, fallback_text=self.content)


@dataclass
class SentMessage(Serializable):
    to_id: str
    parts: list[ContentPart] = field(default_factory=list)
    content: str = ""
    message_id: str | None = None
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.parts and not self.content:
            self.content = content_parts_to_text(self.parts)
        elif self.content and not self.parts:
            self.parts = deserialize_content_parts(None, fallback_text=self.content)


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


@dataclass
class CommandResultEntry(Serializable):
    command_name: str
    content: str
    include_in_context: bool = False
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
    | CommandResultEntry
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
        parts = deserialize_content_parts(
            data.get("parts"),
            fallback_text=str(data.get("content", "")),
        )
        return ReceivedMessage(
            from_id=str(data.get("from_id", "")),
            parts=parts,
            content=content_parts_to_text(parts),
            message_id=(
                str(data["message_id"])
                if isinstance(data.get("message_id"), str)
                else None
            ),
            timestamp=timestamp_value,
        )
    if entry_type == "AssistantText":
        parts = deserialize_content_parts(
            data.get("parts"),
            fallback_text=str(data.get("content", "")),
        )
        return AssistantText(
            parts=parts,
            content=content_parts_to_text(parts),
            timestamp=timestamp_value,
        )
    if entry_type == "SentMessage":
        parts = deserialize_content_parts(
            data.get("parts"),
            fallback_text=str(data.get("content", "")),
        )
        to_id = (
            str(data["to_id"])
            if isinstance(data.get("to_id"), str)
            else (
                str(data["to_ids"][0])
                if isinstance(data.get("to_ids"), list)
                and data["to_ids"]
                and isinstance(data["to_ids"][0], str)
                else ""
            )
        )
        return SentMessage(
            to_id=to_id,
            parts=parts,
            content=content_parts_to_text(parts),
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
    if entry_type == "CommandResultEntry":
        return CommandResultEntry(
            command_name=str(data.get("command_name", "")),
            content=str(data.get("content", "")),
            include_in_context=bool(data.get("include_in_context", False)),
            timestamp=timestamp_value,
        )
    raise ValueError(f"Unknown history entry type: {entry_type}")


def deserialize_history_entries(items: list[dict[str, Any]]) -> list[HistoryEntry]:
    return [deserialize_history_entry(item) for item in items]

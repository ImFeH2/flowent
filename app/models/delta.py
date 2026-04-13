from __future__ import annotations

from dataclasses import dataclass

from app.models.base import Serializable


@dataclass
class ContentDelta(Serializable):
    text: str


@dataclass
class ThinkingDelta(Serializable):
    text: str


@dataclass
class ToolResultDelta(Serializable):
    tool_call_id: str
    text: str


@dataclass
class SentMessageDelta(Serializable):
    message_id: str
    to_id: str
    text: str


@dataclass
class ReceivedMessageDelta(Serializable):
    message_id: str
    from_id: str
    text: str


StreamingDelta = (
    ContentDelta
    | ThinkingDelta
    | ToolResultDelta
    | SentMessageDelta
    | ReceivedMessageDelta
)

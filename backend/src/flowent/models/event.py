from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class EventType(StrEnum):
    TAB_CREATED = "tab_created"
    TAB_UPDATED = "tab_updated"
    TAB_DELETED = "tab_deleted"
    NODE_CREATED = "node_created"
    NODE_STATE_CHANGED = "node_state_changed"
    NODE_TODOS_CHANGED = "node_todos_changed"
    NODE_MESSAGE = "node_message"
    NODE_TERMINATED = "node_terminated"
    NODE_DELETED = "node_deleted"
    NODE_CONNECTED = "node_connected"
    NODE_DISCONNECTED = "node_disconnected"
    ASSISTANT_CONTENT = "assistant_content"
    TOOL_CALLED = "tool_called"
    HISTORY_CLEARED = "history_cleared"
    HISTORY_REPLACED = "history_replaced"
    HISTORY_ENTRY_ADDED = "history_entry_added"
    HISTORY_ENTRY_DELTA = "history_entry_delta"


DISPLAY_EVENTS: set[EventType] = {
    EventType.TAB_CREATED,
    EventType.TAB_UPDATED,
    EventType.TAB_DELETED,
    EventType.NODE_CREATED,
    EventType.NODE_STATE_CHANGED,
    EventType.NODE_TODOS_CHANGED,
    EventType.NODE_MESSAGE,
    EventType.NODE_TERMINATED,
    EventType.NODE_DELETED,
    EventType.NODE_CONNECTED,
    EventType.NODE_DISCONNECTED,
    EventType.ASSISTANT_CONTENT,
    EventType.TOOL_CALLED,
}


@dataclass
class Event:
    type: EventType
    agent_id: str
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

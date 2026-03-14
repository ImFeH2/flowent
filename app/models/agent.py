from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

ASSISTANT_NODE_ID = "assistant"


class NodeType(StrEnum):
    ASSISTANT = "assistant"
    AGENT = "agent"


class AgentState(StrEnum):
    INITIALIZING = "initializing"
    IDLE = "idle"
    RUNNING = "running"
    ERROR = "error"
    TERMINATED = "terminated"


@dataclass
class NodeConfig:
    node_type: NodeType
    role_name: str | None = None
    graph_id: str | None = None
    name: str | None = None
    tools: list[str] = field(default_factory=list)
    write_dirs: list[str] = field(default_factory=list)
    allow_network: bool = False

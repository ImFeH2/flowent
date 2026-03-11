from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class NodeType(StrEnum):
    STEWARD = "steward"
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
    name: str | None = None
    tools: list[str] = field(default_factory=list)
    write_dirs: list[str] = field(default_factory=list)
    allow_network: bool = False

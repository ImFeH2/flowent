from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from app.sandbox import VIRTUAL_ROOT


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


@dataclass
class AgentConfig:
    role: Role
    repo_path: Path | None = None
    worktree_path: Path | None = None
    virtual_root: Path = VIRTUAL_ROOT
    supervisor_id: str | None = None
    name: str | None = None
    network_access: bool = False

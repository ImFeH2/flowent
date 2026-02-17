from __future__ import annotations

import time
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agent import Agent

VIRTUAL_ROOT = Path("/project/")


def resolve_path(agent: Agent, logical_path: Path) -> Path:
    worktree_path = agent.config.worktree_path
    if not worktree_path:
        raise ValueError("Agent does not have a worktree configured")

    logical_path = Path(logical_path)
    worktree = Path(worktree_path)

    if not logical_path.is_absolute():
        logical_path = VIRTUAL_ROOT / logical_path

    try:
        relative = logical_path.relative_to(VIRTUAL_ROOT)
    except ValueError:
        raise PermissionError(f"Access denied: {logical_path}") from None

    real_path = (worktree / relative).resolve()

    if not real_path.is_relative_to(worktree.resolve()):
        raise PermissionError(f"Path traversal denied: {logical_path}")

    return real_path


def build_firejail_cmd(
    agent: Agent,
    command: str,
    timeout: int = 30,
) -> list[str]:
    worktree = agent.config.worktree_path
    if not worktree:
        raise ValueError("Agent does not have a worktree configured")

    virtual_root = agent.config.virtual_root
    timeout_formated = time.strftime("%H:%M:%S", time.gmtime(timeout))

    cmd = [
        "firejail",
        "--noprofile",
        "--quiet",
        "--seccomp",
        f"--bind={worktree},{virtual_root}",
        "--read-only=/",
        f"--read-write={virtual_root}",
        "--read-write=/tmp",
    ]

    if not agent.config.network_access:
        cmd.append("--net=none")

    cmd.extend(
        [
            f"--timeout={timeout_formated}",
            "bash",
            "-c",
            command,
        ]
    )

    return cmd

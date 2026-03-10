from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.sandbox import is_path_writable

if TYPE_CHECKING:
    from app.agent import Agent


def authorize(tool_name: str, agent: Agent, args: dict[str, Any]) -> str | None:
    if tool_name == "edit":
        write_dirs = agent.config.write_dirs
        if not write_dirs:
            return "Write access is disabled for this agent"
        path = args.get("path")
        if isinstance(path, str) and not is_path_writable(path, write_dirs):
            return f"Path not in write_dirs: {path}"
        return None

    if tool_name == "fetch" and not agent.config.allow_network:
        return "Network access is disabled for this agent"

    return None

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from flowent.sandbox import is_path_writable

if TYPE_CHECKING:
    from flowent.agent import Agent


def authorize(tool_name: str, agent: Agent, args: dict[str, Any]) -> str | None:
    if tool_name.startswith("mcp__"):
        from flowent.mcp_service import mcp_service
        from flowent.settings import find_mcp_server, get_settings

        descriptor = mcp_service.get_dynamic_tool_descriptor(tool_name)
        if descriptor is None:
            return f"MCP tool not found: {tool_name}"
        server = find_mcp_server(get_settings(), descriptor.server_name)
        if (
            server is not None
            and server.transport == "streamable_http"
            and not agent.config.allow_network
        ):
            return "Network access is disabled for this agent"
        if descriptor.open_world_hint and not agent.config.allow_network:
            return "Network access is disabled for this agent"
        return None

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

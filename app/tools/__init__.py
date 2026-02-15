from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from app.models import Permissions, Role

if TYPE_CHECKING:
    from typing import ClassVar

    from app.agent import Agent


class Tool(ABC):
    name: str
    description: str
    parameters: ClassVar[dict[str, Any]]

    @abstractmethod
    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str: ...

    def to_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


_CONTROLLED_TOOLS: dict[str, str] = {
    "read_file": "read",
    "write_file": "write",
    "execute_command": "command",
    "network_request": "network",
}


def is_tool_available(perms: Permissions, tool_name: str) -> bool:
    kind = _CONTROLLED_TOOLS.get(tool_name)
    if kind is None:
        return True
    if kind == "read":
        return len(perms.allowed_paths) > 0
    if kind == "write":
        return len(perms.writable_paths) > 0
    if kind == "command":
        return len(perms.allowed_commands) > 0
    if kind == "network":
        return perms.network_access
    return False


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def get_tools_for_agent(self, agent: Agent) -> list[Tool]:
        perms = agent.config.permissions
        return [
            tool for tool in self._tools.values() if is_tool_available(perms, tool.name)
        ]

    def get_tools_schema(self, agent: Agent) -> list[dict[str, Any]]:
        return [t.to_schema() for t in self.get_tools_for_agent(agent)]


def default_permissions(role: Role) -> Permissions:
    if role == Role.STEWARD:
        return Permissions()
    if role == Role.SUPERVISOR:
        return Permissions()
    return Permissions()


def build_tool_registry() -> ToolRegistry:
    from app.tools.agent_mgmt import (
        ExitTool,
        ListAgentsTool,
        SetStatusTool,
        SpawnAgentTool,
        UpdateChildPermissionsTool,
    )
    from app.tools.filesystem import ReadFileTool, WriteFileTool
    from app.tools.git_tools import MergeBranchTool
    from app.tools.memory import EditMemoryTool
    from app.tools.messaging import IdleTool, SendMessageTool
    from app.tools.path_access import RequestPathAccessTool
    from app.tools.system import ExecuteCommandTool, NetworkRequestTool
    from app.tools.testing import SubmitResultTool

    reg = ToolRegistry()
    for tool_cls in [
        SendMessageTool,
        IdleTool,
        SpawnAgentTool,
        ListAgentsTool,
        ExitTool,
        SetStatusTool,
        UpdateChildPermissionsTool,
        EditMemoryTool,
        SubmitResultTool,
        MergeBranchTool,
        ReadFileTool,
        WriteFileTool,
        ExecuteCommandTool,
        NetworkRequestTool,
        RequestPathAccessTool,
    ]:
        reg.register(tool_cls())  # type: ignore[abstract]
    return reg

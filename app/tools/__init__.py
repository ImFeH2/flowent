from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

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


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def get_tools_for_agent(self, agent: Agent) -> list[Tool]:
        allowed = set(agent.config.tools)
        if not allowed:
            return list(self._tools.values())
        return [t for t in self._tools.values() if t.name in allowed]

    def get_tools_schema(self, agent: Agent) -> list[dict[str, Any]]:
        return [t.to_schema() for t in self.get_tools_for_agent(agent)]


def build_tool_registry() -> ToolRegistry:
    from app.tools.connect import ConnectTool
    from app.tools.edit import EditTool
    from app.tools.exec import ExecTool
    from app.tools.exit import ExitTool
    from app.tools.fetch import FetchTool
    from app.tools.idle import IdleTool
    from app.tools.list_connections import ListConnectionsTool
    from app.tools.list_roles import ListRolesTool
    from app.tools.read import ReadTool
    from app.tools.send import SendTool
    from app.tools.spawn import SpawnTool
    from app.tools.todo import TodoTool

    reg = ToolRegistry()
    for tool_cls in [
        SpawnTool,
        SendTool,
        ConnectTool,
        ListConnectionsTool,
        ListRolesTool,
        ReadTool,
        EditTool,
        ExecTool,
        FetchTool,
        TodoTool,
        IdleTool,
        ExitTool,
    ]:
        reg.register(tool_cls())  # type: ignore[abstract]
    return reg

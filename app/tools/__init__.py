from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from typing import ClassVar

    from app.agent import Agent

MINIMUM_TOOLS = (
    "idle",
    "sleep",
    "todo",
    "contacts",
)


class Tool(ABC):
    name: str
    description: str
    parameters: ClassVar[dict[str, Any]]
    agent_visible: ClassVar[bool] = True
    llm_visible: ClassVar[bool] = True

    @abstractmethod
    def execute(
        self, agent: Agent, args: dict[str, Any], **kwargs: Any
    ) -> str | None: ...

    def to_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def re_raise_interrupt(agent: Agent, exc: BaseException) -> None:
    from app.agent import InterruptRequestedError

    if isinstance(exc, InterruptRequestedError) or agent.is_interrupt_requested():
        raise InterruptRequestedError() from exc


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list_tools(self, *, agent_visible_only: bool = False) -> list[Tool]:
        tools = list(self._tools.values())
        if not agent_visible_only:
            return tools
        return [tool for tool in tools if tool.agent_visible]

    def get_tools_for_agent(self, agent: Agent) -> list[Tool]:
        allowed = set(agent.config.tools) | set(MINIMUM_TOOLS)
        return [t for t in self.list_tools() if t.name in allowed and t.llm_visible]

    def get_tools_schema(self, agent: Agent) -> list[dict[str, Any]]:
        return [t.to_schema() for t in self.get_tools_for_agent(agent)]


def build_tool_registry() -> ToolRegistry:
    from app.tools.connect import ConnectTool
    from app.tools.contacts import ContactsTool
    from app.tools.create_agent import CreateAgentTool
    from app.tools.create_tab import CreateTabTool
    from app.tools.delete_tab import DeleteTabTool
    from app.tools.edit import EditTool
    from app.tools.exec import ExecTool
    from app.tools.fetch import FetchTool
    from app.tools.idle import IdleTool
    from app.tools.list_roles import ListRolesTool
    from app.tools.list_tabs import ListTabsTool
    from app.tools.list_tools import ListToolsTool
    from app.tools.manage_prompts import ManagePromptsTool
    from app.tools.manage_providers import ManageProvidersTool
    from app.tools.manage_roles import ManageRolesTool
    from app.tools.manage_settings import ManageSettingsTool
    from app.tools.read import ReadTool
    from app.tools.sleep import SleepTool
    from app.tools.todo import TodoTool

    reg = ToolRegistry()
    for tool_cls in [
        IdleTool,
        SleepTool,
        TodoTool,
        ContactsTool,
        CreateTabTool,
        DeleteTabTool,
        CreateAgentTool,
        ConnectTool,
        ManageProvidersTool,
        ManageRolesTool,
        ManageSettingsTool,
        ManagePromptsTool,
        ReadTool,
        EditTool,
        ExecTool,
        FetchTool,
        ListRolesTool,
        ListTabsTool,
        ListToolsTool,
    ]:
        reg.register(tool_cls())  # type: ignore[abstract]
    return reg


def list_agent_visible_tool_descriptors() -> list[dict[str, Any]]:
    registry = build_tool_registry()
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        }
        for tool in registry.list_tools(agent_visible_only=True)
    ]

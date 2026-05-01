from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from typing import ClassVar

    from flowent_api.agent import Agent

MINIMUM_TOOLS = (
    "idle",
    "sleep",
    "todo",
    "contacts",
    "send",
)

MCP_BROWSING_TOOLS = (
    "list_mcp_resources",
    "list_mcp_resource_templates",
    "read_mcp_resource",
    "list_mcp_prompts",
    "get_mcp_prompt",
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
    from flowent_api.agent import InterruptRequestedError

    if isinstance(exc, InterruptRequestedError) or agent.is_interrupt_requested():
        raise InterruptRequestedError() from exc


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        tool = self._tools.get(name)
        if tool is not None:
            return tool
        from flowent_api.mcp_service import mcp_service
        from flowent_api.tools.mcp import DynamicMCPTool

        descriptor = mcp_service.get_dynamic_tool_descriptor(name)
        if descriptor is None:
            return None
        return DynamicMCPTool(descriptor=descriptor)

    def list_tools(self, *, agent_visible_only: bool = False) -> list[Tool]:
        tools = list(self._tools.values())
        from flowent_api.mcp_service import mcp_service
        from flowent_api.tools.mcp import DynamicMCPTool

        dynamic_tools = [
            DynamicMCPTool(descriptor=descriptor)
            for descriptor in mcp_service.list_discovered_tools()
        ]
        tools.extend(dynamic_tools)
        if not agent_visible_only:
            return tools
        return [tool for tool in tools if tool.agent_visible]

    def get_tools_for_agent(self, agent: Agent) -> list[Tool]:
        from flowent_api.mcp_service import mcp_service
        from flowent_api.settings import find_role, get_settings
        from flowent_api.tools.mcp import DynamicMCPTool

        allowed = set(agent.config.tools) | set(MINIMUM_TOOLS)
        visible_tools = [
            t for t in self._tools.values() if t.name in allowed and t.llm_visible
        ]
        role = find_role(get_settings(), agent.config.role_name or "")
        excluded = set(role.excluded_tools) if role is not None else set()
        dynamic_tools = [
            DynamicMCPTool(descriptor=descriptor)
            for descriptor in mcp_service.list_agent_dynamic_tools(agent)
            if descriptor.fully_qualified_id in allowed
            and descriptor.fully_qualified_id not in excluded
        ]
        return [*visible_tools, *dynamic_tools]

    def get_tools_schema(self, agent: Agent) -> list[dict[str, Any]]:
        return [t.to_schema() for t in self.get_tools_for_agent(agent)]


def build_tool_registry() -> ToolRegistry:
    from flowent_api.tools.connect import ConnectTool
    from flowent_api.tools.contacts import ContactsTool
    from flowent_api.tools.create_agent import CreateAgentTool
    from flowent_api.tools.create_tab import CreateTabTool
    from flowent_api.tools.delete_tab import DeleteTabTool
    from flowent_api.tools.edit import EditTool
    from flowent_api.tools.exec import ExecTool
    from flowent_api.tools.fetch import FetchTool
    from flowent_api.tools.idle import IdleTool
    from flowent_api.tools.list_roles import ListRolesTool
    from flowent_api.tools.list_tabs import ListTabsTool
    from flowent_api.tools.list_tools import ListToolsTool
    from flowent_api.tools.manage_prompts import ManagePromptsTool
    from flowent_api.tools.manage_providers import ManageProvidersTool
    from flowent_api.tools.manage_roles import ManageRolesTool
    from flowent_api.tools.manage_settings import ManageSettingsTool
    from flowent_api.tools.mcp import (
        GetMCPPromptTool,
        ListMCPPromptsTool,
        ListMCPResourcesTool,
        ListMCPResourceTemplatesTool,
        ReadMCPResourceTool,
    )
    from flowent_api.tools.read import ReadTool
    from flowent_api.tools.send import SendTool
    from flowent_api.tools.set_permissions import SetPermissionsTool
    from flowent_api.tools.sleep import SleepTool
    from flowent_api.tools.todo import TodoTool

    reg = ToolRegistry()
    for tool_cls in [
        IdleTool,
        SleepTool,
        TodoTool,
        ContactsTool,
        SendTool,
        CreateTabTool,
        DeleteTabTool,
        SetPermissionsTool,
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
        ListMCPResourcesTool,
        ListMCPResourceTemplatesTool,
        ReadMCPResourceTool,
        ListMCPPromptsTool,
        GetMCPPromptTool,
    ]:
        reg.register(tool_cls())  # type: ignore[abstract]
    return reg


def list_agent_visible_tool_descriptors() -> list[dict[str, Any]]:
    registry = build_tool_registry()
    from flowent_api.mcp_service import mcp_service

    descriptors: list[dict[str, Any]] = []
    for tool in registry.list_tools(agent_visible_only=True):
        if tool.name.startswith("mcp__"):
            continue
        schema = tool.to_schema()
        function = schema.get("function")
        parameters = (
            function.get("parameters")
            if isinstance(function, dict)
            else {"type": "object", "properties": {}, "required": []}
        )
        descriptors.append(
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": parameters,
                "source": "builtin",
            }
        )
    descriptors.extend(mcp_service.list_discovered_tool_descriptors())
    return descriptors

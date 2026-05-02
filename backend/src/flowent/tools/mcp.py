from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from flowent.mcp_service import MCPToolDescriptor, mcp_service
from flowent.tools import Tool

if TYPE_CHECKING:
    from flowent.agent import Agent


class DynamicMCPTool(Tool):
    agent_visible = True
    llm_visible = True
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def __init__(self, descriptor: MCPToolDescriptor) -> None:
        self._descriptor = descriptor
        self.name = descriptor.fully_qualified_id
        self.description = descriptor.description or f"MCP tool {descriptor.tool_name}"
        self._parameters = descriptor.input_schema or {
            "type": "object",
            "properties": {},
            "required": [],
        }

    def to_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self._parameters,
            },
        }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        result = mcp_service.call_agent_tool(
            agent,
            fully_qualified_id=self._descriptor.fully_qualified_id,
            arguments=args,
        )
        return json.dumps(result, ensure_ascii=False)


class ListMCPResourcesTool(Tool):
    name = "list_mcp_resources"
    description = "List MCP resources visible in the current execution boundary."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Optional globally available MCP server name filter",
            }
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        server_name = args.get("server_name")
        resources = mcp_service.list_agent_resources(
            agent,
            server_name=server_name
            if isinstance(server_name, str) and server_name.strip()
            else None,
        )
        return json.dumps(resources, ensure_ascii=False)


class ListMCPResourceTemplatesTool(Tool):
    name = "list_mcp_resource_templates"
    description = (
        "List MCP resource templates visible in the current execution boundary."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Optional globally available MCP server name filter",
            }
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        server_name = args.get("server_name")
        templates = mcp_service.list_agent_resource_templates(
            agent,
            server_name=server_name
            if isinstance(server_name, str) and server_name.strip()
            else None,
        )
        return json.dumps(templates, ensure_ascii=False)


class ReadMCPResourceTool(Tool):
    name = "read_mcp_resource"
    description = "Read an MCP resource from a globally available server."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Globally available MCP server name",
            },
            "uri": {
                "type": "string",
                "description": "Target MCP resource URI",
            },
        },
        "required": ["server_name", "uri"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        server_name = args.get("server_name")
        uri = args.get("uri")
        if not isinstance(server_name, str) or not server_name.strip():
            return json.dumps({"error": "server_name is required"})
        if not isinstance(uri, str) or not uri.strip():
            return json.dumps({"error": "uri is required"})
        result = mcp_service.read_agent_resource(
            agent,
            server_name=server_name.strip(),
            uri=uri.strip(),
        )
        return json.dumps(result, ensure_ascii=False)


class ListMCPPromptsTool(Tool):
    name = "list_mcp_prompts"
    description = "List MCP prompts visible in the current execution boundary."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Optional globally available MCP server name filter",
            }
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        server_name = args.get("server_name")
        prompts = mcp_service.list_agent_prompts(
            agent,
            server_name=server_name
            if isinstance(server_name, str) and server_name.strip()
            else None,
        )
        return json.dumps(prompts, ensure_ascii=False)


class GetMCPPromptTool(Tool):
    name = "get_mcp_prompt"
    description = "Get an MCP prompt from a globally available server."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "server_name": {
                "type": "string",
                "description": "Globally available MCP server name",
            },
            "name": {
                "type": "string",
                "description": "Prompt name",
            },
            "arguments": {
                "type": "object",
                "description": "Optional prompt arguments",
            },
        },
        "required": ["server_name", "name"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        server_name = args.get("server_name")
        name = args.get("name")
        arguments = args.get("arguments")
        if not isinstance(server_name, str) or not server_name.strip():
            return json.dumps({"error": "server_name is required"})
        if not isinstance(name, str) or not name.strip():
            return json.dumps({"error": "name is required"})
        if arguments is not None and not isinstance(arguments, dict):
            return json.dumps({"error": "arguments must be an object"})
        result = mcp_service.get_agent_prompt(
            agent,
            server_name=server_name.strip(),
            name=name.strip(),
            arguments=arguments if isinstance(arguments, dict) else None,
        )
        return json.dumps(result, ensure_ascii=False)

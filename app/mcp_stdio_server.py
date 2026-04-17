from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from typing import Any

from app.mcp_service import PROTOCOL_VERSION, mcp_service
from app.runtime import bootstrap_runtime, shutdown_runtime


@dataclass(frozen=True)
class PromptDefinition:
    name: str
    description: str
    arguments: list[dict[str, object]]


PROMPTS = {
    "send_assistant_message": PromptDefinition(
        name="send_assistant_message",
        description="Template for sending a structured message to the Assistant.",
        arguments=[
            {
                "name": "task",
                "description": "The task or request to send to the Assistant",
                "required": True,
            }
        ],
    ),
    "delegate_tab_task": PromptDefinition(
        name="delegate_tab_task",
        description="Template for dispatching a concrete task into a specific tab.",
        arguments=[
            {
                "name": "tab_id",
                "description": "Target tab id",
                "required": True,
            },
            {
                "name": "task",
                "description": "Task to send into that tab",
                "required": True,
            },
        ],
    ),
}

_NEXT_SERVER_REQUEST_ID = 100000
_CLIENT_SUPPORTS_ELICITATION = False
_BUFFERED_CLIENT_MESSAGES: list[dict[str, object]] = []


def _send(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _success(request_id: object, result: dict[str, object]) -> None:
    _send({"jsonrpc": "2.0", "id": request_id, "result": result})


def _error(request_id: object, message: str, code: int = -32000) -> None:
    _send(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }
    )


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _next_server_request_id() -> int:
    global _NEXT_SERVER_REQUEST_ID
    _NEXT_SERVER_REQUEST_ID += 1
    return _NEXT_SERVER_REQUEST_ID


def _request_confirmation(message: str) -> bool:
    if not _CLIENT_SUPPORTS_ELICITATION:
        return False
    request_id = _next_server_request_id()
    _send(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "elicitation/create",
            "params": {
                "message": message,
                "requestedSchema": {
                    "type": "object",
                    "properties": {
                        "confirm": {
                            "type": "boolean",
                            "title": "Confirm",
                            "description": "Approve this action",
                            "default": False,
                        }
                    },
                    "required": ["confirm"],
                },
            },
        }
    )
    while True:
        response = _read_next_message()
        if response is None:
            return False
        if response.get("id") != request_id:
            _BUFFERED_CLIENT_MESSAGES.append(response)
            continue
        result = response.get("result")
        if not isinstance(result, dict):
            return False
        if result.get("action") != "accept":
            return False
        content = result.get("content")
        return isinstance(content, dict) and content.get("confirm") is True


def _read_next_message() -> dict[str, object] | None:
    if _BUFFERED_CLIENT_MESSAGES:
        return _BUFFERED_CLIENT_MESSAGES.pop(0)
    while True:
        raw_line = sys.stdin.readline()
        if not raw_line:
            return None
        line = raw_line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(message, dict):
            return message


def _resource_descriptors() -> list[dict[str, object]]:
    tabs = asyncio.run(_list_tabs())
    raw_tabs = tabs.get("tabs")
    tab_entries: list[object] = raw_tabs if isinstance(raw_tabs, list) else []
    resources: list[dict[str, object]] = [
        {
            "uri": "autopoe://assistant",
            "name": "Assistant Snapshot",
            "mimeType": "application/json",
            "description": "Current Assistant snapshot",
        },
        {
            "uri": "autopoe://tabs",
            "name": "Tabs",
            "mimeType": "application/json",
            "description": "All task tabs",
        },
        {
            "uri": "autopoe://stats/summary",
            "name": "Stats Summary",
            "mimeType": "application/json",
            "description": "Current stats payload",
        },
        {
            "uri": "autopoe://mcp/server",
            "name": "Autopoe MCP Server Summary",
            "mimeType": "application/json",
            "description": "Current Autopoe MCP server summary",
        },
    ]
    for tab in tab_entries:
        if not isinstance(tab, dict):
            continue
        tab_id = tab.get("id")
        if not isinstance(tab_id, str):
            continue
        resources.append(
            {
                "uri": f"autopoe://tabs/{tab_id}",
                "name": f"Tab {tab_id[:8]}",
                "mimeType": "application/json",
                "description": "Tab detail",
            }
        )
        resources.append(
            {
                "uri": f"autopoe://tabs/{tab_id}/graph",
                "name": f"Tab {tab_id[:8]} Graph",
                "mimeType": "application/json",
                "description": "Tab graph snapshot",
            }
        )
        detail = asyncio.run(_get_tab(tab_id))
        raw_nodes = detail.get("nodes")
        node_entries: list[object] = raw_nodes if isinstance(raw_nodes, list) else []
        for node in node_entries:
            if not isinstance(node, dict):
                continue
            node_id = node.get("id")
            if not isinstance(node_id, str):
                continue
            resources.append(
                {
                    "uri": f"autopoe://nodes/{node_id}",
                    "name": f"Node {node_id[:8]}",
                    "mimeType": "application/json",
                    "description": "Node detail",
                }
            )
            resources.append(
                {
                    "uri": f"autopoe://nodes/{node_id}/history",
                    "name": f"Node {node_id[:8]} History",
                    "mimeType": "application/json",
                    "description": "Node history",
                }
            )
    return resources


async def _list_tabs() -> dict[str, object]:
    from app.routes.tabs import list_tabs

    return await list_tabs()


async def _get_tab(tab_id: str) -> dict[str, object]:
    from app.routes.tabs import get_tab

    return await get_tab(tab_id)


async def _get_assistant() -> dict[str, object]:
    from app.routes.assistant import get_assistant

    return await get_assistant()


async def _get_node(node_id: str) -> dict[str, object]:
    from app.routes.nodes import get_node

    return await get_node(node_id)


async def _get_stats() -> dict[str, object]:
    from app.routes.stats import get_stats

    return await get_stats(range="24h")


async def _create_tab(arguments: dict[str, Any]) -> dict[str, object]:
    from app.routes.tabs import CreateTabRequest, create_tab_route

    return await create_tab_route(CreateTabRequest(**arguments))


async def _delete_tab(tab_id: str) -> dict[str, object]:
    from app.routes.tabs import delete_tab_route

    return await delete_tab_route(tab_id)


async def _create_tab_node(tab_id: str, arguments: dict[str, Any]) -> dict[str, object]:
    from pathlib import Path

    from app.graph_service import get_tab_leader_id
    from app.routes.tabs import CreateTabNodeRequest, create_tab_node
    from app.workspace_store import workspace_store

    leader_id = get_tab_leader_id(tab_id)
    if not leader_id:
        raise RuntimeError(f"Tab '{tab_id}' does not have a bound Leader")
    leader_record = workspace_store.get_node_record(leader_id)
    if leader_record is None:
        raise RuntimeError(f"Leader '{leader_id}' not found")
    requested_allow_network = bool(arguments.get("allow_network", False))
    if requested_allow_network and not leader_record.config.allow_network:
        raise RuntimeError(
            "allow_network boundary exceeded: tab Leader disallows network access"
        )
    requested_write_dirs = (
        [str(item) for item in arguments.get("write_dirs", []) if isinstance(item, str)]
        if isinstance(arguments.get("write_dirs"), list)
        else []
    )
    leader_write_dirs = [
        Path(path).resolve() for path in leader_record.config.write_dirs
    ]
    invalid_write_dirs = sorted(
        path
        for path in requested_write_dirs
        if not any(
            Path(path).resolve().is_relative_to(parent) for parent in leader_write_dirs
        )
    )
    if invalid_write_dirs:
        raise RuntimeError(
            "write_dirs boundary exceeded: " + ", ".join(invalid_write_dirs)
        )
    return await create_tab_node(tab_id, CreateTabNodeRequest(**arguments))


async def _create_tab_edge(tab_id: str, arguments: dict[str, Any]) -> dict[str, object]:
    from app.routes.tabs import CreateTabEdgeRequest, create_tab_edge

    return await create_tab_edge(tab_id, CreateTabEdgeRequest(**arguments))


async def _send_assistant_message(arguments: dict[str, Any]) -> dict[str, object]:
    from app.routes.assistant import AssistantMessageRequest, send_assistant_message

    return await send_assistant_message(AssistantMessageRequest(**arguments))


async def _retry_assistant_message(message_id: str) -> dict[str, object]:
    from app.routes.assistant import retry_assistant_message

    response = await retry_assistant_message(message_id)
    return response.model_dump()


async def _dispatch_node_message(
    node_id: str, arguments: dict[str, Any]
) -> dict[str, object]:
    from app.routes.nodes import DispatchNodeMessageRequest, dispatch_node_message

    return await dispatch_node_message(node_id, DispatchNodeMessageRequest(**arguments))


async def _interrupt_node(node_id: str) -> dict[str, object]:
    from app.routes.nodes import interrupt_node

    return await interrupt_node(node_id)


async def _retry_node_message(node_id: str, message_id: str) -> dict[str, object]:
    from app.routes.nodes import retry_node_message

    return await retry_node_message(node_id, message_id)


def _set_tab_permissions(arguments: dict[str, Any]) -> dict[str, object]:
    from app.tools.set_permissions import SetPermissionsTool

    result = SetPermissionsTool().execute(_build_control_agent(), arguments)
    parsed = json.loads(result)
    if isinstance(parsed, dict) and parsed.get("error"):
        raise RuntimeError(str(parsed["error"]))
    if not isinstance(parsed, dict):
        raise RuntimeError("Failed to update permissions")
    return parsed


def _set_tab_mount(arguments: dict[str, Any]) -> dict[str, object]:
    return mcp_service.set_tab_mount(
        server_name=str(arguments.get("server_name", "")),
        tab_id=str(arguments.get("tab_id", "")),
        mounted=bool(arguments.get("mounted")),
    )


def _build_control_agent():
    from app.agent import Agent
    from app.models import NodeConfig, NodeType
    from app.settings import get_settings
    from app.tools import MINIMUM_TOOLS

    settings = get_settings()
    return Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name=settings.assistant.role_name,
            name="Assistant",
            tools=[
                *MINIMUM_TOOLS,
                "create_tab",
                "delete_tab",
                "set_permissions",
            ],
            write_dirs=list(settings.assistant.write_dirs),
            allow_network=settings.assistant.allow_network,
        )
    )


def _sanitize_history_entries(
    entries: list[dict[str, object]],
) -> list[dict[str, object]]:
    sanitized: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_type = entry.get("type")
        if entry_type == "SystemEntry":
            continue
        next_entry = {
            key: value
            for key, value in entry.items()
            if key not in {"arguments", "result"}
        }
        sanitized.append(next_entry)
    return sanitized


def _sanitize_node_detail(detail: dict[str, object]) -> dict[str, object]:
    return {
        "id": detail.get("id"),
        "node_type": detail.get("node_type"),
        "tab_id": detail.get("tab_id"),
        "role_name": detail.get("role_name"),
        "is_leader": detail.get("is_leader"),
        "state": detail.get("state"),
        "contacts": detail.get("contacts"),
        "connections": detail.get("connections"),
        "name": detail.get("name"),
        "todos": detail.get("todos"),
        "capabilities": detail.get("capabilities"),
        "position": detail.get("position"),
    }


def _sanitize_stats_summary(payload: dict[str, object]) -> dict[str, object]:
    tabs = payload.get("tabs")
    nodes = payload.get("nodes")
    requests = payload.get("requests")
    compacts = payload.get("compacts")
    mcp_servers = payload.get("mcp_servers")
    mcp_activity = payload.get("mcp_activity")
    mcp_server_statuses: list[dict[str, object]] = []
    if isinstance(mcp_servers, list):
        for record in mcp_servers:
            if not isinstance(record, dict):
                continue
            config = record.get("config")
            snapshot = record.get("snapshot")
            if not isinstance(config, dict) or not isinstance(snapshot, dict):
                continue
            mcp_server_statuses.append(
                {
                    "name": config.get("name"),
                    "transport": config.get("transport"),
                    "status": snapshot.get("status"),
                    "auth_status": snapshot.get("auth_status"),
                }
            )
    return {
        "requested_at": payload.get("requested_at"),
        "range": payload.get("range"),
        "tab_count": len(tabs) if isinstance(tabs, list) else 0,
        "node_count": len(nodes) if isinstance(nodes, list) else 0,
        "request_count": len(requests) if isinstance(requests, list) else 0,
        "compact_count": len(compacts) if isinstance(compacts, list) else 0,
        "mcp_server_statuses": mcp_server_statuses,
        "mcp_activity_count": len(mcp_activity)
        if isinstance(mcp_activity, list)
        else 0,
    }


def _tool_descriptors() -> list[dict[str, object]]:
    return [
        {
            "name": "create_tab",
            "description": "Create a new task tab.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "goal": {"type": "string"},
                    "allow_network": {"type": "boolean"},
                    "write_dirs": {"type": "array", "items": {"type": "string"}},
                    "mcp_servers": {"type": "array", "items": {"type": "string"}},
                    "blueprint_id": {"type": "string"},
                },
                "required": ["title"],
            },
        },
        {
            "name": "delete_tab",
            "description": "Delete an existing task tab.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string"},
                    "confirm": {"type": "boolean"},
                },
                "required": ["tab_id", "confirm"],
            },
            "annotations": {"destructiveHint": True},
        },
        {
            "name": "create_tab_node",
            "description": "Create a regular node inside a tab.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string"},
                    "role_name": {"type": "string"},
                    "name": {"type": "string"},
                    "tools": {"type": "array", "items": {"type": "string"}},
                    "write_dirs": {"type": "array", "items": {"type": "string"}},
                    "allow_network": {"type": "boolean"},
                },
                "required": ["tab_id", "role_name"],
            },
        },
        {
            "name": "create_tab_edge",
            "description": "Create a graph edge between two nodes in a tab.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string"},
                    "from_node_id": {"type": "string"},
                    "to_node_id": {"type": "string"},
                },
                "required": ["tab_id", "from_node_id", "to_node_id"],
            },
        },
        {
            "name": "send_assistant_message",
            "description": "Send a message to the Assistant.",
            "inputSchema": {
                "type": "object",
                "properties": {"content": {"type": "string"}},
                "required": ["content"],
            },
        },
        {
            "name": "retry_assistant_message",
            "description": "Retry a previously submitted Assistant human message.",
            "inputSchema": {
                "type": "object",
                "properties": {"message_id": {"type": "string"}},
                "required": ["message_id"],
            },
        },
        {
            "name": "send_node_message",
            "description": "Send a message to a specific node.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string"},
                    "content": {"type": "string"},
                    "from_id": {"type": "string"},
                },
                "required": ["node_id", "content"],
            },
        },
        {
            "name": "interrupt_node",
            "description": "Interrupt a running or sleeping node.",
            "inputSchema": {
                "type": "object",
                "properties": {"node_id": {"type": "string"}},
                "required": ["node_id"],
            },
        },
        {
            "name": "retry_node_message",
            "description": "Retry a previously received node message.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string"},
                    "message_id": {"type": "string"},
                },
                "required": ["node_id", "message_id"],
            },
        },
        {
            "name": "set_tab_permissions",
            "description": "Patch a tab permission boundary.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string"},
                    "allow_network": {"type": "boolean"},
                    "write_dirs": {"type": "array", "items": {"type": "string"}},
                    "confirm": {"type": "boolean"},
                },
                "required": ["tab_id", "confirm"],
            },
            "annotations": {"destructiveHint": True},
        },
        {
            "name": "mount_tab_mcp_server",
            "description": "Mount or unmount an MCP server on a tab.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string"},
                    "server_name": {"type": "string"},
                    "mounted": {"type": "boolean"},
                    "confirm": {"type": "boolean"},
                },
                "required": ["tab_id", "server_name", "mounted", "confirm"],
            },
            "annotations": {"destructiveHint": True},
        },
    ]


def _prompt_messages(name: str, arguments: dict[str, Any]) -> list[dict[str, object]]:
    if name == "send_assistant_message":
        task = str(arguments.get("task", "")).strip()
        return [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": f"Send this task to the Assistant:\n\n{task}",
                },
            }
        ]
    if name == "delegate_tab_task":
        tab_id = str(arguments.get("tab_id", "")).strip()
        task = str(arguments.get("task", "")).strip()
        return [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": f"Send this task to tab {tab_id}:\n\n{task}",
                },
            }
        ]
    raise RuntimeError(f"Unknown prompt '{name}'")


def _read_resource(uri: str) -> dict[str, object]:
    if uri == "autopoe://assistant":
        payload = asyncio.run(_get_assistant())
    elif uri == "autopoe://tabs":
        payload = asyncio.run(_list_tabs())
    elif uri == "autopoe://stats/summary":
        payload = _sanitize_stats_summary(asyncio.run(_get_stats()))
    elif uri == "autopoe://mcp/server":
        payload = mcp_service.get_autopoe_server_summary()
    elif uri.startswith("autopoe://tabs/") and uri.endswith("/graph"):
        tab_id = uri.removeprefix("autopoe://tabs/").removesuffix("/graph")
        detail = asyncio.run(_get_tab(tab_id))
        payload = {
            "tab": detail.get("tab"),
            "nodes": detail.get("nodes"),
            "edges": detail.get("edges"),
        }
    elif uri.startswith("autopoe://tabs/"):
        tab_id = uri.removeprefix("autopoe://tabs/")
        payload = asyncio.run(_get_tab(tab_id))
    elif uri.startswith("autopoe://nodes/") and uri.endswith("/history"):
        node_id = uri.removeprefix("autopoe://nodes/").removesuffix("/history")
        detail = asyncio.run(_get_node(node_id))
        raw_history = detail.get("history")
        history_entries = (
            [item for item in raw_history if isinstance(item, dict)]
            if isinstance(raw_history, list)
            else []
        )
        payload = {
            "id": node_id,
            "history": _sanitize_history_entries(history_entries),
        }
    elif uri.startswith("autopoe://nodes/"):
        node_id = uri.removeprefix("autopoe://nodes/")
        payload = _sanitize_node_detail(asyncio.run(_get_node(node_id)))
    else:
        raise RuntimeError(f"Unknown resource URI '{uri}'")
    return {
        "contents": [
            {
                "uri": uri,
                "mimeType": "application/json",
                "text": _json_text(payload),
            }
        ]
    }


def _call_tool(name: str, arguments: dict[str, Any]) -> dict[str, object]:
    if name == "create_tab":
        from app.tools.create_tab import CreateTabTool

        parsed = json.loads(CreateTabTool().execute(_build_control_agent(), arguments))
        if isinstance(parsed, dict) and parsed.get("error"):
            raise RuntimeError(str(parsed["error"]))
        result = parsed
    elif name == "delete_tab":
        if arguments.get("confirm") is not True and not _request_confirmation(
            f"Delete tab {arguments.get('tab_id', '')}?"
        ):
            raise RuntimeError("Delete tab was not confirmed")
        from app.tools.delete_tab import DeleteTabTool

        parsed = json.loads(
            DeleteTabTool().execute(
                _build_control_agent(),
                {"tab_id": str(arguments.get("tab_id", ""))},
            )
        )
        if isinstance(parsed, dict) and parsed.get("error"):
            raise RuntimeError(str(parsed["error"]))
        result = parsed
    elif name == "create_tab_node":
        result = asyncio.run(
            _create_tab_node(
                str(arguments.get("tab_id", "")),
                {
                    "role_name": arguments.get("role_name"),
                    "name": arguments.get("name"),
                    "tools": arguments.get("tools", []),
                    "write_dirs": arguments.get("write_dirs", []),
                    "allow_network": arguments.get("allow_network", False),
                },
            )
        )
    elif name == "create_tab_edge":
        result = asyncio.run(
            _create_tab_edge(
                str(arguments.get("tab_id", "")),
                {
                    "from_node_id": arguments.get("from_node_id"),
                    "to_node_id": arguments.get("to_node_id"),
                },
            )
        )
    elif name == "send_assistant_message":
        result = asyncio.run(
            _send_assistant_message({"content": arguments.get("content")})
        )
    elif name == "retry_assistant_message":
        result = asyncio.run(
            _retry_assistant_message(str(arguments.get("message_id", "")))
        )
    elif name == "send_node_message":
        result = asyncio.run(
            _dispatch_node_message(
                str(arguments.get("node_id", "")),
                {
                    "content": arguments.get("content"),
                    "from_id": arguments.get("from_id", "human"),
                },
            )
        )
    elif name == "interrupt_node":
        result = asyncio.run(_interrupt_node(str(arguments.get("node_id", ""))))
    elif name == "retry_node_message":
        result = asyncio.run(
            _retry_node_message(
                str(arguments.get("node_id", "")),
                str(arguments.get("message_id", "")),
            )
        )
    elif name == "set_tab_permissions":
        if arguments.get("confirm") is not True and not _request_confirmation(
            f"Update permissions for tab {arguments.get('tab_id', '')}?"
        ):
            raise RuntimeError("Tab permission update was not confirmed")
        result = _set_tab_permissions(arguments)
    elif name == "mount_tab_mcp_server":
        if arguments.get("confirm") is not True and not _request_confirmation(
            f"Update MCP mount {arguments.get('server_name', '')} for tab {arguments.get('tab_id', '')}?"
        ):
            raise RuntimeError("MCP mount update was not confirmed")
        result = _set_tab_mount(arguments)
    else:
        raise RuntimeError(f"Unknown tool '{name}'")
    return {
        "content": [{"type": "text", "text": _json_text(result)}],
        "structuredContent": result,
    }


def serve_stdio() -> None:
    bootstrap_runtime()
    try:
        while True:
            message = _read_next_message()
            if message is None:
                break
            request_id = message.get("id")
            method = message.get("method")
            params = message.get("params")
            if request_id is None or not isinstance(method, str):
                continue
            arguments = params if isinstance(params, dict) else {}
            try:
                if method == "initialize":
                    global _CLIENT_SUPPORTS_ELICITATION
                    raw_capabilities = arguments.get("capabilities")
                    capabilities: dict[str, Any] = (
                        raw_capabilities if isinstance(raw_capabilities, dict) else {}
                    )
                    _CLIENT_SUPPORTS_ELICITATION = "elicitation" in capabilities
                    _success(
                        request_id,
                        {
                            "protocolVersion": PROTOCOL_VERSION,
                            "capabilities": {
                                "tools": {},
                                "resources": {},
                                "prompts": {},
                            },
                            "serverInfo": {
                                "name": "Autopoe",
                                "version": "dev",
                            },
                        },
                    )
                    continue
                if method == "tools/list":
                    _success(request_id, {"tools": _tool_descriptors()})
                    continue
                if method == "resources/list":
                    _success(request_id, {"resources": _resource_descriptors()})
                    continue
                if method == "resources/read":
                    uri = arguments.get("uri")
                    if not isinstance(uri, str) or not uri.strip():
                        raise RuntimeError("uri is required")
                    _success(request_id, _read_resource(uri.strip()))
                    continue
                if method == "prompts/list":
                    _success(
                        request_id,
                        {
                            "prompts": [
                                {
                                    "name": prompt.name,
                                    "description": prompt.description,
                                    "arguments": prompt.arguments,
                                }
                                for prompt in PROMPTS.values()
                            ]
                        },
                    )
                    continue
                if method == "prompts/get":
                    name = arguments.get("name")
                    if not isinstance(name, str) or not name.strip():
                        raise RuntimeError("name is required")
                    prompt = PROMPTS.get(name.strip())
                    if prompt is None:
                        raise RuntimeError(f"Unknown prompt '{name.strip()}'")
                    raw_prompt_arguments = arguments.get("arguments")
                    prompt_arguments: dict[str, Any] = (
                        raw_prompt_arguments
                        if isinstance(raw_prompt_arguments, dict)
                        else {}
                    )
                    _success(
                        request_id,
                        {
                            "description": prompt.description,
                            "messages": _prompt_messages(prompt.name, prompt_arguments),
                        },
                    )
                    continue
                if method == "tools/call":
                    name = arguments.get("name")
                    if not isinstance(name, str) or not name.strip():
                        raise RuntimeError("name is required")
                    raw_tool_arguments = arguments.get("arguments")
                    tool_arguments: dict[str, Any] = (
                        raw_tool_arguments
                        if isinstance(raw_tool_arguments, dict)
                        else {}
                    )
                    _success(request_id, _call_tool(name.strip(), tool_arguments))
                    continue
                _error(request_id, f"Unsupported MCP method '{method}'", code=-32601)
            except Exception as exc:
                _error(request_id, str(exc))
    finally:
        shutdown_runtime()

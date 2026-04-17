from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
import uuid
from collections import deque
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from curl_cffi import requests as curl_requests

from app.settings import (
    MCPServerConfig,
    build_mcp_server_mounts,
    find_mcp_server,
    get_settings,
    save_settings,
)
from app.workspace_store import workspace_store

if TYPE_CHECKING:
    from app.agent import Agent

PROTOCOL_VERSION = "2025-06-18"
ACTIVITY_RETENTION_SECONDS = 30 * 24 * 60 * 60


class MCPError(RuntimeError):
    pass


@dataclass
class MCPToolDescriptor:
    server_name: str
    tool_name: str
    fully_qualified_id: str
    title: str | None = None
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    read_only_hint: bool = False
    destructive_hint: bool = False
    open_world_hint: bool = False

    def serialize(self) -> dict[str, object]:
        return {
            "name": self.fully_qualified_id,
            "source": "mcp",
            "server_name": self.server_name,
            "tool_name": self.tool_name,
            "fully_qualified_id": self.fully_qualified_id,
            "title": self.title,
            "description": self.description,
            "parameters": self.input_schema,
            "read_only_hint": self.read_only_hint,
            "destructive_hint": self.destructive_hint,
            "open_world_hint": self.open_world_hint,
        }


@dataclass
class MCPResourceDescriptor:
    server_name: str
    name: str
    uri: str
    mime_type: str | None = None
    description: str | None = None

    def serialize(self) -> dict[str, object]:
        return {
            "server_name": self.server_name,
            "name": self.name,
            "uri": self.uri,
            "mime_type": self.mime_type,
            "description": self.description,
        }


@dataclass
class MCPResourceTemplateDescriptor:
    server_name: str
    name: str
    uri_template: str
    description: str | None = None

    def serialize(self) -> dict[str, object]:
        return {
            "server_name": self.server_name,
            "name": self.name,
            "uri_template": self.uri_template,
            "description": self.description,
        }


@dataclass
class MCPPromptDescriptor:
    server_name: str
    name: str
    description: str | None = None
    arguments: list[dict[str, object]] = field(default_factory=list)

    def serialize(self) -> dict[str, object]:
        return {
            "server_name": self.server_name,
            "name": self.name,
            "description": self.description,
            "arguments": list(self.arguments),
        }


@dataclass
class MCPDiscoverySnapshot:
    server_name: str
    transport: str
    status: str
    auth_status: str
    last_auth_result: str | None = None
    last_refresh_at: float | None = None
    last_refresh_result: str = "never"
    last_error: str | None = None
    tools: list[MCPToolDescriptor] = field(default_factory=list)
    resources: list[MCPResourceDescriptor] = field(default_factory=list)
    resource_templates: list[MCPResourceTemplateDescriptor] = field(
        default_factory=list
    )
    prompts: list[MCPPromptDescriptor] = field(default_factory=list)

    def serialize(self) -> dict[str, object]:
        return {
            "server_name": self.server_name,
            "transport": self.transport,
            "status": self.status,
            "auth_status": self.auth_status,
            "last_auth_result": self.last_auth_result,
            "last_refresh_at": self.last_refresh_at,
            "last_refresh_result": self.last_refresh_result,
            "last_error": self.last_error,
            "tools": [item.serialize() for item in self.tools],
            "resources": [item.serialize() for item in self.resources],
            "resource_templates": [
                item.serialize() for item in self.resource_templates
            ],
            "prompts": [item.serialize() for item in self.prompts],
            "capability_counts": {
                "tools": len(self.tools),
                "resources": len(self.resources),
                "resource_templates": len(self.resource_templates),
                "prompts": len(self.prompts),
            },
        }


@dataclass
class MCPActivityRecord:
    id: str
    server_name: str
    action: str
    actor_node_id: str | None
    tab_id: str | None
    started_at: float
    ended_at: float
    result: str
    summary: str
    tool_name: str | None = None
    fully_qualified_id: str | None = None
    target: str | None = None
    approval_result: str | None = None

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "server_name": self.server_name,
            "action": self.action,
            "actor_node_id": self.actor_node_id,
            "tab_id": self.tab_id,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "duration_ms": max(0.0, (self.ended_at - self.started_at) * 1000),
            "result": self.result,
            "summary": self.summary,
            "tool_name": self.tool_name,
            "fully_qualified_id": self.fully_qualified_id,
            "target": self.target,
            "approval_result": self.approval_result,
        }


def _escape_identifier(value: str) -> str:
    parts: list[str] = []
    for character in value:
        if character.isalnum():
            parts.append(character.lower())
            continue
        parts.append(f"_{ord(character):02x}_")
    return "".join(parts) or "unnamed"


def build_fully_qualified_tool_id(server_name: str, tool_name: str) -> str:
    return (
        "mcp__" + _escape_identifier(server_name) + "__" + _escape_identifier(tool_name)
    )


def _build_root_uri(path: str) -> str:
    return Path(path).resolve().as_uri()


def _build_roots_for_agent(agent: Agent) -> list[dict[str, str]]:
    workspace_root = str(Path.cwd().resolve())
    if agent.config.node_type.value == "assistant":
        boundary_dirs = list(get_settings().assistant.write_dirs)
    else:
        boundary_dirs = list(agent.config.write_dirs)
    ordered_paths: list[str] = []
    seen: set[str] = set()
    for path in [workspace_root, *boundary_dirs]:
        resolved = str(Path(path).resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        ordered_paths.append(resolved)
    return [
        {
            "name": Path(path).name or path,
            "uri": _build_root_uri(path),
        }
        for path in ordered_paths
    ]


def _build_stdio_env(server: MCPServerConfig) -> dict[str, str]:
    env = dict(os.environ)
    env.update(server.env)
    for env_var_name in server.env_vars:
        value = os.environ.get(env_var_name)
        if value is not None:
            env[env_var_name] = value
    return env


def _build_http_headers(server: MCPServerConfig) -> tuple[dict[str, str], str | None]:
    headers = dict(server.http_headers)
    bearer_token = None
    if server.bearer_token_env_var:
        bearer_token = os.environ.get(server.bearer_token_env_var)
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
    for env_header_name in server.env_http_headers:
        env_value = os.environ.get(env_header_name)
        if not env_value:
            continue
        if ":" in env_value:
            key, value = env_value.split(":", 1)
            headers[key.strip()] = value.strip()
        else:
            headers[env_header_name] = env_value
    return headers, bearer_token


def _parse_tool_descriptor(
    server_name: str, raw_tool: object
) -> MCPToolDescriptor | None:
    if not isinstance(raw_tool, dict):
        return None
    tool_name = raw_tool.get("name")
    if not isinstance(tool_name, str) or not tool_name.strip():
        return None
    raw_annotations = raw_tool.get("annotations")
    annotations: dict[str, Any] = (
        raw_annotations if isinstance(raw_annotations, dict) else {}
    )
    title = raw_tool.get("title")
    description = raw_tool.get("description")
    input_schema = raw_tool.get("inputSchema")
    return MCPToolDescriptor(
        server_name=server_name,
        tool_name=tool_name.strip(),
        fully_qualified_id=build_fully_qualified_tool_id(
            server_name, tool_name.strip()
        ),
        title=title.strip() if isinstance(title, str) and title.strip() else None,
        description=description.strip() if isinstance(description, str) else "",
        input_schema=input_schema if isinstance(input_schema, dict) else {},
        read_only_hint=bool(
            annotations.get("readOnlyHint", raw_tool.get("readOnlyHint", False))
        ),
        destructive_hint=bool(
            annotations.get(
                "destructiveHint",
                raw_tool.get("destructiveHint", False),
            )
        ),
        open_world_hint=bool(
            annotations.get("openWorldHint", raw_tool.get("openWorldHint", False))
        ),
    )


def _parse_resource_descriptor(
    server_name: str,
    raw_resource: object,
) -> MCPResourceDescriptor | None:
    if not isinstance(raw_resource, dict):
        return None
    uri = raw_resource.get("uri")
    name = raw_resource.get("name")
    if not isinstance(uri, str) or not uri.strip():
        return None
    if not isinstance(name, str) or not name.strip():
        name = uri
    mime_type = raw_resource.get("mimeType")
    description = raw_resource.get("description")
    return MCPResourceDescriptor(
        server_name=server_name,
        name=name.strip(),
        uri=uri.strip(),
        mime_type=mime_type.strip()
        if isinstance(mime_type, str) and mime_type.strip()
        else None,
        description=description.strip()
        if isinstance(description, str) and description.strip()
        else None,
    )


def _parse_resource_template_descriptor(
    server_name: str,
    raw_template: object,
) -> MCPResourceTemplateDescriptor | None:
    if not isinstance(raw_template, dict):
        return None
    uri_template = raw_template.get("uriTemplate")
    name = raw_template.get("name")
    if not isinstance(uri_template, str) or not uri_template.strip():
        return None
    if not isinstance(name, str) or not name.strip():
        name = uri_template
    description = raw_template.get("description")
    return MCPResourceTemplateDescriptor(
        server_name=server_name,
        name=name.strip(),
        uri_template=uri_template.strip(),
        description=description.strip()
        if isinstance(description, str) and description.strip()
        else None,
    )


def _parse_prompt_descriptor(
    server_name: str, raw_prompt: object
) -> MCPPromptDescriptor | None:
    if not isinstance(raw_prompt, dict):
        return None
    name = raw_prompt.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    description = raw_prompt.get("description")
    arguments = raw_prompt.get("arguments")
    return MCPPromptDescriptor(
        server_name=server_name,
        name=name.strip(),
        description=description.strip()
        if isinstance(description, str) and description.strip()
        else None,
        arguments=[
            dict(argument) for argument in arguments if isinstance(argument, dict)
        ]
        if isinstance(arguments, list)
        else [],
    )


class _BaseConnection:
    def __init__(self, server: MCPServerConfig, *, timeout_seconds: int) -> None:
        self.server = server
        self.timeout_seconds = timeout_seconds
        self._next_request_id = 0

    def _build_request(
        self, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, object]:
        self._next_request_id += 1
        payload: dict[str, object] = {
            "jsonrpc": "2.0",
            "id": self._next_request_id,
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        return payload

    def _build_notification(
        self, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        return payload

    def initialize(self) -> dict[str, Any]:
        result = self.request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "roots": {"listChanged": False},
                },
                "clientInfo": {"name": "Autopoe", "version": "dev"},
            },
        )
        self.notify("notifications/initialized")
        return result

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        self._send(self._build_notification(method, params))

    def request(
        self, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        payload = self._build_request(method, params)
        request_id = payload["id"]
        self._send(payload)
        while True:
            message = self._receive()
            if not isinstance(message, dict):
                continue
            if message.get("id") == request_id and "result" in message:
                result = message.get("result")
                return result if isinstance(result, dict) else {}
            if message.get("id") == request_id and "error" in message:
                error = message.get("error")
                raise MCPError(
                    error.get("message")
                    if isinstance(error, dict) and isinstance(error.get("message"), str)
                    else f"MCP request failed: {method}"
                )
            if "method" in message and "id" in message:
                self._handle_server_request(message)

    def close(self) -> None:
        return None

    def _handle_server_request(self, message: dict[str, Any]) -> None:
        request_id = message.get("id")
        method = message.get("method")
        if not isinstance(request_id, int | str) or not isinstance(method, str):
            return
        if method == "roots/list":
            self._send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "roots": self._build_roots(),
                    },
                }
            )
            return
        if method == "ping":
            self._send({"jsonrpc": "2.0", "id": request_id, "result": {}})
            return
        self._send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32601,
                    "message": f"Unsupported MCP request: {method}",
                },
            }
        )

    def _build_roots(self) -> list[dict[str, str]]:
        return []

    def _send(self, payload: dict[str, object]) -> None:
        raise NotImplementedError

    def _receive(self) -> dict[str, Any]:
        raise NotImplementedError


class _StdioConnection(_BaseConnection):
    def __init__(
        self,
        server: MCPServerConfig,
        *,
        timeout_seconds: int,
        roots: list[dict[str, str]],
    ) -> None:
        super().__init__(server, timeout_seconds=timeout_seconds)
        command: list[str] = [server.command, *server.args]
        self._roots_payload = roots
        self._stderr_lines: deque[str] = deque(maxlen=20)
        self._stdout_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
        try:
            self._process = subprocess.Popen(
                command,
                cwd=server.cwd or None,
                env=_build_stdio_env(server),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise MCPError(str(exc)) from exc
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()

    def _build_roots(self) -> list[dict[str, str]]:
        return list(self._roots_payload)

    def _read_stdout(self) -> None:
        assert self._process.stdout is not None
        for line in self._process.stdout:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                self._stdout_queue.put(
                    {
                        "jsonrpc": "2.0",
                        "error": {
                            "message": f"Invalid MCP response: {stripped[:200]}",
                        },
                    }
                )
                continue
            if isinstance(payload, dict):
                self._stdout_queue.put(payload)
        self._stdout_queue.put(None)

    def _read_stderr(self) -> None:
        assert self._process.stderr is not None
        for line in self._process.stderr:
            stripped = line.strip()
            if stripped:
                self._stderr_lines.append(stripped)

    def _send(self, payload: dict[str, object]) -> None:
        if self._process.stdin is None:
            raise MCPError("MCP stdio connection is unavailable")
        self._process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self._process.stdin.flush()

    def _receive(self) -> dict[str, Any]:
        try:
            message = self._stdout_queue.get(timeout=self.timeout_seconds)
        except queue.Empty as exc:
            stderr_tail = "\n".join(self._stderr_lines)
            raise MCPError(
                stderr_tail
                or f"MCP stdio request timed out after {self.timeout_seconds}s"
            ) from exc
        if message is None:
            stderr_tail = "\n".join(self._stderr_lines)
            raise MCPError(stderr_tail or "MCP stdio server closed the connection")
        return message

    def close(self) -> None:
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self._process.kill()


class _HttpConnection(_BaseConnection):
    def __init__(
        self,
        server: MCPServerConfig,
        *,
        timeout_seconds: int,
    ) -> None:
        super().__init__(server, timeout_seconds=timeout_seconds)
        headers, _ = _build_http_headers(server)
        self._headers: dict[str, str] = headers
        self._client: Any = curl_requests.Session()
        self._pending_response: dict[str, Any] | list[dict[str, Any]] = {}
        self._session_id: str | None = None

    def _send(self, payload: dict[str, object]) -> None:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
            **self._headers,
        }
        if self._session_id:
            headers["MCP-Session-Id"] = self._session_id
        response = self._client.post(
            self.server.url,
            headers=headers,
            json=payload,
            timeout=self.timeout_seconds,
        )
        session_id = response.headers.get("MCP-Session-Id") or response.headers.get(
            "mcp-session-id"
        )
        if session_id:
            self._session_id = session_id
        response.raise_for_status()
        content_type = (response.headers.get("Content-Type") or "").lower()
        response_text = response.text if getattr(response, "text", None) else ""
        stripped_text = response_text.lstrip()
        if (
            "text/html" in content_type
            or stripped_text.startswith("<!doctype html")
            or stripped_text.startswith("<html")
        ):
            raise MCPError(
                "MCP request was blocked by an HTML challenge or interstitial response"
            )
        if "text/event-stream" in content_type:
            self._pending_response = _parse_sse_payload(response_text)
            return
        raw_response = response.json() if response.content else {}
        if isinstance(raw_response, list):
            self._pending_response = [
                item for item in raw_response if isinstance(item, dict)
            ]
            return
        if isinstance(raw_response, dict):
            self._pending_response = raw_response
            return
        self._pending_response = {}

    def _receive(self) -> dict[str, Any]:
        payload = self._pending_response
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    return item
            raise MCPError("Invalid MCP HTTP response")
        if not isinstance(payload, dict):
            raise MCPError("Invalid MCP HTTP response")
        return payload

    def close(self) -> None:
        if self._session_id:
            with suppress(Exception):
                self._client.delete(
                    self.server.url,
                    headers={"MCP-Session-Id": self._session_id},
                    timeout=self.timeout_seconds,
                )
        self._client.close()


def _list_paginated(
    connection: _BaseConnection,
    *,
    method: str,
    result_key: str,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        params = {"cursor": cursor} if cursor else None
        result = connection.request(method, params)
        chunk = result.get(result_key)
        if isinstance(chunk, list):
            items.extend(item for item in chunk if isinstance(item, dict))
        next_cursor = result.get("nextCursor")
        if not isinstance(next_cursor, str) or not next_cursor.strip():
            break
        cursor = next_cursor
    return items


def _parse_sse_payload(payload: str) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    data_lines: list[str] = []
    for line in payload.splitlines():
        if line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").strip())
            continue
        if line.strip():
            continue
        if not data_lines:
            continue
        try:
            message = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            data_lines = []
            continue
        if isinstance(message, dict):
            messages.append(message)
        data_lines = []
    if data_lines:
        try:
            message = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            return messages
        if isinstance(message, dict):
            messages.append(message)
    return messages


def _auth_status_for_server(
    server: MCPServerConfig,
    *,
    force_logged_out: bool = False,
) -> tuple[str, str | None]:
    if server.transport == "stdio":
        return "unsupported", None
    if force_logged_out:
        return ("not_logged_in", "MCP server session is logged out")
    headers, bearer_token = _build_http_headers(server)
    _ = headers
    auth_expected = bool(
        server.bearer_token_env_var or server.oauth_resource or server.scopes
    )
    if auth_expected and not bearer_token:
        if server.bearer_token_env_var:
            return (
                "not_logged_in",
                f"Set env var {server.bearer_token_env_var} before refreshing this server",
            )
        return (
            "not_logged_in",
            "Authentication is required before refreshing this server",
        )
    return ("connected" if auth_expected else "unsupported", None)


class MCPService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._snapshots: dict[str, MCPDiscoverySnapshot] = {}
        self._activities: list[MCPActivityRecord] = []
        self._logged_out_servers: set[str] = set()

    def reset(self) -> None:
        with self._lock:
            self._snapshots.clear()
            self._activities.clear()
            self._logged_out_servers.clear()

    def bootstrap(self) -> None:
        settings = get_settings()
        for server in settings.mcp_servers:
            if not server.enabled:
                self._set_snapshot(
                    MCPDiscoverySnapshot(
                        server_name=server.name,
                        transport=server.transport,
                        status="disabled",
                        auth_status="unsupported"
                        if server.transport == "stdio"
                        else "not_logged_in",
                    )
                )
                continue
            try:
                self.refresh_server(server.name)
            except MCPError as exc:
                if server.required:
                    raise RuntimeError(str(exc)) from exc

    def _prune_activities_locked(self, now: float) -> None:
        min_timestamp = now - ACTIVITY_RETENTION_SECONDS
        self._activities = [
            activity
            for activity in self._activities
            if activity.ended_at >= min_timestamp
        ]

    def _record_activity(
        self,
        *,
        server_name: str,
        action: str,
        actor_node_id: str | None,
        tab_id: str | None,
        started_at: float,
        ended_at: float,
        result: str,
        summary: str,
        tool_name: str | None = None,
        fully_qualified_id: str | None = None,
        target: str | None = None,
        approval_result: str | None = None,
    ) -> None:
        record = MCPActivityRecord(
            id=str(uuid.uuid4()),
            server_name=server_name,
            action=action,
            actor_node_id=actor_node_id,
            tab_id=tab_id,
            started_at=started_at,
            ended_at=ended_at,
            result=result,
            summary=summary,
            tool_name=tool_name,
            fully_qualified_id=fully_qualified_id,
            target=target,
            approval_result=approval_result,
        )
        with self._lock:
            self._prune_activities_locked(ended_at)
            self._activities.append(record)

    def _set_snapshot(self, snapshot: MCPDiscoverySnapshot) -> None:
        with self._lock:
            self._snapshots[snapshot.server_name] = snapshot

    def _get_snapshot(self, server_name: str) -> MCPDiscoverySnapshot | None:
        with self._lock:
            return self._snapshots.get(server_name)

    def _build_connection(
        self,
        server: MCPServerConfig,
        *,
        timeout_seconds: int,
        roots: list[dict[str, str]] | None = None,
    ) -> _BaseConnection:
        if server.transport == "stdio":
            if not server.command.strip():
                raise MCPError(f"MCP server '{server.name}' is missing a command")
            return _StdioConnection(
                server,
                timeout_seconds=timeout_seconds,
                roots=roots or [],
            )
        if not server.url.strip():
            raise MCPError(f"MCP server '{server.name}' is missing a URL")
        return _HttpConnection(server, timeout_seconds=timeout_seconds)

    def _discover_server(
        self,
        server: MCPServerConfig,
        *,
        auth_result: str | None = None,
    ) -> MCPDiscoverySnapshot:
        auth_status, auth_error = _auth_status_for_server(
            server,
            force_logged_out=server.name in self._logged_out_servers,
        )
        if server.transport == "streamable_http" and auth_status == "not_logged_in":
            return MCPDiscoverySnapshot(
                server_name=server.name,
                transport=server.transport,
                status="auth_required",
                auth_status=auth_status,
                last_auth_result=auth_result,
                last_refresh_at=time.time(),
                last_refresh_result="error",
                last_error=auth_error,
            )

        connection = self._build_connection(
            server,
            timeout_seconds=server.startup_timeout_sec,
        )
        try:
            connection.initialize()
            tools = [
                descriptor
                for descriptor in (
                    _parse_tool_descriptor(server.name, raw_tool)
                    for raw_tool in _list_paginated(
                        connection,
                        method="tools/list",
                        result_key="tools",
                    )
                )
                if descriptor is not None
            ]
            if server.enabled_tools:
                tools = [
                    descriptor
                    for descriptor in tools
                    if descriptor.tool_name in server.enabled_tools
                ]
            if server.disabled_tools:
                disabled_tool_names = set(server.disabled_tools)
                tools = [
                    descriptor
                    for descriptor in tools
                    if descriptor.tool_name not in disabled_tool_names
                ]
            resources = [
                descriptor
                for descriptor in (
                    _parse_resource_descriptor(server.name, raw_resource)
                    for raw_resource in _list_paginated(
                        connection,
                        method="resources/list",
                        result_key="resources",
                    )
                )
                if descriptor is not None
            ]
            resource_templates = [
                descriptor
                for descriptor in (
                    _parse_resource_template_descriptor(server.name, raw_template)
                    for raw_template in _list_paginated(
                        connection,
                        method="resources/templates/list",
                        result_key="resourceTemplates",
                    )
                )
                if descriptor is not None
            ]
            prompts = [
                descriptor
                for descriptor in (
                    _parse_prompt_descriptor(server.name, raw_prompt)
                    for raw_prompt in _list_paginated(
                        connection,
                        method="prompts/list",
                        result_key="prompts",
                    )
                )
                if descriptor is not None
            ]
            return MCPDiscoverySnapshot(
                server_name=server.name,
                transport=server.transport,
                status="connected",
                auth_status=auth_status,
                last_auth_result=auth_result,
                last_refresh_at=time.time(),
                last_refresh_result="success",
                tools=tools,
                resources=resources,
                resource_templates=resource_templates,
                prompts=prompts,
            )
        finally:
            connection.close()

    def list_server_payloads(self) -> list[dict[str, object]]:
        settings = get_settings()
        assistant_mounts = set(settings.assistant.mcp_servers)
        tabs = workspace_store.list_tabs()
        payloads: list[dict[str, object]] = []
        for server in settings.mcp_servers:
            snapshot = self._get_snapshot(server.name)
            server_payload: dict[str, object] = {
                "config": {
                    "name": server.name,
                    "transport": server.transport,
                    "enabled": server.enabled,
                    "required": server.required,
                    "startup_timeout_sec": server.startup_timeout_sec,
                    "tool_timeout_sec": server.tool_timeout_sec,
                    "enabled_tools": list(server.enabled_tools),
                    "disabled_tools": list(server.disabled_tools),
                    "scopes": list(server.scopes),
                    "oauth_resource": server.oauth_resource,
                    "command": server.command,
                    "args": list(server.args),
                    "env": dict(server.env),
                    "env_vars": list(server.env_vars),
                    "cwd": server.cwd,
                    "url": server.url,
                    "bearer_token_env_var": server.bearer_token_env_var,
                    "http_headers": dict(server.http_headers),
                    "env_http_headers": list(server.env_http_headers),
                },
                "snapshot": snapshot.serialize()
                if snapshot is not None
                else MCPDiscoverySnapshot(
                    server_name=server.name,
                    transport=server.transport,
                    status="disabled" if not server.enabled else "connecting",
                    auth_status="unsupported"
                    if server.transport == "stdio"
                    else "not_logged_in",
                ).serialize(),
                "mounts": {
                    "assistant": server.name in assistant_mounts,
                    "tabs": [
                        {
                            "tab_id": tab.id,
                            "tab_title": tab.title,
                            "mounted": server.name in tab.mcp_servers,
                        }
                        for tab in tabs
                    ],
                },
                "activity": [
                    activity.serialize()
                    for activity in self.list_activities(server_name=server.name)
                ],
            }
            payloads.append(server_payload)
        return payloads

    def list_activities(
        self, *, server_name: str | None = None
    ) -> list[MCPActivityRecord]:
        with self._lock:
            now = time.time()
            self._prune_activities_locked(now)
            records = list(self._activities)
        if server_name is None:
            return records
        return [record for record in records if record.server_name == server_name]

    def refresh_server(self, server_name: str) -> dict[str, object]:
        settings = get_settings()
        server = find_mcp_server(settings, server_name)
        if server is None:
            raise MCPError(f"MCP server '{server_name}' not found")
        if not server.enabled:
            snapshot = MCPDiscoverySnapshot(
                server_name=server.name,
                transport=server.transport,
                status="disabled",
                auth_status="unsupported"
                if server.transport == "stdio"
                else "not_logged_in",
                last_auth_result=None,
                last_refresh_at=time.time(),
                last_refresh_result="success",
            )
            self._set_snapshot(snapshot)
            return snapshot.serialize()
        started_at = time.time()
        try:
            previous_snapshot = self._get_snapshot(server.name)
            snapshot = self._discover_server(server)
            if snapshot.last_auth_result is None and previous_snapshot is not None:
                snapshot.last_auth_result = previous_snapshot.last_auth_result
            self._set_snapshot(snapshot)
            self._record_activity(
                server_name=server.name,
                action="refresh",
                actor_node_id=None,
                tab_id=None,
                started_at=started_at,
                ended_at=time.time(),
                result="success"
                if snapshot.last_refresh_result == "success"
                else "error",
                summary=(
                    "Capabilities refreshed"
                    if snapshot.last_refresh_result == "success"
                    else snapshot.last_error or "Failed to refresh capabilities"
                ),
            )
            return snapshot.serialize()
        except Exception as exc:
            snapshot = MCPDiscoverySnapshot(
                server_name=server.name,
                transport=server.transport,
                status="error",
                auth_status="error"
                if server.transport == "streamable_http"
                else "unsupported",
                last_auth_result=None,
                last_refresh_at=time.time(),
                last_refresh_result="error",
                last_error=str(exc),
            )
            self._set_snapshot(snapshot)
            self._record_activity(
                server_name=server.name,
                action="refresh",
                actor_node_id=None,
                tab_id=None,
                started_at=started_at,
                ended_at=time.time(),
                result="error",
                summary=str(exc),
            )
            raise MCPError(str(exc)) from exc

    def refresh_all(self) -> list[dict[str, object]]:
        results: list[dict[str, object]] = []
        for server in get_settings().mcp_servers:
            try:
                results.append(self.refresh_server(server.name))
            except MCPError:
                snapshot = self._get_snapshot(server.name)
                if snapshot is not None:
                    results.append(snapshot.serialize())
        return results

    def create_or_update_server(
        self,
        *,
        current_name: str | None,
        config_data: dict[str, object],
    ) -> dict[str, object]:
        settings = get_settings()
        normalized_name = config_data.get("name")
        if not isinstance(normalized_name, str) or not normalized_name.strip():
            raise MCPError("name must not be empty")
        next_name = normalized_name.strip()
        existing = find_mcp_server(settings, next_name)
        if existing is not None and existing.name != current_name:
            raise MCPError(f"MCP server '{next_name}' already exists")
        try:
            mcp_servers = build_mcp_server_mounts(
                [item.name for item in settings.mcp_servers],
                field_name="mcp_servers",
            )
        except ValueError:
            mcp_servers = [item.name for item in settings.mcp_servers]
        _ = mcp_servers
        from app.settings import _build_mcp_server_config

        server_config, migrated = _build_mcp_server_config(config_data)
        _ = migrated
        if server_config is None:
            raise MCPError("Invalid MCP server config")
        if current_name is not None and current_name != next_name:
            for mounted_name in settings.assistant.mcp_servers:
                if mounted_name == current_name:
                    mounted_name = next_name
            settings.assistant.mcp_servers = [
                next_name if mounted_name == current_name else mounted_name
                for mounted_name in settings.assistant.mcp_servers
            ]
            for tab in workspace_store.list_tabs():
                if current_name not in tab.mcp_servers:
                    continue
                tab.mcp_servers = [
                    next_name if mounted_name == current_name else mounted_name
                    for mounted_name in tab.mcp_servers
                ]
                workspace_store.upsert_tab(tab)
        replaced = False
        for index, existing_server in enumerate(settings.mcp_servers):
            if existing_server.name != (current_name or next_name):
                continue
            settings.mcp_servers[index] = server_config
            replaced = True
            break
        if not replaced:
            settings.mcp_servers.append(server_config)
        save_settings(settings)
        if not server_config.enabled:
            self._logged_out_servers.discard(server_config.name)
            snapshot = MCPDiscoverySnapshot(
                server_name=server_config.name,
                transport=server_config.transport,
                status="disabled",
                auth_status="unsupported"
                if server_config.transport == "stdio"
                else "not_logged_in",
                last_auth_result=None,
                last_refresh_at=time.time(),
                last_refresh_result="success",
            )
            self._set_snapshot(snapshot)
            return snapshot.serialize()
        self._logged_out_servers.discard(server_config.name)
        return self.refresh_server(server_config.name)

    def delete_server(self, server_name: str) -> None:
        settings = get_settings()
        if find_mcp_server(settings, server_name) is None:
            raise MCPError(f"MCP server '{server_name}' not found")
        settings.mcp_servers = [
            server for server in settings.mcp_servers if server.name != server_name
        ]
        settings.assistant.mcp_servers = [
            mounted_name
            for mounted_name in settings.assistant.mcp_servers
            if mounted_name != server_name
        ]
        save_settings(settings)
        for tab in workspace_store.list_tabs():
            if server_name not in tab.mcp_servers:
                continue
            tab.mcp_servers = [
                mounted_name
                for mounted_name in tab.mcp_servers
                if mounted_name != server_name
            ]
            workspace_store.upsert_tab(tab)
        with self._lock:
            self._snapshots.pop(server_name, None)
            self._logged_out_servers.discard(server_name)

    def login_server(self, server_name: str) -> dict[str, object]:
        self._logged_out_servers.discard(server_name)
        started_at = time.time()
        snapshot = self.refresh_server(server_name)
        current_snapshot = self._get_snapshot(server_name)
        if current_snapshot is not None:
            current_snapshot.last_auth_result = (
                "success" if current_snapshot.auth_status == "connected" else "error"
            )
            self._set_snapshot(current_snapshot)
            self._record_activity(
                server_name=server_name,
                action="login",
                actor_node_id=None,
                tab_id=None,
                started_at=started_at,
                ended_at=time.time(),
                result="success"
                if current_snapshot.auth_status == "connected"
                else "error",
                summary=(
                    "Logged in MCP server session"
                    if current_snapshot.auth_status == "connected"
                    else current_snapshot.last_error or "Failed to login MCP server"
                ),
            )
            return current_snapshot.serialize()
        return snapshot

    def logout_server(self, server_name: str) -> dict[str, object]:
        settings = get_settings()
        server = find_mcp_server(settings, server_name)
        if server is None:
            raise MCPError(f"MCP server '{server_name}' not found")
        if server.transport == "stdio":
            raise MCPError("Logout is not available for stdio MCP servers")
        self._logged_out_servers.add(server_name)
        snapshot = MCPDiscoverySnapshot(
            server_name=server.name,
            transport=server.transport,
            status="auth_required",
            auth_status="not_logged_in",
            last_auth_result="logged_out",
            last_refresh_at=time.time(),
            last_refresh_result="success",
            last_error=None,
        )
        self._set_snapshot(snapshot)
        self._record_activity(
            server_name=server_name,
            action="logout",
            actor_node_id=None,
            tab_id=None,
            started_at=time.time(),
            ended_at=time.time(),
            result="success",
            summary="Logged out MCP server session",
        )
        return snapshot.serialize()

    def set_assistant_mount(self, *, server_name: str, mounted: bool) -> list[str]:
        settings = get_settings()
        server = find_mcp_server(settings, server_name)
        if server is None:
            raise MCPError(f"MCP server '{server_name}' not found")
        if mounted and not server.enabled:
            raise MCPError(f"MCP server '{server_name}' is disabled")
        names = [name for name in settings.assistant.mcp_servers if name != server_name]
        if mounted:
            names.append(server_name)
        settings.assistant.mcp_servers = build_mcp_server_mounts(
            names,
            field_name="assistant.mcp_servers",
        )
        save_settings(settings)
        return list(settings.assistant.mcp_servers)

    def set_tab_mount(
        self, *, server_name: str, tab_id: str, mounted: bool
    ) -> dict[str, object]:
        settings = get_settings()
        server = find_mcp_server(settings, server_name)
        if server is None:
            raise MCPError(f"MCP server '{server_name}' not found")
        if mounted and not server.enabled:
            raise MCPError(f"MCP server '{server_name}' is disabled")
        tab = workspace_store.get_tab(tab_id)
        if tab is None:
            raise MCPError(f"Tab '{tab_id}' not found")
        next_mounts = [name for name in tab.mcp_servers if name != server_name]
        if mounted:
            next_mounts.append(server_name)
        from app.graph_service import set_tab_mcp_servers

        payload, error = set_tab_mcp_servers(
            tab_id=tab_id,
            mcp_servers=next_mounts,
            actor_id="assistant",
        )
        if error is not None or payload is None:
            raise MCPError(error or "Failed to update tab MCP mounts")
        return payload

    def _visible_server_names_for_agent(self, agent: Agent) -> list[str]:
        settings = get_settings()
        if agent.config.node_type.value == "assistant":
            mounted_names = list(settings.assistant.mcp_servers)
        elif agent.config.tab_id:
            tab = workspace_store.get_tab(agent.config.tab_id)
            mounted_names = list(tab.mcp_servers) if tab is not None else []
        else:
            mounted_names = []
        visible_names: list[str] = []
        seen: set[str] = set()
        for server_name in mounted_names:
            if server_name in seen:
                continue
            server = find_mcp_server(settings, server_name)
            if server is None or not server.enabled:
                continue
            seen.add(server_name)
            visible_names.append(server_name)
        return visible_names

    def _visible_snapshots_for_agent(self, agent: Agent) -> list[MCPDiscoverySnapshot]:
        snapshots: list[MCPDiscoverySnapshot] = []
        for server_name in self._visible_server_names_for_agent(agent):
            snapshot = self._get_snapshot(server_name)
            if snapshot is None or snapshot.status != "connected":
                continue
            snapshots.append(snapshot)
        return snapshots

    def list_discovered_tool_descriptors(self) -> list[dict[str, object]]:
        return [descriptor.serialize() for descriptor in self.list_discovered_tools()]

    def list_discovered_tools(self) -> list[MCPToolDescriptor]:
        tools: list[MCPToolDescriptor] = []
        with self._lock:
            snapshots = list(self._snapshots.values())
        for snapshot in snapshots:
            if snapshot.status != "connected":
                continue
            tools.extend(snapshot.tools)
        return tools

    def get_dynamic_tool_descriptor(
        self,
        fully_qualified_id: str,
    ) -> MCPToolDescriptor | None:
        for descriptor in self.list_discovered_tools():
            if descriptor.fully_qualified_id == fully_qualified_id:
                return descriptor
        return None

    def list_agent_dynamic_tools(self, agent: Agent) -> list[MCPToolDescriptor]:
        tools: list[MCPToolDescriptor] = []
        for snapshot in self._visible_snapshots_for_agent(agent):
            tools.extend(snapshot.tools)
        return tools

    def has_visible_capabilities(self, agent: Agent) -> bool:
        return bool(self._visible_snapshots_for_agent(agent))

    def list_agent_resources(
        self,
        agent: Agent,
        *,
        server_name: str | None = None,
    ) -> list[dict[str, object]]:
        resources: list[dict[str, object]] = []
        for snapshot in self._visible_snapshots_for_agent(agent):
            if server_name is not None and snapshot.server_name != server_name:
                continue
            resources.extend(item.serialize() for item in snapshot.resources)
        return resources

    def list_agent_resource_templates(
        self,
        agent: Agent,
        *,
        server_name: str | None = None,
    ) -> list[dict[str, object]]:
        templates: list[dict[str, object]] = []
        for snapshot in self._visible_snapshots_for_agent(agent):
            if server_name is not None and snapshot.server_name != server_name:
                continue
            templates.extend(item.serialize() for item in snapshot.resource_templates)
        return templates

    def list_agent_prompts(
        self,
        agent: Agent,
        *,
        server_name: str | None = None,
    ) -> list[dict[str, object]]:
        prompts: list[dict[str, object]] = []
        for snapshot in self._visible_snapshots_for_agent(agent):
            if server_name is not None and snapshot.server_name != server_name:
                continue
            prompts.extend(item.serialize() for item in snapshot.prompts)
        return prompts

    def _get_server_for_agent(self, agent: Agent, server_name: str) -> MCPServerConfig:
        if server_name not in self._visible_server_names_for_agent(agent):
            raise MCPError(
                f"MCP server '{server_name}' is not mounted in the current boundary"
            )
        server = find_mcp_server(get_settings(), server_name)
        if server is None or not server.enabled:
            raise MCPError(f"MCP server '{server_name}' is unavailable")
        if server.transport == "streamable_http" and not agent.config.allow_network:
            raise MCPError("Network access is disabled for this node")
        return server

    def read_agent_resource(
        self,
        agent: Agent,
        *,
        server_name: str,
        uri: str,
    ) -> dict[str, Any]:
        server = self._get_server_for_agent(agent, server_name)
        started_at = time.time()
        connection = self._build_connection(
            server,
            timeout_seconds=server.tool_timeout_sec,
            roots=_build_roots_for_agent(agent),
        )
        try:
            connection.initialize()
            result = connection.request("resources/read", {"uri": uri})
            self._record_activity(
                server_name=server_name,
                action="resource_read",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="success",
                summary=f"Read resource {uri}",
                target=uri,
            )
            return result
        except Exception as exc:
            self._record_activity(
                server_name=server_name,
                action="resource_read",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="error",
                summary=str(exc),
                target=uri,
            )
            raise MCPError(str(exc)) from exc
        finally:
            connection.close()

    def get_agent_prompt(
        self,
        agent: Agent,
        *,
        server_name: str,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        server = self._get_server_for_agent(agent, server_name)
        started_at = time.time()
        connection = self._build_connection(
            server,
            timeout_seconds=server.tool_timeout_sec,
            roots=_build_roots_for_agent(agent),
        )
        try:
            connection.initialize()
            params: dict[str, Any] = {"name": name}
            if arguments:
                params["arguments"] = arguments
            result = connection.request("prompts/get", params)
            self._record_activity(
                server_name=server_name,
                action="prompt_get",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="success",
                summary=f"Loaded prompt {name}",
                target=name,
            )
            return result
        except Exception as exc:
            self._record_activity(
                server_name=server_name,
                action="prompt_get",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="error",
                summary=str(exc),
                target=name,
            )
            raise MCPError(str(exc)) from exc
        finally:
            connection.close()

    def preview_server_prompt(
        self,
        *,
        server_name: str,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        settings = get_settings()
        server = find_mcp_server(settings, server_name)
        if server is None or not server.enabled:
            raise MCPError(f"MCP server '{server_name}' is unavailable")
        started_at = time.time()
        connection = self._build_connection(
            server,
            timeout_seconds=server.tool_timeout_sec,
        )
        try:
            connection.initialize()
            params: dict[str, Any] = {"name": name}
            if arguments:
                params["arguments"] = arguments
            result = connection.request("prompts/get", params)
            self._record_activity(
                server_name=server_name,
                action="prompt_get",
                actor_node_id=None,
                tab_id=None,
                started_at=started_at,
                ended_at=time.time(),
                result="success",
                summary=f"Previewed prompt {name}",
                target=name,
            )
            return result
        except Exception as exc:
            self._record_activity(
                server_name=server_name,
                action="prompt_get",
                actor_node_id=None,
                tab_id=None,
                started_at=started_at,
                ended_at=time.time(),
                result="error",
                summary=str(exc),
                target=name,
            )
            raise MCPError(str(exc)) from exc
        finally:
            connection.close()

    def call_agent_tool(
        self,
        agent: Agent,
        *,
        fully_qualified_id: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        descriptor = next(
            (
                item
                for item in self.list_agent_dynamic_tools(agent)
                if item.fully_qualified_id == fully_qualified_id
            ),
            None,
        )
        if descriptor is None:
            raise MCPError(f"MCP tool '{fully_qualified_id}' is not available")
        if descriptor.destructive_hint or descriptor.open_world_hint:
            self._record_activity(
                server_name=descriptor.server_name,
                action="tool_call",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=time.time(),
                ended_at=time.time(),
                result="rejected",
                summary="Explicit MCP approval is required for this tool",
                tool_name=descriptor.tool_name,
                fully_qualified_id=descriptor.fully_qualified_id,
                approval_result="requires_approval",
            )
            raise MCPError("Explicit MCP approval is required for this tool")
        server = self._get_server_for_agent(agent, descriptor.server_name)
        started_at = time.time()
        connection = self._build_connection(
            server,
            timeout_seconds=server.tool_timeout_sec,
            roots=_build_roots_for_agent(agent),
        )
        try:
            connection.initialize()
            result = connection.request(
                "tools/call",
                {"name": descriptor.tool_name, "arguments": arguments},
            )
            self._record_activity(
                server_name=descriptor.server_name,
                action="tool_call",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="success",
                summary=f"Called tool {descriptor.tool_name}",
                tool_name=descriptor.tool_name,
                fully_qualified_id=descriptor.fully_qualified_id,
                approval_result="granted",
            )
            return result
        except Exception as exc:
            self._record_activity(
                server_name=descriptor.server_name,
                action="tool_call",
                actor_node_id=agent.uuid,
                tab_id=agent.config.tab_id,
                started_at=started_at,
                ended_at=time.time(),
                result="error",
                summary=str(exc),
                tool_name=descriptor.tool_name,
                fully_qualified_id=descriptor.fully_qualified_id,
                approval_result="granted",
            )
            raise MCPError(str(exc)) from exc
        finally:
            connection.close()


mcp_service = MCPService()

from __future__ import annotations

import json
import os
import subprocess
import threading
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

import httpx
from loguru import logger

from app.permissions import check_command_access, check_path_access
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ExecuteCommandTool(Tool):
    name = "execute_command"
    description = "Execute a shell command in the agent's working directory."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Shell command to execute",
            },
            "timeout": {
                "type": "number",
                "description": "Timeout in seconds (default 30)",
            },
        },
        "required": ["command"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        on_output: Callable[[str], None] | None = kwargs.get("on_output")
        perms = agent.config.permissions

        command = args["command"]
        if not check_command_access(perms, command):
            return json.dumps({"error": f"Command not allowed: {command}"})

        cwd = agent.config.worktree_path
        if not cwd:
            if perms.allowed_paths:
                cwd = perms.allowed_paths[0]
            else:
                return json.dumps({"error": "No working directory available"})

        cwd = os.path.normpath(os.path.abspath(cwd))
        if not check_path_access(perms, cwd):
            return json.dumps({"error": "Working directory access denied"})

        timeout = args.get("timeout", 30)
        logger.debug(
            "Executing command: {} (cwd={}, timeout={}s)",
            command,
            cwd,
            timeout,
        )
        try:
            proc = subprocess.Popen(
                command,
                shell=True,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            stdout_lines: list[str] = []
            stderr_lines: list[str] = []

            def _read_stderr() -> None:
                assert proc.stderr is not None
                for line in proc.stderr:
                    stderr_lines.append(line)

            stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
            stderr_thread.start()

            assert proc.stdout is not None
            for line in proc.stdout:
                stdout_lines.append(line)
                if on_output:
                    on_output(line)

            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                logger.warning("Command timed out after {}s: {}", timeout, command)
                return json.dumps({"error": f"Command timed out after {timeout}s"})

            stderr_thread.join(timeout=5)

            stdout = "".join(stdout_lines)
            stderr = "".join(stderr_lines)
            logger.debug("Command exited with code {}", proc.returncode)
            return json.dumps(
                {
                    "returncode": proc.returncode,
                    "stdout": stdout[:5000],
                    "stderr": stderr[:2000],
                },
            )
        except Exception as e:
            return json.dumps({"error": str(e)})


class NetworkRequestTool(Tool):
    name = "network_request"
    description = "Make an HTTP request."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                "description": "HTTP method",
            },
            "url": {"type": "string", "description": "Request URL"},
            "headers": {
                "type": "object",
                "description": "Request headers (optional)",
            },
            "body": {"type": "string", "description": "Request body (optional)"},
        },
        "required": ["method", "url"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        method = args["method"]
        url = args["url"]
        logger.debug("HTTP {} {}", method, url)
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.request(
                    method=method,
                    url=url,
                    headers=args.get("headers"),
                    content=args.get("body"),
                )
            logger.debug("HTTP {} {} -> {}", method, url, response.status_code)
            return json.dumps(
                {
                    "status_code": response.status_code,
                    "body": response.text[:5000],
                },
            )
        except Exception as e:
            logger.warning("HTTP request failed: {} {} - {}", method, url, e)
            return json.dumps({"error": str(e)})

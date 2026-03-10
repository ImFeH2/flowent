from __future__ import annotations

import json
import subprocess
import threading
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.sandbox import build_bwrap_cmd
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ExecTool(Tool):
    name = "exec"
    description = "Execute a shell command in a sandboxed environment."
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

        command = args["command"]
        timeout = int(args.get("timeout", 30))
        write_dirs = agent.config.write_dirs

        bwrap_cmd = build_bwrap_cmd(
            write_dirs,
            command,
            allow_network=agent.config.allow_network,
        )

        logger.debug("Executing command: {} (timeout={}s)", command, timeout)

        try:
            proc = subprocess.Popen(
                bwrap_cmd,
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
                }
            )
        except Exception as e:
            return json.dumps({"error": str(e)})

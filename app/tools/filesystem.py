from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.permissions import check_path_access, check_write_access
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


def _resolve_path(agent: Agent, relative_path: str) -> str | None:
    worktree = agent.config.worktree_path
    if worktree:
        full = os.path.normpath(os.path.join(worktree, relative_path))
        if not full.startswith(os.path.normpath(worktree)):
            return None
        return full

    normalized = os.path.normpath(os.path.abspath(relative_path))
    if check_path_access(agent.config.permissions, normalized):
        return normalized
    return None


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read a file. For agents with a worktree, path is relative to worktree. For Steward, use absolute paths within allowed paths."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "File path (relative to worktree, or absolute for Steward)",
            },
        },
        "required": ["path"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        full_path = _resolve_path(agent, args["path"])
        if full_path is None:
            return json.dumps({"error": "Path access denied or invalid path"})

        if agent.config.worktree_path and not check_path_access(
            agent.config.permissions, full_path
        ):
            return json.dumps({"error": "Path access denied"})

        if not os.path.isfile(full_path):
            return json.dumps({"error": f"File not found: {args['path']}"})
        try:
            with open(full_path, encoding="utf-8") as f:
                content = f.read()
            logger.debug("Read file: {} ({} bytes)", args["path"], len(content))
            return json.dumps({"path": args["path"], "content": content})
        except Exception as e:
            return json.dumps({"error": str(e)})


class WriteFileTool(Tool):
    name = "write_file"
    description = "Write content to a file. For agents with a worktree, path is relative to worktree. For Steward, use absolute paths within allowed paths."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "File path (relative to worktree, or absolute for Steward)",
            },
            "content": {
                "type": "string",
                "description": "File content to write",
            },
        },
        "required": ["path", "content"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        full_path = _resolve_path(agent, args["path"])
        if full_path is None:
            return json.dumps({"error": "Path access denied or invalid path"})

        if not check_write_access(agent.config.permissions, full_path):
            return json.dumps({"error": "Write access denied"})

        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(args["content"])
            logger.debug(
                "Wrote file: {} ({} bytes)",
                args["path"],
                len(args["content"]),
            )
            return json.dumps({"status": "written", "path": args["path"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

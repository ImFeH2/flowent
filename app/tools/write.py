from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.sandbox import VIRTUAL_ROOT, resolve_path
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class WriteTool(Tool):
    name = "write"
    description = "Write content to a file."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": f"Relative path within the repository or Absolute path starting with {VIRTUAL_ROOT}",
            },
            "content": {
                "type": "string",
                "description": "File content to write",
            },
        },
        "required": ["path", "content"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        try:
            real_path = resolve_path(agent, args["path"])
        except PermissionError as e:
            return json.dumps({"error": str(e)})

        try:
            real_path.parent.mkdir(parents=True, exist_ok=True)
            with open(real_path, "w", encoding="utf-8") as f:
                f.write(args["content"])
            logger.debug(
                "Wrote file: {} ({} bytes)",
                args["path"],
                len(args["content"]),
            )
            return json.dumps({"status": "written", "path": args["path"]})
        except Exception as e:
            return json.dumps({"error": str(e)})

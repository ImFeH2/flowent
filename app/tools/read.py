from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.sandbox import VIRTUAL_ROOT, resolve_path
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ReadTool(Tool):
    name = "read"
    description = "Read a file or list a directory."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": f"Relative path within the repository or Absolute path starting with {VIRTUAL_ROOT}",
            },
        },
        "required": ["path"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        try:
            real_path = resolve_path(agent, args["path"])
        except PermissionError as e:
            return json.dumps({"error": str(e)})

        if real_path.is_dir():
            try:
                entries = []
                for entry in sorted(os.listdir(real_path)):
                    full = real_path / entry
                    kind = "dir" if full.is_dir() else "file"
                    size = full.stat().st_size if kind == "file" else None
                    entries.append({"name": entry, "type": kind, "size": size})
                logger.debug(
                    "Listed directory: {} ({} entries)", args["path"], len(entries)
                )
                return json.dumps({"path": args["path"], "entries": entries})
            except Exception as e:
                return json.dumps({"error": str(e)})

        if real_path.is_file():
            try:
                with open(real_path, encoding="utf-8") as f:
                    content = f.read()
                logger.debug("Read file: {} ({} bytes)", args["path"], len(content))
                return json.dumps({"path": args["path"], "content": content})
            except Exception as e:
                return json.dumps({"error": str(e)})

        return json.dumps({"error": f"Not found: {args['path']}"})

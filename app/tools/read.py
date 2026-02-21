from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ReadTool(Tool):
    name = "read"
    description = (
        "Read a file with line numbers, or list a directory. "
        "Use start_line and end_line to read a specific range (1-indexed, inclusive). "
        "Line numbers in the output are used as input to the edit tool."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to the file or directory to read",
            },
            "start_line": {
                "type": "integer",
                "description": "First line to read (1-indexed, inclusive). Defaults to 1.",
            },
            "end_line": {
                "type": "integer",
                "description": "Last line to read (1-indexed, inclusive). Defaults to end of file.",
            },
        },
        "required": ["path"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        path_str = args["path"]
        real_path = Path(path_str)

        if real_path.is_dir():
            try:
                entries = []
                for entry in sorted(os.listdir(real_path)):
                    full = real_path / entry
                    kind = "dir" if full.is_dir() else "file"
                    size = full.stat().st_size if kind == "file" else None
                    entries.append({"name": entry, "type": kind, "size": size})
                logger.debug(
                    "Listed directory: {} ({} entries)", path_str, len(entries)
                )
                return json.dumps({"path": path_str, "entries": entries})
            except Exception as e:
                return json.dumps({"error": str(e)})

        if real_path.is_file():
            try:
                with open(real_path, encoding="utf-8") as f:
                    lines = f.readlines()

                total_lines = len(lines)
                start = max(1, int(args.get("start_line", 1)))
                end = min(total_lines, int(args.get("end_line", total_lines)))

                selected = lines[start - 1 : end]
                width = len(str(total_lines))
                numbered = "".join(
                    f"{start + i:{width}d}\t{line}" for i, line in enumerate(selected)
                )

                logger.debug(
                    "Read file: {} (lines {}-{} of {})",
                    path_str,
                    start,
                    end,
                    total_lines,
                )
                return json.dumps(
                    {
                        "path": path_str,
                        "total_lines": total_lines,
                        "start_line": start,
                        "end_line": end,
                        "content": numbered,
                    }
                )
            except Exception as e:
                return json.dumps({"error": str(e)})

        return json.dumps({"error": f"Not found: {path_str}"})

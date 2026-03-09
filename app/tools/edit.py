from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.sandbox import is_path_writable
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class EditTool(Tool):
    name = "edit"
    description = (
        "Replace a range of lines in a file with new content. "
        "Use the read tool first to get the exact line numbers. "
        "start_line and end_line are 1-indexed and inclusive. "
        "new_content replaces those lines exactly as given (include a trailing newline if needed). "
        "To insert without removing, set start_line and end_line to the same line number and "
        "provide new_content that includes that original line plus the inserted lines. "
        "To delete lines, set new_content to an empty string. "
        "If the file does not exist it will be created."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to the file to edit or create",
            },
            "start_line": {
                "type": "integer",
                "description": "First line to replace (1-indexed, inclusive). Use 1 for a new file.",
            },
            "end_line": {
                "type": "integer",
                "description": "Last line to replace (1-indexed, inclusive).",
            },
            "new_content": {
                "type": "string",
                "description": "Replacement text for the specified line range. Use an empty string to delete lines.",
            },
        },
        "required": ["path", "start_line", "end_line", "new_content"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        path_str = args["path"]
        real_path = Path(path_str)

        write_dirs = agent.config.write_dirs
        if not write_dirs:
            return json.dumps({"error": "Write access is disabled for this agent"})
        if not is_path_writable(real_path, write_dirs):
            return json.dumps({"error": f"Path not in write_dirs: {path_str}"})

        try:
            start_line = int(args["start_line"])
            end_line = int(args["end_line"])
            new_content: str = args["new_content"]

            if start_line < 1:
                return json.dumps({"error": "start_line must be >= 1"})
            if end_line < start_line:
                return json.dumps({"error": "end_line must be >= start_line"})

            if not real_path.exists():
                os.makedirs(real_path.parent, exist_ok=True)
                real_path.write_text("", encoding="utf-8")

            with open(real_path, encoding="utf-8") as f:
                lines = f.readlines()

            total_lines = len(lines)
            if start_line > total_lines + 1:
                return json.dumps(
                    {
                        "error": f"start_line {start_line} exceeds file length {total_lines}"
                    }
                )

            end_line = min(end_line, total_lines)

            replacement = []
            if new_content:
                replacement = new_content.splitlines(keepends=True)
                if replacement and not replacement[-1].endswith("\n"):
                    replacement[-1] += "\n"

            new_lines = lines[: start_line - 1] + replacement + lines[end_line:]

            with open(real_path, "w", encoding="utf-8") as f:
                f.writelines(new_lines)

            logger.debug(
                "Edited file: {} (lines {}-{} replaced with {} lines)",
                path_str,
                start_line,
                end_line,
                len(replacement),
            )
            return json.dumps(
                {
                    "status": "edited",
                    "path": path_str,
                    "replaced_lines": f"{start_line}-{end_line}",
                    "new_line_count": len(new_lines),
                }
            )
        except Exception as e:
            return json.dumps({"error": str(e)})

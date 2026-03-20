from __future__ import annotations

import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class EditTool(Tool):
    name = "edit"
    description = (
        "Apply one or more line-based edits to a file in order. "
        "Use the read tool first to get the exact line numbers. "
        "Each edit uses 1-indexed inclusive start_line and end_line. "
        "new_content replaces those lines exactly as given (include a trailing newline if needed). "
        "If the file does not exist it will be created."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to the file to edit or create",
            },
            "edits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
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
                    "required": ["start_line", "end_line", "new_content"],
                },
                "description": "Edits to apply in order. Later line numbers are based on the file state after earlier edits.",
            },
        },
        "required": ["path", "edits"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        path_str = args["path"]
        real_path = Path(path_str)
        on_output: Callable[[str], None] | None = kwargs.get("on_output")

        try:
            edits = args["edits"]
            if not isinstance(edits, list):
                return json.dumps({"error": "edits must be an array"})

            if not real_path.exists():
                os.makedirs(real_path.parent, exist_ok=True)
                real_path.write_text("", encoding="utf-8")
                if on_output is not None:
                    on_output(f"Created {path_str}\n")

            with open(real_path, encoding="utf-8") as f:
                lines = f.readlines()

            applied_edits: list[dict[str, int | str]] = []
            for index, raw_edit in enumerate(edits, start=1):
                if not isinstance(raw_edit, dict):
                    return json.dumps({"error": "each edit must be an object"})

                start_line = int(raw_edit["start_line"])
                end_line = int(raw_edit["end_line"])
                new_content: str = raw_edit["new_content"]

                if start_line < 1:
                    return json.dumps({"error": "start_line must be >= 1"})
                if end_line < start_line:
                    return json.dumps({"error": "end_line must be >= start_line"})

                total_lines = len(lines)
                if start_line > total_lines + 1:
                    return json.dumps(
                        {
                            "error": f"start_line {start_line} exceeds file length {total_lines}"
                        }
                    )

                current_end_line = min(end_line, total_lines)
                if on_output is not None:
                    on_output(
                        f"Applying edit {index}/{len(edits)} at lines {start_line}-{current_end_line}\n"
                    )

                replacement = []
                if new_content:
                    replacement = new_content.splitlines(keepends=True)
                    if replacement and not replacement[-1].endswith("\n"):
                        replacement[-1] += "\n"

                lines = lines[: start_line - 1] + replacement + lines[current_end_line:]
                applied_edits.append(
                    {
                        "start_line": start_line,
                        "end_line": current_end_line,
                        "replacement_line_count": len(replacement),
                    }
                )

            with open(real_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            if on_output is not None:
                on_output(f"Wrote {path_str}\n")

            logger.debug(
                "Edited file: {} ({} edit(s), new_line_count={})",
                path_str,
                len(applied_edits),
                len(lines),
            )
            return json.dumps(
                {
                    "status": "edited",
                    "path": path_str,
                    "applied_edits": applied_edits,
                    "new_line_count": len(lines),
                }
            )
        except Exception as e:
            return json.dumps({"error": str(e)})

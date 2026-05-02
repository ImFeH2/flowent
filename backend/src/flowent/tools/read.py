from __future__ import annotations

import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from flowent.tools import Tool, re_raise_interrupt

if TYPE_CHECKING:
    from flowent.agent import Agent


def _append_stream_chunk(
    buffer: list[str],
    size: int,
    text: str,
    on_output: Callable[[str], None] | None,
) -> int:
    if on_output is None or not text:
        return size
    buffer.append(text)
    size += len(text)
    if size >= 2048:
        on_output("".join(buffer))
        buffer.clear()
        return 0
    return size


def _flush_stream_chunk(
    buffer: list[str], on_output: Callable[[str], None] | None
) -> None:
    if on_output is None or not buffer:
        return
    on_output("".join(buffer))
    buffer.clear()


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

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        path_str = args["path"]
        real_path = Path(path_str)
        on_output: Callable[[str], None] | None = kwargs.get("on_output")

        if real_path.is_dir():
            try:
                entries = []
                stream_buffer: list[str] = []
                stream_size = 0
                for entry in sorted(os.listdir(real_path)):
                    full = real_path / entry
                    kind = "dir" if full.is_dir() else "file"
                    size = full.stat().st_size if kind == "file" else None
                    entries.append({"name": entry, "type": kind, "size": size})
                    label = f"{kind}\t{entry}"
                    if size is not None:
                        label = f"{label}\t{size}"
                    stream_size = _append_stream_chunk(
                        stream_buffer,
                        stream_size,
                        f"{label}\n",
                        on_output,
                    )
                _flush_stream_chunk(stream_buffer, on_output)
                logger.debug(
                    "Listed directory: {} ({} entries)", path_str, len(entries)
                )
                return json.dumps({"path": path_str, "entries": entries})
            except Exception as e:
                re_raise_interrupt(agent, e)
                return json.dumps({"error": str(e)})

        if real_path.is_file():
            try:
                with open(real_path, encoding="utf-8") as f:
                    total_lines = sum(1 for _ in f)

                start = max(1, int(args.get("start_line", 1)))
                end = min(total_lines, int(args.get("end_line", total_lines)))
                width = max(6, len(str(total_lines)))
                selected_parts: list[str] = []
                stream_buffer = []
                stream_size = 0

                with open(real_path, encoding="utf-8") as f:
                    for line_number, line in enumerate(f, start=1):
                        if line_number < start:
                            continue
                        if line_number > end:
                            break
                        numbered_line = f"{line_number:{width}d}\t{line}"
                        selected_parts.append(numbered_line)
                        stream_size = _append_stream_chunk(
                            stream_buffer,
                            stream_size,
                            numbered_line,
                            on_output,
                        )

                _flush_stream_chunk(stream_buffer, on_output)
                numbered = "".join(selected_parts)

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
                re_raise_interrupt(agent, e)
                return json.dumps({"error": str(e)})

        return json.dumps({"error": f"Not found: {path_str}"})

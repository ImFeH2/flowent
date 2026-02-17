from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.sandbox import VIRTUAL_ROOT, resolve_path
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class EditTool(Tool):
    name = "edit"
    description = "Apply a unified diff patch to a file."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": f"Relative path within the repository or Absolute path starting with {VIRTUAL_ROOT}",
            },
            "patch": {
                "type": "string",
                "description": "Unified diff patch content",
            },
        },
        "required": ["path", "patch"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        try:
            real_path = resolve_path(agent, args["path"])
        except PermissionError as e:
            return json.dumps({"error": str(e)})

        if not real_path.is_file():
            return json.dumps({"error": f"File not found: {args['path']}"})

        patch_content = args["patch"]

        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".patch", delete=False
            ) as tmp:
                tmp.write(patch_content)
                tmp_path = tmp.name

            result = subprocess.run(
                ["patch", "--forward", "--no-backup-if-mismatch", real_path, tmp_path],
                capture_output=True,
                text=True,
                timeout=10,
            )

            os.unlink(tmp_path)

            if result.returncode == 0:
                logger.debug("Applied patch to: {}", args["path"])
                return json.dumps(
                    {
                        "status": "patched",
                        "path": args["path"],
                        "output": result.stdout[:1000],
                    }
                )
            return json.dumps(
                {
                    "error": "Patch failed",
                    "stdout": result.stdout[:1000],
                    "stderr": result.stderr[:1000],
                }
            )
        except Exception as e:
            return json.dumps({"error": str(e)})

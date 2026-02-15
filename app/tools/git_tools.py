from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class MergeBranchTool(Tool):
    name = "merge_branch"
    description = "Merge a child agent's branch into the current worktree's branch."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "branch_name": {
                "type": "string",
                "description": "Branch name to merge (e.g. agent/<uuid>)",
            },
        },
        "required": ["branch_name"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app import git

        branch_name = args["branch_name"]
        worktree_path = agent.config.worktree_path
        if not worktree_path:
            return json.dumps({"error": "No worktree configured for this agent"})

        logger.info("Agent {} merging branch {}", agent.uuid[:8], branch_name)
        result = git.merge_branch(worktree_path, branch_name)
        if result.success:
            return json.dumps({"status": "merged", "message": result.message})

        return json.dumps(
            {
                "status": "conflict",
                "conflict_files": result.conflict_files,
                "message": result.message,
                "instruction": "Resolve conflicts using write_file, then the merge will auto-complete on next commit.",
            },
        )

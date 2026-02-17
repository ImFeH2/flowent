from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class MergeTool(Tool):
    name = "merge"
    description = (
        "Merge a child agent's branch into this agent's worktree. "
        "If the worktree is in a conflict state (from a previous merge), "
        "this will stage all changes and continue the merge."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "agent_id": {
                "type": "string",
                "description": "UUID of the child agent whose branch to merge",
            },
            "message": {
                "type": "string",
                "description": "Merge commit message",
            },
        },
        "required": ["agent_id", "message"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app import git

        agent_id = args["agent_id"]
        message = args["message"]
        worktree_path = agent.config.worktree_path
        if not worktree_path:
            return json.dumps({"error": "No worktree configured for this agent"})

        merge_head = worktree_path / ".git" / "MERGE_HEAD"
        is_merge_head_file = merge_head.is_file()

        if not is_merge_head_file:
            git_dir = self._find_git_dir(worktree_path)
            if git_dir:
                merge_head = git_dir / "MERGE_HEAD"
                is_merge_head_file = merge_head.is_file()

        if is_merge_head_file:
            logger.info("Agent {} continuing merge (MERGE_HEAD found)", agent.uuid[:8])
            try:
                git.complete_merge(worktree_path, message)
                return json.dumps(
                    {"status": "merged", "message": "Merge continued and completed"}
                )
            except Exception as e:
                return json.dumps({"error": f"Failed to continue merge: {e}"})

        branch_name = git.get_branch_name(agent_id)
        logger.info("Agent {} merging branch {}", agent.uuid[:8], branch_name)
        result = git.merge_branch(worktree_path, branch_name)
        if result.success:
            return json.dumps({"status": "merged", "message": result.message})

        return json.dumps(
            {
                "status": "conflict",
                "conflict_files": result.conflict_files,
                "message": result.message,
                "instruction": "Resolve conflicts using write tool, then call merge again to continue.",
            }
        )

    @staticmethod
    def _find_git_dir(worktree_path: Path) -> Path | None:
        git_path = worktree_path / ".git"
        if git_path.is_dir():
            return git_path
        if git_path.is_file():
            with open(git_path) as f:
                content = f.read().strip()
            if content.startswith("gitdir: "):
                return worktree_path / content[len("gitdir: ") :]
        return None

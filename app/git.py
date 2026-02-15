from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass

from loguru import logger


@dataclass
class MergeResult:
    success: bool
    conflict_files: list[str] | None = None
    message: str = ""


def _run(cmd: list[str], cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    logger.debug("git cmd: {} (cwd={})", " ".join(cmd), cwd)
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True)


def create_worktree(
    repo_path: str,
    agent_uuid: str,
    parent_branch: str = "main",
) -> str:
    branch_name = f"agent/{agent_uuid}"
    worktrees_dir = os.path.join(repo_path, "worktrees")
    worktree_path = os.path.join(worktrees_dir, agent_uuid)
    os.makedirs(worktrees_dir, exist_ok=True)
    _run(
        ["git", "worktree", "add", "-b", branch_name, worktree_path, parent_branch],
        cwd=repo_path,
    )
    logger.info("Created worktree {} on branch {}", worktree_path, branch_name)
    return worktree_path


def remove_worktree(repo_path: str, agent_uuid: str) -> None:
    worktree_path = os.path.join(repo_path, "worktrees", agent_uuid)
    try:
        _run(["git", "worktree", "remove", "--force", worktree_path], cwd=repo_path)
        logger.info("Removed worktree {}", worktree_path)
    except subprocess.CalledProcessError as e:
        logger.warning("Failed to remove worktree {}: {}", worktree_path, e.stderr)


def commit_all(worktree_path: str, message: str) -> str | None:
    try:
        _run(["git", "add", "-A"], cwd=worktree_path)
        status = _run(["git", "status", "--porcelain"], cwd=worktree_path)
        if not status.stdout.strip():
            return None
        _run(["git", "commit", "-m", message], cwd=worktree_path)
        result = _run(["git", "rev-parse", "HEAD"], cwd=worktree_path)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        logger.error("Commit failed: {}", e.stderr)
        raise


def merge_branch(worktree_path: str, branch_name: str) -> MergeResult:
    logger.info("Merging branch {} into {}", branch_name, worktree_path)
    try:
        _run(["git", "merge", branch_name, "--no-ff"], cwd=worktree_path)
        return MergeResult(success=True, message="Merge completed successfully")
    except subprocess.CalledProcessError:
        result = _run(
            ["git", "diff", "--name-only", "--diff-filter=U"],
            cwd=worktree_path,
        )
        conflict_files = [f for f in result.stdout.strip().split("\n") if f]
        logger.warning(
            "Merge conflict in {} file(s): {}",
            len(conflict_files),
            conflict_files,
        )
        return MergeResult(
            success=False,
            conflict_files=conflict_files,
            message=f"Merge conflict in {len(conflict_files)} file(s)",
        )


def complete_merge(worktree_path: str, message: str) -> None:
    _run(["git", "add", "-A"], cwd=worktree_path)
    _run(["git", "commit", "-m", message], cwd=worktree_path)


def get_branch_name(agent_uuid: str) -> str:
    return f"agent/{agent_uuid}"


def delete_branch(repo_path: str, branch_name: str) -> None:
    try:
        _run(["git", "branch", "-D", branch_name], cwd=repo_path)
    except subprocess.CalledProcessError as e:
        logger.warning("Failed to delete branch {}: {}", branch_name, e.stderr)

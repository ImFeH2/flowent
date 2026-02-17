from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.agent import Agent
from app.models import AgentConfig, Role
from app.registry import registry

router = APIRouter()


class CreateStewardRequest(BaseModel):
    repo_path: Path
    name: str = "Steward"
    branch: str = "main"
    commit: str | None = None


@router.post("/api/stewards")
async def create_steward(req: CreateStewardRequest) -> dict:
    from app import git

    repo_path = req.repo_path
    if not (repo_path / ".git").is_dir():
        raise HTTPException(status_code=400, detail="Not a git repository")

    import uuid

    steward_uuid = str(uuid.uuid4())
    base = req.commit or req.branch
    worktree_path = git.create_worktree(repo_path, steward_uuid, parent_branch=base)

    config = AgentConfig(
        role=Role.STEWARD,
        repo_path=repo_path,
        worktree_path=worktree_path,
        name=req.name,
    )

    steward = Agent(config=config, uuid=steward_uuid)
    registry.register(steward)
    steward.start()

    logger.info("Steward created: {} for repo {}", steward.uuid[:8], repo_path)
    return {
        "id": steward.uuid,
        "name": req.name,
        "repo_path": repo_path,
        "worktree_path": worktree_path,
    }


@router.get("/api/stewards")
async def list_stewards() -> dict:
    stewards = registry.get_stewards()
    return {
        "stewards": [
            {
                "id": s.uuid,
                "name": s.config.name,
                "repo_path": s.config.repo_path,
                "state": s.state.value,
            }
            for s in stewards
        ],
    }


@router.post("/api/agents/{agent_id}/merge-to-main")
async def merge_to_main(agent_id: str) -> dict:
    from app import git

    agent = registry.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    repo_path = agent.config.repo_path
    if not repo_path:
        raise HTTPException(status_code=400, detail="No repo_path configured")

    branch_name = git.get_branch_name(agent_id)
    result = git.merge_branch(repo_path, branch_name)
    if result.success:
        return {"status": "merged", "message": result.message}

    raise HTTPException(
        status_code=409,
        detail={
            "status": "conflict",
            "conflict_files": result.conflict_files,
            "message": result.message,
        },
    )


class BranchListQuery(BaseModel):
    repo: Path


@router.get("/api/git/branches")
async def list_branches(repo: Path) -> dict:
    repo_path = repo
    if not (repo_path / ".git").is_dir():
        raise HTTPException(status_code=400, detail="Not a git repository")

    try:
        result = subprocess.run(
            ["git", "branch", "--format=%(refname:short)"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        branches = [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]
        return {"branches": branches}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=str(e.stderr)) from e


@router.get("/api/git/commits")
async def list_commits(repo: Path, branch: str = "main", limit: int = 20) -> dict:
    repo_path = repo
    if not (repo_path / ".git").is_dir():
        raise HTTPException(status_code=400, detail="Not a git repository")

    try:
        result = subprocess.run(
            [
                "git",
                "log",
                branch,
                f"--max-count={limit}",
                "--format=%H|%s|%an|%ai",
            ],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        commits = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|", 3)
            if len(parts) >= 4:
                commits.append(
                    {
                        "sha": parts[0],
                        "message": parts[1],
                        "author": parts[2],
                        "date": parts[3],
                    }
                )
        return {"commits": commits}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=str(e.stderr)) from e

from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.models import AgentConfig, Message, Role
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Create a new child agent (Supervisor or Worker). "
        "The agent is created and started, then task_prompt is sent as the first message."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "role": {
                "type": "string",
                "enum": ["supervisor", "worker"],
                "description": "Role of the new agent",
            },
            "task_prompt": {
                "type": "string",
                "description": "Task description sent as the initial message to the new agent",
            },
            "name": {
                "type": "string",
                "description": "Human-readable name for the agent (optional)",
            },
            "network_access": {
                "type": "boolean",
                "description": "Whether the child agent needs network access (default false)",
            },
        },
        "required": ["role", "task_prompt"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app import git
        from app.agent import Agent as AgentClass
        from app.registry import registry

        role = Role(args["role"])
        task_prompt = args["task_prompt"]

        repo_path = agent.config.repo_path
        if not repo_path:
            return json.dumps(
                {"error": "No repo_path configured for worktree creation"}
            )

        agent_uuid = str(uuid.uuid4())
        worktree_path = git.create_worktree(repo_path, agent_uuid)

        config = AgentConfig(
            role=role,
            repo_path=repo_path,
            worktree_path=worktree_path,
            supervisor_id=agent.uuid,
            name=args.get("name"),
            network_access=args.get("network_access", False),
        )

        child = AgentClass(uuid=agent_uuid, config=config)
        registry.register(child)
        agent.children_ids.append(agent_uuid)
        child.start()

        msg = Message(from_id=agent.uuid, to_id=agent_uuid, content=task_prompt)
        child.enqueue_message(msg)

        logger.info(
            "Spawned {} agent {} by {}",
            role.value,
            agent_uuid[:8],
            agent.uuid[:8],
        )

        return json.dumps(
            {
                "agent_id": agent_uuid,
                "role": role.value,
            }
        )

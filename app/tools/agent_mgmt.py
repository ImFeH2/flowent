from __future__ import annotations

import copy
import json
import uuid
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.models import AgentConfig, Message, Permissions, Role, TestSuite
from app.tools import Tool, default_permissions

if TYPE_CHECKING:
    from app.agent import Agent


def _apply_permission_delta(base: Permissions, delta: dict[str, Any]) -> Permissions:
    if "allowed_paths" in delta:
        base.allowed_paths.extend(delta["allowed_paths"])
    if "blocked_paths" in delta:
        base.blocked_paths.extend(delta["blocked_paths"])
    if "writable_paths" in delta:
        base.writable_paths.extend(delta["writable_paths"])
    if "allowed_commands" in delta:
        base.allowed_commands = list(delta["allowed_commands"])
    if "network_access" in delta:
        base.network_access = delta["network_access"]
    return base


class SpawnAgentTool(Tool):
    name = "spawn_agent"
    description = (
        "Create a new child agent (Supervisor or Worker). "
        "The agent is created and started, then task_prompt is sent as the first message from you to drive it."
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
            "test_scripts": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Python test scripts for validation (optional)",
            },
            "name": {
                "type": "string",
                "description": "Human-readable name for the agent (optional)",
            },
            "permission_delta": {
                "type": "object",
                "description": "Permission overrides for the child agent",
                "properties": {
                    "allowed_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Additional paths to allow reading",
                    },
                    "blocked_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Paths to block",
                    },
                    "writable_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Additional paths to allow writing",
                    },
                    "allowed_commands": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Command glob patterns (e.g. 'python *', 'npm *')",
                    },
                    "network_access": {
                        "type": "boolean",
                        "description": "Whether to allow network requests",
                    },
                },
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
        test_scripts = args.get("test_scripts", [])

        permissions = default_permissions(role)

        parent_perms = agent.config.permissions
        permissions.allowed_paths = copy.deepcopy(parent_perms.allowed_paths)
        permissions.blocked_paths = copy.deepcopy(parent_perms.blocked_paths)

        delta = args.get("permission_delta", {})
        _apply_permission_delta(permissions, delta)

        repo_path = (
            parent_perms.allowed_paths[0] if parent_perms.allowed_paths else None
        )
        if not repo_path:
            return json.dumps(
                {"error": "No allowed path configured for worktree creation"},
            )

        agent_uuid = str(uuid.uuid4())
        parent_branch = agent.config.branch or "main"
        worktree_path = git.create_worktree(repo_path, agent_uuid, parent_branch)
        branch = git.get_branch_name(agent_uuid)

        permissions.allowed_paths.append(worktree_path)
        permissions.writable_paths.append(worktree_path)

        config = AgentConfig(
            task_prompt=task_prompt,
            role=role,
            permissions=permissions,
            testsuite=TestSuite(scripts=test_scripts),
            supervisor_id=agent.uuid,
            worktree_path=worktree_path,
            branch=branch,
            name=args.get("name"),
        )

        child = AgentClass(uuid=agent_uuid, config=config, provider=agent.provider)
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
                "branch": branch,
                "worktree_path": worktree_path,
            },
        )


class UpdateChildPermissionsTool(Tool):
    name = "update_child_permissions"
    description = "Update permissions of a direct child agent. Paths are extended, allowed_commands and network_access are overwritten."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "agent_id": {
                "type": "string",
                "description": "UUID of the child agent to update",
            },
            "delta": {
                "type": "object",
                "description": "Permission changes to apply (same format as spawn permission_delta)",
                "properties": {
                    "allowed_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "blocked_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "writable_paths": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "allowed_commands": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "network_access": {
                        "type": "boolean",
                    },
                },
            },
        },
        "required": ["agent_id", "delta"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        target_id = args["agent_id"]
        if target_id not in agent.children_ids:
            return json.dumps({"error": "Target agent is not a direct child"})

        target = registry.get(target_id)
        if target is None:
            return json.dumps({"error": "Target agent not found"})

        delta = args.get("delta", {})
        _apply_permission_delta(target.config.permissions, delta)

        target.inject_system_message(
            f"Your permissions have been updated by your supervisor. Current permissions: {json.dumps(asdict(target.config.permissions))}",
        )

        logger.info("Updated permissions for {} by {}", target_id[:8], agent.uuid[:8])

        return json.dumps(
            {
                "status": "updated",
                "agent_id": target_id,
                "permissions": asdict(target.config.permissions),
            },
        )


class ListAgentsTool(Tool):
    name = "list_agents"
    description = "List all agents in the system with their hierarchy, state, and status description."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        all_agents = registry.get_all()
        agent_map: dict[str, Agent] = {a.uuid: a for a in all_agents}

        roots = [a for a in all_agents if a.config.supervisor_id is None]

        lines: list[str] = []
        for root in roots:
            self._render(root, agent_map, lines, indent=0)

        return "\n".join(lines) if lines else "(no agents)"

    def _render(
        self,
        agent: Agent,
        agent_map: dict[str, Any],
        lines: list[str],
        indent: int,
    ) -> None:
        prefix = "  " * indent
        name_part = f" ({agent.config.name})" if agent.config.name else ""
        status_part = (
            f'  "{agent.status_description}"' if agent.status_description else ""
        )
        lines.append(
            f"{prefix}- {agent.uuid[:8]} [{agent.config.role.value}] {agent.state.value}{name_part}{status_part}",
        )
        for child_id in agent.children_ids:
            child = agent_map.get(child_id)
            if child:
                self._render(child, agent_map, lines, indent + 1)


class SetStatusTool(Tool):
    name = "set_status"
    description = (
        "Update your status description to indicate what you are currently doing."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "description": "A short description of your current activity",
            },
        },
        "required": ["status"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        agent.status_description = args["status"]
        from app.events import event_bus
        from app.models import Event, EventType

        event_bus.emit(
            Event(
                type=EventType.AGENT_STATE_CHANGED,
                agent_id=agent.uuid,
                data={
                    "old_state": agent.state.value,
                    "new_state": agent.state.value,
                    "status_description": agent.status_description,
                },
            ),
        )
        return json.dumps(
            {"status": "updated", "description": agent.status_description},
        )


class ExitTool(Tool):
    name = "exit"
    description = "Terminate this agent. Use after completing all work."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "reason": {"type": "string", "description": "Reason for exiting"},
        },
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        reason = args.get("reason", "Task completed")
        logger.info("Agent {} exiting: {}", agent.uuid[:8], reason)
        agent.request_termination(reason)
        return json.dumps({"status": "terminating", "reason": reason})

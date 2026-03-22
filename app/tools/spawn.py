from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.formation_runtime import connect_nodes
from app.models import Formation, NodeConfig, NodeType
from app.tools import MINIMUM_TOOLS, Tool

if TYPE_CHECKING:
    from app.agent import Agent


@dataclass
class PreparedSpawn:
    agent_uuid: str
    config: NodeConfig

    def serialize(self) -> dict[str, str]:
        return {
            "agent_id": self.agent_uuid,
            "name": self.config.name or self.config.role_name or "Agent",
            "formation_id": self.config.formation_id or "",
            "role_name": self.config.role_name or "",
        }


def prepare_spawn(
    agent: Agent,
    args: dict[str, Any],
    *,
    formation: Formation | None = None,
) -> tuple[PreparedSpawn | None, str | None]:
    from app.registry import registry
    from app.settings import find_role, get_settings

    role_name = args.get("role_name")
    name = args.get("name")
    tools = args.get("tools", [])
    write_dirs = args.get("write_dirs", [])
    allow_network = args.get("allow_network", False)
    formation_id = args.get("formation_id")

    if not isinstance(role_name, str) or not role_name.strip():
        return None, "role_name must be a non-empty string"
    if name is not None and not isinstance(name, str):
        return None, "name must be a string"
    if not isinstance(tools, list) or not all(
        isinstance(tool_name, str) for tool_name in tools
    ):
        return None, "tools must be an array of strings"
    if not isinstance(write_dirs, list) or not all(
        isinstance(path, str) for path in write_dirs
    ):
        return None, "write_dirs must be an array of strings"
    if not isinstance(allow_network, bool):
        return None, "allow_network must be a boolean"

    normalized_role_name = role_name.strip()
    settings = get_settings()
    role_cfg = find_role(settings, normalized_role_name)
    if role_cfg is None:
        return None, f"Role '{normalized_role_name}' not found"

    if formation is None:
        if formation_id is None or formation_id == "":
            return None, "formation_id is required"
        if not isinstance(formation_id, str) or not formation_id:
            return None, "formation_id must be a non-empty string"
        target_formation = registry.get_formation(formation_id)
        if target_formation is None:
            return None, f"Formation '{formation_id}' not found"
    else:
        target_formation = formation
        formation_id = formation.id

    if target_formation.owner_agent_id != agent.uuid:
        return None, f"Formation '{formation_id}' is not managed by this agent"

    final_tools: list[str] = []
    seen_tools: set[str] = set()
    excluded_tools = set(role_cfg.excluded_tools)

    for tool_name in [*MINIMUM_TOOLS, *role_cfg.included_tools, *tools]:
        if tool_name in seen_tools:
            continue
        if tool_name in excluded_tools and tool_name not in MINIMUM_TOOLS:
            continue
        final_tools.append(tool_name)
        seen_tools.add(tool_name)

    config = NodeConfig(
        node_type=NodeType.AGENT,
        role_name=normalized_role_name,
        formation_id=formation_id,
        name=name,
        tools=final_tools,
        write_dirs=write_dirs,
        allow_network=allow_network,
        parent_id=agent.uuid,
    )

    parent_write_dirs = [Path(path).resolve() for path in agent.config.write_dirs]
    invalid_write_dirs = sorted(
        path
        for path in config.write_dirs
        if not any(
            Path(path).resolve().is_relative_to(parent_path)
            for parent_path in parent_write_dirs
        )
    )
    if invalid_write_dirs:
        return (
            None,
            "write_dirs boundary exceeded: " + ", ".join(invalid_write_dirs),
        )

    if config.allow_network and not agent.config.allow_network:
        return (
            None,
            "allow_network boundary exceeded: parent disallows network access",
        )

    return PreparedSpawn(agent_uuid=str(uuid.uuid4()), config=config), None


def spawn_prepared_agent(
    agent: Agent,
    prepared: PreparedSpawn,
):
    from app.agent import Agent as AgentClass
    from app.registry import registry

    child = AgentClass(uuid=prepared.agent_uuid, config=prepared.config)

    registered = False
    connected = False
    started = False

    try:
        registry.register(child)
        registered = True

        child.start()
        started = True

        connect_nodes(agent.uuid, prepared.agent_uuid)
        connect_nodes(prepared.agent_uuid, agent.uuid)
        connected = True
    except Exception as exc:
        logger.exception(
            "Failed to spawn agent {} (role={}) by {}",
            prepared.agent_uuid[:8],
            prepared.config.role_name,
            agent.uuid[:8],
        )

        if started:
            child.terminate_and_wait(timeout=30.0)
        if registered:
            registry.unregister(prepared.agent_uuid)
        if connected:
            agent.remove_connection(prepared.agent_uuid)
            child.remove_connection(agent.uuid)

        raise RuntimeError(f"Failed to spawn agent: {exc}") from exc

    logger.info(
        "Spawned agent {} (role={}, formation={}) by {}",
        prepared.agent_uuid[:8],
        prepared.config.role_name,
        (prepared.config.formation_id or "")[:8],
        agent.uuid[:8],
    )

    return child, prepared.serialize()


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Create a new agent node with a specific role. "
        "This is a low-cost delegation mechanism: you may create specialized agents whenever parallelism or task handoff would help. "
        "If the work is outside your role, expertise, or ownership, spawning a better-suited agent should usually be your first move. "
        "Once you determine that spawning is the better path, do it directly instead of asking the Human for permission, unless the spawn would enable destructive work, material extra cost, or elevated permissions. "
        "The agent is created and connected to the spawner. formation_id is required, and the caller must own that formation. To assign a task, send a message after spawning."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "role_name": {
                "type": "string",
                "description": "Name of the Role to assign to the new agent",
            },
            "name": {
                "type": "string",
                "description": "Human-readable name for the agent (optional)",
            },
            "tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of additional tool names to give the agent",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of directories the agent can write to",
            },
            "allow_network": {
                "type": "boolean",
                "description": "Whether the agent can access the network",
                "default": False,
            },
            "formation_id": {
                "type": "string",
                "description": "ID of the Formation to spawn the node into. The caller must be the owner of this Formation.",
            },
        },
        "required": ["role_name", "formation_id"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        prepared, error = prepare_spawn(agent, args)
        if error is not None:
            return json.dumps({"error": error})

        assert prepared is not None

        try:
            _child, result = spawn_prepared_agent(agent, prepared)
        except RuntimeError as exc:
            return json.dumps({"error": str(exc)})

        return json.dumps(result)

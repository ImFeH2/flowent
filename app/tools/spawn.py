from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.graph_runtime import connect_nodes
from app.models import NodeConfig, NodeType
from app.tools import MINIMUM_TOOLS, Tool

if TYPE_CHECKING:
    from app.agent import Agent


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Create a new agent node with a specific role. "
        "This is a low-cost delegation mechanism: you may create specialized agents whenever parallelism or task handoff would help. "
        "If the work is outside your role, expertise, or ownership, spawning a better-suited agent should usually be your first move. "
        "Once you determine that spawning is the better path, do it directly instead of asking the Human for permission, unless the spawn would enable destructive work, material extra cost, or elevated permissions. "
        "The agent is created and connected to the spawner. graph_id is required, and the caller must own that graph. To assign a task, send a message after spawning."
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
            "graph_id": {
                "type": "string",
                "description": "ID of the Graph to spawn the node into. The caller must be the owner of this Graph.",
            },
        },
        "required": ["role_name", "graph_id"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.agent import Agent as AgentClass
        from app.registry import registry
        from app.settings import find_role, get_settings

        role_name = args["role_name"]
        name = args.get("name")
        tools = args.get("tools", [])
        write_dirs = args.get("write_dirs", [])
        allow_network = args.get("allow_network", False)
        graph_id = args.get("graph_id")

        if not isinstance(tools, list) or not all(
            isinstance(tool_name, str) for tool_name in tools
        ):
            return json.dumps({"error": "tools must be an array of strings"})
        if not isinstance(write_dirs, list) or not all(
            isinstance(path, str) for path in write_dirs
        ):
            return json.dumps({"error": "write_dirs must be an array of strings"})
        if not isinstance(allow_network, bool):
            return json.dumps({"error": "allow_network must be a boolean"})

        settings = get_settings()
        role_cfg = find_role(settings, role_name)
        if role_cfg is None:
            return json.dumps({"error": f"Role '{role_name}' not found"})
        if graph_id is None or graph_id == "":
            return json.dumps({"error": "graph_id is required"})
        if not isinstance(graph_id, str) or not graph_id:
            return json.dumps({"error": "graph_id must be a non-empty string"})
        graph = registry.get_graph(graph_id)
        if graph is None:
            return json.dumps({"error": f"Graph '{graph_id}' not found"})
        if graph.owner_agent_id != agent.uuid:
            return json.dumps(
                {"error": f"Graph '{graph_id}' is not managed by this agent"}
            )

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

        agent_uuid = str(uuid.uuid4())
        config = NodeConfig(
            node_type=NodeType.AGENT,
            role_name=role_name,
            graph_id=graph_id,
            name=name,
            tools=final_tools,
            write_dirs=write_dirs,
            allow_network=allow_network,
            parent_id=agent.uuid,
        )

        if agent.config.graph_id is not None:
            parent_write_dirs = [
                Path(path).resolve() for path in agent.config.write_dirs
            ]
            invalid_write_dirs = sorted(
                path
                for path in config.write_dirs
                if not any(
                    Path(path).resolve().is_relative_to(parent_path)
                    for parent_path in parent_write_dirs
                )
            )
            if invalid_write_dirs:
                return json.dumps(
                    {
                        "error": "write_dirs boundary exceeded: "
                        + ", ".join(invalid_write_dirs)
                    }
                )

            if config.allow_network and not agent.config.allow_network:
                return json.dumps(
                    {
                        "error": "allow_network boundary exceeded: parent disallows network access"
                    }
                )

            allowed_tools = set(agent.config.tools) | set(MINIMUM_TOOLS)
            invalid_tools = sorted(
                tool_name for tool_name in final_tools if tool_name not in allowed_tools
            )
            if invalid_tools:
                return json.dumps(
                    {"error": "tool boundary exceeded: " + ", ".join(invalid_tools)}
                )

        child = AgentClass(uuid=agent_uuid, config=config)

        registered = False
        connected = False
        started = False

        try:
            registry.register(child)
            registered = True

            child.start()
            started = True

            connect_nodes(agent.uuid, agent_uuid)
            connect_nodes(agent_uuid, agent.uuid)
            connected = True
        except Exception as exc:
            logger.exception(
                "Failed to spawn agent {} (role={}) by {}",
                agent_uuid[:8],
                role_name,
                agent.uuid[:8],
            )

            if started:
                child.terminate_and_wait(timeout=30.0)
            if registered:
                registry.unregister(agent_uuid)
            if connected:
                agent.remove_connection(agent_uuid)
                child.remove_connection(agent.uuid)

            return json.dumps({"error": f"Failed to spawn agent: {exc}"})

        logger.info(
            "Spawned agent {} (role={}, graph={}) by {}",
            agent_uuid[:8],
            role_name,
            graph_id[:8],
            agent.uuid[:8],
        )

        return json.dumps(
            {
                "agent_id": agent_uuid,
                "name": name or role_name,
                "graph_id": graph_id,
                "role_name": role_name,
            }
        )

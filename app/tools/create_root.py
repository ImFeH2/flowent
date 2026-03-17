from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.graph_runtime import connect_nodes, emit_graph_created
from app.models import Graph, NodeConfig, NodeType
from app.tools import MINIMUM_TOOLS, Tool
from app.tools.send import send_message

if TYPE_CHECKING:
    from app.agent import Agent


class CreateRootTool(Tool):
    name = "create_root"
    description = (
        "Create a new entry agent in the Agent Graph. Choose the role, tools, "
        "and security boundary based on the task. Use Worker for simple "
        "execution tasks and Conductor for complex graph orchestration."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "role_name": {
                "type": "string",
                "description": "Name of the Role to assign to the new root agent",
            },
            "task": {
                "type": "string",
                "description": "Initial task sent as the first message to the new root agent",
            },
            "name": {
                "type": "string",
                "description": "Human-readable name for the root agent (optional)",
            },
            "tools": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of additional tool names to give the root agent",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of directories the root agent can write to",
            },
            "allow_network": {
                "type": "boolean",
                "description": "Whether the root agent can access the network",
                "default": False,
            },
        },
        "required": ["role_name"],
    }
    agent_visible = False

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.agent import Agent as AgentClass
        from app.registry import registry
        from app.settings import find_role, get_settings

        role_name = args["role_name"]
        task = args.get("task")
        name = args.get("name")
        tools = args.get("tools", [])
        write_dirs = args.get("write_dirs", [])
        allow_network = args.get("allow_network", False)

        if not isinstance(role_name, str):
            return json.dumps({"error": "role_name must be a string"})
        if task is not None and not isinstance(task, str):
            return json.dumps({"error": "task must be a string"})
        if name is not None and not isinstance(name, str):
            return json.dumps({"error": "name must be a string"})
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
        graph_id = str(uuid.uuid4())
        graph = Graph(
            id=graph_id,
            owner_agent_id=agent_uuid,
            parent_graph_id=None,
            name=name or role_name,
            goal=task if isinstance(task, str) else "",
            entry_node_id=agent_uuid,
        )
        child = AgentClass(
            uuid=agent_uuid,
            config=NodeConfig(
                node_type=NodeType.AGENT,
                role_name=role_name,
                graph_id=graph_id,
                name=name,
                tools=final_tools,
                write_dirs=write_dirs,
                allow_network=allow_network,
                parent_id=agent.uuid,
            ),
        )

        registered = False
        graph_registered = False
        connected = False
        started = False

        try:
            registry.register_graph(graph)
            graph_registered = True

            registry.register(child)
            registered = True

            child.start()
            started = True

            emit_graph_created(graph)

            connect_nodes(agent.uuid, agent_uuid)
            connect_nodes(agent_uuid, agent.uuid)
            connected = True

            if task:
                if not child.wait_until_idle(timeout=5.0):
                    raise TimeoutError(
                        "Root agent did not reach idle before task delivery"
                    )
                payload = send_message(agent, agent_uuid, task)
                if "error" in payload:
                    raise RuntimeError(str(payload["error"]))
        except Exception as exc:
            logger.exception(
                "Failed to create root agent {} (role={}) by {}",
                agent_uuid[:8],
                role_name,
                agent.uuid[:8],
            )

            if started:
                child.terminate_and_wait(timeout=5.0)
            if registered:
                registry.unregister(agent_uuid)
            if graph_registered:
                registry.unregister_graph(graph_id)
            if connected:
                agent.remove_connection(agent_uuid)
                child.remove_connection(agent.uuid)

            return json.dumps({"error": f"Failed to create root agent: {exc}"})

        logger.info(
            "Created root agent {} (role={}, graph={}) by {}",
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

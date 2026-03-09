from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.models import Event, EventType, NodeConfig, NodeType
from app.tools import MINIMUM_TOOLS, Tool
from app.tools.send import send_message

if TYPE_CHECKING:
    from app.agent import Agent


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Create a new agent node with a specific role. "
        "This is a low-cost delegation mechanism: you may create specialized agents whenever parallelism or task handoff would help. "
        "If the work is outside your role, expertise, or ownership, spawning a better-suited agent should usually be your first move. "
        "Once you determine that spawning is the better path, do it directly instead of asking the Human for permission, unless the spawn would enable destructive work, material extra cost, or elevated permissions. "
        "The agent is created, connected to the spawner, and task_prompt is sent as the first message after the new agent reaches idle."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "role_name": {
                "type": "string",
                "description": "Name of the Role to assign to the new agent",
            },
            "task_prompt": {
                "type": "string",
                "description": "Task description sent as the initial message to the new agent",
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
        },
        "required": ["role_name"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.agent import Agent as AgentClass
        from app.events import event_bus
        from app.registry import registry
        from app.settings import find_role, get_settings

        role_name = args["role_name"]
        task_prompt = args.get("task_prompt")
        name = args.get("name")
        tools = args.get("tools", [])
        write_dirs = args.get("write_dirs", [])

        if not isinstance(tools, list) or not all(
            isinstance(tool_name, str) for tool_name in tools
        ):
            return json.dumps({"error": "tools must be an array of strings"})

        settings = get_settings()
        role_cfg = find_role(settings, role_name)
        if role_cfg is None:
            return json.dumps({"error": f"Role '{role_name}' not found"})

        final_tools: list[str] = []
        seen_tools: set[str] = set()
        excluded_tools = set(role_cfg.excluded_tools)

        for tool_name in [*MINIMUM_TOOLS, *role_cfg.required_tools, *tools]:
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
            name=name,
            tools=final_tools,
            write_dirs=write_dirs,
        )

        child = AgentClass(uuid=agent_uuid, config=config)

        registered = False
        connected = False
        started = False

        try:
            agent.add_connection(agent_uuid)
            child.add_connection(agent.uuid)
            connected = True

            registry.register(child)
            registered = True

            child.start()
            started = True

            event_bus.emit(
                Event(
                    type=EventType.NODE_CONNECTED,
                    agent_id=agent.uuid,
                    data={"a": agent.uuid, "b": agent_uuid},
                )
            )

            if isinstance(task_prompt, str) and task_prompt != "":
                if not child.wait_until_idle(timeout=5.0):
                    raise TimeoutError(
                        "Spawned agent did not reach idle before task delivery"
                    )
                payload = send_message(agent, agent_uuid, task_prompt)
                if "error" in payload:
                    raise RuntimeError(str(payload["error"]))
        except Exception as exc:
            logger.exception(
                "Failed to spawn agent {} (role={}) by {}",
                agent_uuid[:8],
                role_name,
                agent.uuid[:8],
            )

            if started:
                child.terminate_and_wait(timeout=5.0)
            if registered:
                registry.unregister(agent_uuid)
            if connected:
                agent.remove_connection(agent_uuid)
                child.remove_connection(agent.uuid)

            return json.dumps({"error": f"Failed to spawn agent: {exc}"})

        logger.info(
            "Spawned agent {} (role={}) by {}",
            agent_uuid[:8],
            role_name,
            agent.uuid[:8],
        )

        return json.dumps({"agent_id": agent_uuid, "role_name": role_name})

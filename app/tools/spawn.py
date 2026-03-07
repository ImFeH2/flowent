from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.models import Event, EventType, Message, NodeConfig, NodeType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class SpawnTool(Tool):
    name = "spawn"
    description = (
        "Create a new agent node with a specific role. "
        "This is a low-cost delegation mechanism: you may create specialized agents whenever parallelism or task handoff would help. "
        "The agent is created, connected to the spawner, and the task_prompt is sent as the first message."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "role_id": {
                "type": "string",
                "description": "ID of the Role to assign to the new agent",
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
                "description": "List of tool names to give the agent",
            },
            "write_dirs": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of directories the agent can write to",
            },
        },
        "required": ["role_id", "task_prompt"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.agent import Agent as AgentClass
        from app.events import event_bus
        from app.registry import registry
        from app.settings import find_role, get_settings

        role_id = args["role_id"]
        task_prompt = args["task_prompt"]
        name = args.get("name")
        tools = args.get("tools", [])
        write_dirs = args.get("write_dirs", [])

        settings = get_settings()
        role_cfg = find_role(settings, role_id)
        if role_cfg is None:
            return json.dumps({"error": f"Role '{role_id}' not found"})

        agent_uuid = str(uuid.uuid4())
        config = NodeConfig(
            node_type=NodeType.AGENT,
            role_id=role_id,
            name=name,
            tools=tools,
            write_dirs=write_dirs,
        )

        child = AgentClass(uuid=agent_uuid, config=config)
        msg = Message(from_id=agent.uuid, to_id=agent_uuid, content=task_prompt)

        registered = False
        connected = False
        started = False

        try:
            child.enqueue_message(msg)

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
        except Exception as exc:
            logger.exception(
                "Failed to spawn agent {} (role={}) by {}",
                agent_uuid[:8],
                role_id,
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
            role_id,
            agent.uuid[:8],
        )

        return json.dumps({"agent_id": agent_uuid, "role_id": role_id})

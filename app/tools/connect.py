from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.models import Event, EventType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class ConnectTool(Tool):
    name = "connect"
    description = (
        "Establish a bidirectional connection between two nodes. "
        "The caller must be one of the two nodes or connected to at least one of them."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "agent_a": {
                "type": "string",
                "description": "UUID of the first node",
            },
            "agent_b": {
                "type": "string",
                "description": "UUID of the second node",
            },
        },
        "required": ["agent_a", "agent_b"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.events import event_bus
        from app.registry import registry

        agent_a_id = args["agent_a"]
        agent_b_id = args["agent_b"]

        caller = agent.uuid
        if (
            caller != agent_a_id
            and caller != agent_b_id
            and not agent.is_connected_to(agent_a_id)
            and not agent.is_connected_to(agent_b_id)
        ):
            return json.dumps(
                {"error": "Permission denied: not connected to either node"}
            )

        node_a = registry.get(agent_a_id)
        if node_a is None:
            return json.dumps({"error": f"Node '{agent_a_id}' not found"})

        node_b = registry.get(agent_b_id)
        if node_b is None:
            return json.dumps({"error": f"Node '{agent_b_id}' not found"})

        node_a.add_connection(agent_b_id)
        node_b.add_connection(agent_a_id)

        event_bus.emit(
            Event(
                type=EventType.NODE_CONNECTED,
                agent_id=caller,
                data={"a": agent_a_id, "b": agent_b_id},
            )
        )

        return json.dumps({"status": "connected", "a": agent_a_id, "b": agent_b_id})
